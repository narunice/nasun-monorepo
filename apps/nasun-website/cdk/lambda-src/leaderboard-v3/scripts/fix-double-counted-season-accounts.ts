/**
 * One-time fix script: corrects season-accounts records that were
 * double-counted due to both backfill scripts processing the same posts.
 *
 * Rebuilds season-accounts aggregates directly from the posts table
 * (source of truth) for affected users. Preserves adjustmentTotalScore,
 * displayName, profileImageUrl, isTelegramMember, and other metadata.
 *
 * DOES NOT touch the snapshots table. Only modifies season-accounts.
 *
 * Usage:
 *   # Dry run (shows before/after diff, no writes)
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/fix-double-counted-season-accounts.ts
 *
 *   # Actual run
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod EXECUTE=1 npx tsx scripts/fix-double-counted-season-accounts.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DYNAMO_KEYS } from '../src/types';
import type { Post, SeasonAccountScore } from '../src/types';
import { calculateScoreComponents, countBonusSignals } from '../src/services/score-calculator';

const EXECUTE = process.env.EXECUTE === '1';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const POSTS_TABLE = DYNAMO_KEYS.POSTS_TABLE;
const ACCOUNTS_TABLE = DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASON_ACCOUNTS_TABLE = DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
const SEASON_ID = 'SEASON1';

/**
 * Get all posts for a specific account in a specific season
 */
async function getSeasonPostsForAccount(accountId: string): Promise<Post[]> {
  const posts: Post[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: POSTS_TABLE,
        IndexName: DYNAMO_KEYS.POSTS_SEASON_INDEX,
        KeyConditionExpression: 'seasonId = :sid',
        FilterExpression: 'accountId = :aid',
        ExpressionAttributeValues: {
          ':sid': SEASON_ID,
          ':aid': accountId,
        },
        ExclusiveStartKey: lastKey,
      })
    );
    posts.push(...((result.Items || []) as Post[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return posts;
}

/**
 * Get existing season-accounts record
 */
async function getSeasonAccount(accountId: string): Promise<SeasonAccountScore | null> {
  const pk = `SEASON#${SEASON_ID}#ACCOUNT#${accountId}`;
  const result = await docClient.send(
    new GetCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: { pk, sk: 'SCORE' },
    })
  );
  return (result.Item as SeasonAccountScore) || null;
}

/**
 * Scan all season-accounts and all accounts, find mismatches
 */
async function findMismatchedAccounts(): Promise<Array<{ accountId: string; username: string; saPostCount: number; aPostCount: number }>> {
  // Scan season-accounts
  const saItems: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        FilterExpression: 'seasonId = :s',
        ExpressionAttributeValues: { ':s': SEASON_ID },
        ProjectionExpression: 'accountId, username, postCount',
        ExclusiveStartKey: lastKey,
      })
    );
    saItems.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // Scan accounts
  const aItems: Record<string, unknown>[] = [];
  lastKey = undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
        ProjectionExpression: 'accountId, postCount',
        ExclusiveStartKey: lastKey,
      })
    );
    aItems.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  const aMap = new Map(aItems.map((a) => [a.accountId as string, (a.postCount as number) || 0]));

  const mismatches: Array<{ accountId: string; username: string; saPostCount: number; aPostCount: number }> = [];
  for (const sa of saItems) {
    const accountId = sa.accountId as string;
    const saPC = (sa.postCount as number) || 0;
    const aPC = aMap.get(accountId) ?? 0;
    if (saPC !== aPC) {
      mismatches.push({
        accountId,
        username: (sa.username as string) || '?',
        saPostCount: saPC,
        aPostCount: aPC,
      });
    }
  }

  return mismatches;
}

/**
 * Rebuild season-accounts aggregates from posts
 */
