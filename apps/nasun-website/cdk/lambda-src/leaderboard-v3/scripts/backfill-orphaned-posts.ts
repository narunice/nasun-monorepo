/**
 * One-time backfill script: assigns orphaned posts (seasonId missing/None)
 * to the active season and updates SeasonAccountScore aggregates.
 *
 * These posts were registered before the season was activated, so they only
 * updated the cumulative Accounts table but skipped SeasonAccountScore.
 *
 * Usage:
 *   # Dry run (read-only, shows what would be done)
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod npx tsx scripts/backfill-orphaned-posts.ts
 *
 *   # Actual run
 *   AWS_REGION=ap-northeast-2 AWS_PROFILE=nasun-prod EXECUTE=1 npx tsx scripts/backfill-orphaned-posts.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  updateSeasonAccountAggregates,
  getActiveSeason,
  getAllAccounts,
} from '../src/services/dynamodb-client';
import { DYNAMO_KEYS } from '../src/types';
import type { Post } from '../src/types';

const EXECUTE = process.env.EXECUTE === '1';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const POSTS_TABLE = DYNAMO_KEYS.POSTS_TABLE;

async function scanAllPosts(): Promise<Post[]> {
  const posts: Post[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: POSTS_TABLE,
        ExclusiveStartKey: lastKey,
      })
    );
    posts.push(...((result.Items || []) as Post[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return posts;
}

async function updatePostSeasonId(postId: string, seasonId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
      UpdateExpression: 'SET seasonId = :sid',
      ExpressionAttributeValues: { ':sid': seasonId },
    })
  );
}

async function main() {
  console.log(`=== Orphaned Posts Backfill (${EXECUTE ? 'EXECUTE' : 'DRY RUN'}) ===\n`);

  // Get active season
  const season = await getActiveSeason();
  if (!season) {
    console.error('No active season found. Aborting.');
    process.exit(1);
  }

  const seasonId = season.seasonId;
  console.log(`Target season: ${season.name} (${seasonId})`);
  console.log(`Season period: ${season.startDate} ~ ${season.endDate}\n`);

  // Scan all posts
  console.log('Scanning all posts...');
  const allPosts = await scanAllPosts();
  console.log(`Total posts: ${allPosts.length}`);

  // Find orphaned posts (no seasonId)
  const orphanedPosts = allPosts.filter((p) => !p.seasonId);
  console.log(`Orphaned posts (no seasonId): ${orphanedPosts.length}\n`);

  if (orphanedPosts.length === 0) {
    console.log('No orphaned posts found. Done.');
    return;
  }

  // Build account lookup for profile info
  const allAccounts = await getAllAccounts();
  const accountMap = new Map(allAccounts.map((a) => [a.accountId, a]));

  // Group by account for readable output
  const byAccount = new Map<string, Post[]>();
  for (const post of orphanedPosts) {
    const key = post.username || post.accountId;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(post);
  }

  console.log('--- Orphaned Posts by Account ---');
  for (const [key, posts] of byAccount) {
    console.log(`  @${key}: ${posts.length} posts`);
    for (const p of posts) {
      console.log(`    - ${p.postId} | score: ${p.postScore} | type: ${p.postType} | ${p.createdAt}`);
    }
  }
  console.log('');

  if (!EXECUTE) {
    console.log('Dry run complete. Set EXECUTE=1 to apply changes.');
    return;
  }

  // Sort orphaned posts chronologically
  const sortedPosts = orphanedPosts.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let processed = 0;
  let errors = 0;

  for (const post of sortedPosts) {
    const account = accountMap.get(post.accountId);
    if (!account) {
      console.warn(`  WARN: No account found for ${post.accountId}, skipping post ${post.postId}`);
      errors++;
      continue;
    }

    const postDate = post.createdAt.split('T')[0];

    try {
      // 1. Update SeasonAccountScore aggregates
      await updateSeasonAccountAggregates({
        seasonId,
        accountId: account.accountId,
        username: account.username,
        originalUsername: account.originalUsername,
        platform: account.platform,
        postScoreToAdd: post.postScore,
        signalCountToAdd: post.contentSignals?.length || 0,
        todayDate: postDate,
        lastSeenAt: post.createdAt,
        displayName: account.displayName,
        profileImageUrl: account.profileImageUrl,
        isRegistered: account.isRegistered,
        isTelegramMember: account.isTelegramMember,
        postType: post.postType,
      });

      // 2. Update the post's seasonId
      await updatePostSeasonId(post.postId, seasonId);

      processed++;
      console.log(`  OK: @${post.username} post ${post.postId} (score: ${post.postScore})`);
    } catch (err) {
      errors++;
      console.error(`  ERROR: post ${post.postId}:`, err);
    }
  }

  console.log(`\nBackfill complete: ${processed} posts processed, ${errors} errors`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