function aggregateFromPosts(posts: Post[]): {
  postCount: number;
  totalPostScore: number;
  originalPostCount: number;
  originalTotalScore: number;
  quotePostCount: number;
  quoteTotalScore: number;
  replyPostCount: number;
  replyTotalScore: number;
  signalCountTotal: number;
  activeDates: string[];
  lastSeenAt: string;
  firstSeenAt: string;
} {
  let totalPostScore = 0;
  let originalPostCount = 0;
  let originalTotalScore = 0;
  let quotePostCount = 0;
  let quoteTotalScore = 0;
  let replyPostCount = 0;
  let replyTotalScore = 0;
  let signalCountTotal = 0;
  const activeDateSet = new Set<string>();
  let firstSeenAt = '';
  let lastSeenAt = '';

  for (const post of posts) {
    totalPostScore += post.postScore;
    signalCountTotal += countBonusSignals(post.contentSignals || []);

    const postDate = post.createdAt.split('T')[0];
    activeDateSet.add(postDate);

    if (!firstSeenAt || post.createdAt < firstSeenAt) firstSeenAt = post.createdAt;
    if (!lastSeenAt || post.createdAt > lastSeenAt) lastSeenAt = post.createdAt;

    switch (post.postType) {
      case 'original':
        originalPostCount++;
        originalTotalScore += post.postScore;
        break;
      case 'quote':
        quotePostCount++;
        quoteTotalScore += post.postScore;
        break;
      case 'reply':
        replyPostCount++;
        replyTotalScore += post.postScore;
        break;
    }
  }

  const activeDates = Array.from(activeDateSet).sort();

  return {
    postCount: posts.length,
    totalPostScore,
    originalPostCount,
    originalTotalScore,
    quotePostCount,
    quoteTotalScore,
    replyPostCount,
    replyTotalScore,
    signalCountTotal,
    activeDates,
    lastSeenAt: lastSeenAt || new Date().toISOString(),
    firstSeenAt: firstSeenAt || new Date().toISOString(),
  };
}

async function main() {
  console.log(`=== Fix Double-Counted Season Accounts (${EXECUTE ? 'EXECUTE' : 'DRY RUN'}) ===`);
  console.log(`Target season: ${SEASON_ID}\n`);

  // Auto-detect mismatched accounts
  console.log('Scanning for mismatched accounts...');
  const mismatches = await findMismatchedAccounts();

  if (mismatches.length === 0) {
    console.log('No mismatches found. All season-accounts match accounts table. Done.');
    return;
  }

  console.log(`Found ${mismatches.length} mismatched account(s):\n`);
  for (const m of mismatches) {
    console.log(`  @${m.username} (${m.accountId.slice(0, 8)}...): accounts=${m.aPostCount}, season-accounts=${m.saPostCount}, diff=+${m.saPostCount - m.aPostCount}`);
  }
  console.log('');

  // Fix each mismatched account
  let fixed = 0;
  let errors = 0;

  for (const mismatch of mismatches) {
    const { accountId, username } = mismatch;

    try {
      // 1. Get all posts for this account in SEASON1
      const posts = await getSeasonPostsForAccount(accountId);
      console.log(`--- @${username} ---`);
      console.log(`  Posts in ${SEASON_ID}: ${posts.length}`);

      if (posts.length === 0) {
        console.log('  WARN: No posts found, skipping');
        continue;
      }

      // 2. Rebuild aggregates from posts (source of truth)
      const agg = aggregateFromPosts(posts);

      // 3. Get existing season-accounts record to preserve metadata
      const existing = await getSeasonAccount(accountId);
      if (!existing) {
        console.log('  WARN: No season-accounts record found, skipping');
        continue;
      }

      // 4. Recalculate derived scores
      const { rawScore, consistencyBonus, freshnessMultiplier, userScore } = calculateScoreComponents({
        totalPostScore: agg.totalPostScore,
        postCount: agg.postCount,
        uniqueActiveDays: agg.activeDates.length,
        lastSeenAt: agg.lastSeenAt,
        originalPostCount: agg.originalPostCount,
        originalTotalScore: agg.originalTotalScore,
        quotePostCount: agg.quotePostCount,
        quoteTotalScore: agg.quoteTotalScore,
        replyPostCount: agg.replyPostCount,
        replyTotalScore: agg.replyTotalScore,
        adjustmentTotalScore: existing.adjustmentTotalScore,
      });

      // 5. Show diff
      console.log('  BEFORE:');
      console.log(`    postCount=${existing.postCount}, totalPostScore=${existing.totalPostScore.toFixed(3)}, userScore=${existing.userScore.toFixed(3)}`);
      console.log(`    reply=${existing.replyPostCount}/${existing.replyTotalScore.toFixed(3)}, original=${existing.originalPostCount}/${existing.originalTotalScore.toFixed(3)}, quote=${existing.quotePostCount}/${existing.quoteTotalScore.toFixed(3)}`);
      console.log('  AFTER:');
      console.log(`    postCount=${agg.postCount}, totalPostScore=${agg.totalPostScore.toFixed(3)}, userScore=${userScore.toFixed(3)}`);
      console.log(`    reply=${agg.replyPostCount}/${agg.replyTotalScore.toFixed(3)}, original=${agg.originalPostCount}/${agg.originalTotalScore.toFixed(3)}, quote=${agg.quotePostCount}/${agg.quoteTotalScore.toFixed(3)}`);

      if (!EXECUTE) {
        console.log('  [DRY RUN] Would update season-accounts\n');
        fixed++;
        continue;
      }

      // 6. Write corrected values (raw UpdateCommand SET, preserving metadata)
      const pk = `SEASON#${SEASON_ID}#ACCOUNT#${accountId}`;
      await docClient.send(
        new UpdateCommand({
          TableName: SEASON_ACCOUNTS_TABLE,
          Key: { pk, sk: 'SCORE' },
          UpdateExpression: `SET
            postCount = :postCount,
            totalPostScore = :totalPostScore,
            originalPostCount = :originalPostCount,
            originalTotalScore = :originalTotalScore,
            quotePostCount = :quotePostCount,
            quoteTotalScore = :quoteTotalScore,
            replyPostCount = :replyPostCount,
            replyTotalScore = :replyTotalScore,
            signalCountTotal = :signalCountTotal,
            activeDates = :activeDates,
            uniqueActiveDays = :uniqueActiveDays,
            firstSeenAt = :firstSeenAt,
            lastSeenAt = :lastSeenAt,
            userScore = :userScore,
            rawScore = :rawScore,
            consistencyBonus = :consistencyBonus,
            freshnessMultiplier = :freshnessMultiplier`,
          ExpressionAttributeValues: {
            ':postCount': agg.postCount,
            ':totalPostScore': agg.totalPostScore,
            ':originalPostCount': agg.originalPostCount,
            ':originalTotalScore': agg.originalTotalScore,
            ':quotePostCount': agg.quotePostCount,
            ':quoteTotalScore': agg.quoteTotalScore,
            ':replyPostCount': agg.replyPostCount,
            ':replyTotalScore': agg.replyTotalScore,
            ':signalCountTotal': agg.signalCountTotal,
            ':activeDates': agg.activeDates,
            ':uniqueActiveDays': agg.activeDates.length,
            ':firstSeenAt': agg.firstSeenAt,
            ':lastSeenAt': agg.lastSeenAt,
            ':userScore': userScore,
            ':rawScore': rawScore,
            ':consistencyBonus': consistencyBonus,
            ':freshnessMultiplier': freshnessMultiplier,
          },
        })
      );

      console.log('  UPDATED\n');
      fixed++;
    } catch (err) {
      console.error(`  ERROR for @${username}:`, err);
      errors++;
    }
  }

  console.log(`\n=== Complete: ${fixed} fixed, ${errors} errors ===`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
