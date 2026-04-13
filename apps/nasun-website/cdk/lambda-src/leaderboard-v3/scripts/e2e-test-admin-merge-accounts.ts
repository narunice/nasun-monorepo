/**
 * E2E test for admin-merge-accounts handler.
 *
 * Seeds isolated test fixtures in dev DynamoDB, replicates the handler's
 * core orchestration, and verifies behavior across happy path + edge cases.
 *
 * Usage:
 *   AWS_REGION=ap-northeast-2 npx tsx scripts/e2e-test-admin-merge-accounts.ts
 *   CLEANUP_ONLY=1 AWS_REGION=ap-northeast-2 npx tsx scripts/e2e-test-admin-merge-accounts.ts
 *
 * IMPORTANT: this script targets the DEV account (__AWS_DEV_ACCOUNT__).
 * All test entities are prefixed with "e2e-merge-" for safe cleanup.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  buildSeasonAccountKey,
  getAccountById,
  getActiveSeason,
} from '../src/services/dynamodb-client';
import { calculateScoreComponents } from '../src/services/score-calculator';
import type { Account, Post, SeasonAccountScore } from '../src/types';

const POSTS_TABLE =
  process.env.LEADERBOARD_V3_POSTS_TABLE || 'leaderboard-v3-posts';
const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || 'leaderboard-v3-accounts';
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || 'leaderboard-v3-season-accounts';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TEST_PREFIX = 'e2e-merge-';
const createdAccountIds: string[] = [];
const createdPostIds: string[] = [];
const createdSeasonKeys: Array<{ pk: string; sk: string }> = [];
let createdSeasonId: string | null = null;

const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || 'leaderboard-v3-seasons';

// ============================================
// Core logic replicated from admin-merge-accounts.ts handler
// ============================================

const HARD_GUARD = 10000;
const CHUNK = 25;

async function queryAllPostsByAccount(accountId: string): Promise<Post[]> {
  const posts: Post[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: POSTS_TABLE,
        IndexName: 'createdAt-index',
        KeyConditionExpression: 'accountId = :aid',
        ExpressionAttributeValues: { ':aid': accountId },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (result.Items) posts.push(...(result.Items as Post[]));
    if (posts.length > HARD_GUARD) throw new Error('overLimit');
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return posts;
}

async function rewritePostAccountIds(
  postIds: string[],
  from: string,
  to: string
): Promise<{ rewritten: number; skipped: number }> {
  let rewritten = 0;
  let skipped = 0;
  for (let i = 0; i < postIds.length; i += CHUNK) {
    const chunk = postIds.slice(i, i + CHUNK);
    const results = await Promise.all(
      chunk.map((postId) =>
        docClient
          .send(
            new UpdateCommand({
              TableName: POSTS_TABLE,
              Key: { postId },
              UpdateExpression: 'SET accountId = :to',
              ConditionExpression: 'accountId = :from',
              ExpressionAttributeValues: { ':to': to, ':from': from },
            })
          )
          .then(() => 'rw' as const)
          .catch((e: unknown) => {
            if ((e as { name?: string })?.name === 'ConditionalCheckFailedException')
              return 'skip' as const;
            throw e;
          })
      )
    );
    for (const r of results) r === 'rw' ? rewritten++ : skipped++;
  }
  return { rewritten, skipped };
}

async function recomputeToSeasonScore(params: {
  toAccountId: string;
  seasonId: string;
  toAccount: Account;
  preservedAdjustment: number;
}): Promise<SeasonAccountScore | null> {
  const { toAccountId, seasonId, toAccount, preservedAdjustment } = params;
  const allPosts = await queryAllPostsByAccount(toAccountId);
  const seasonPosts = allPosts.filter((p) => p.seasonId === seasonId);
  const key = buildSeasonAccountKey(seasonId, toAccountId);

  if (seasonPosts.length === 0) {
    await docClient.send(new DeleteCommand({ TableName: SEASON_ACCOUNTS_TABLE, Key: key }));
    return null;
  }

  let totalPostScore = 0;
  let originalPostCount = 0,
    originalTotalScore = 0;
  let quotePostCount = 0,
    quoteTotalScore = 0;
  let replyPostCount = 0,
    replyTotalScore = 0;
  let signalCountTotal = 0;
  const dates = new Set<string>();
  let lastSeenAt = seasonPosts[0].createdAt;
  let firstSeenAt = toAccount.firstSeenAt || seasonPosts[0].createdAt;

  for (const p of seasonPosts) {
    totalPostScore += p.postScore;
    signalCountTotal += (p.contentSignals || []).filter(
      (s) => s === 'insight' || s === 'creative' || s === 'high_reach'
    ).length;
    const t = p.postType || 'original';
    if (t === 'original') {
      originalPostCount++;
      originalTotalScore += p.postScore;
    } else if (t === 'quote') {
      quotePostCount++;
      quoteTotalScore += p.postScore;
    } else {
      replyPostCount++;
      replyTotalScore += p.postScore;
    }
    dates.add(p.createdAt.slice(0, 10));
    if (p.createdAt > lastSeenAt) lastSeenAt = p.createdAt;
    if (p.createdAt < firstSeenAt) firstSeenAt = p.createdAt;
  }

  const activeDates = Array.from(dates).sort();
  const uniqueActiveDays = activeDates.length;
  const postCount = seasonPosts.length;
  const computed = calculateScoreComponents({
    totalPostScore,
    postCount,
    uniqueActiveDays,
    lastSeenAt,
    originalPostCount,
    originalTotalScore,
    quotePostCount,
    quoteTotalScore,
    replyPostCount,
    replyTotalScore,
    adjustmentTotalScore: preservedAdjustment,
  });

  const record: SeasonAccountScore = {
    pk: key.pk,
    sk: key.sk,
    accountId: toAccountId,
    seasonId,
    username: toAccount.username,
    originalUsername: toAccount.originalUsername,
    platform: toAccount.platform,
    language: toAccount.language,
    followerCount: toAccount.followerCount,
    totalPostScore,
    postCount,
    signalCountTotal,
    uniqueActiveDays,
    activeDates,
    originalPostCount,
    originalTotalScore,
    quotePostCount,
    quoteTotalScore,
    replyPostCount,
    replyTotalScore,
    adjustmentTotalScore: preservedAdjustment || undefined,
    userScore: computed.userScore,
    rawScore: computed.rawScore,
    consistencyBonus: computed.consistencyBonus,
    freshnessMultiplier: computed.freshnessMultiplier,
    displayName: toAccount.displayName,
    profileImageUrl: toAccount.profileImageUrl,
    isRegistered: toAccount.isRegistered ?? false,
    isTelegramMember: toAccount.isTelegramMember ?? false,
    firstSeenAt,
    lastSeenAt,
  };
  await docClient.send(new PutCommand({ TableName: SEASON_ACCOUNTS_TABLE, Item: record }));
  return record;
}

/**
 * Handler core orchestration replica. Returns status + payload for assertions.
 */
async function merge(
  fromAccountId: string,
  toAccountId: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (fromAccountId === toAccountId) {
    return { status: 400, body: { error: 'fromAccountId and toAccountId must differ' } };
  }
  const [from, to] = await Promise.all([
    getAccountById(fromAccountId),
    getAccountById(toAccountId),
  ]);
  if (!from) return { status: 404, body: { error: `from not found: ${fromAccountId}` } };
  if (!to) return { status: 404, body: { error: `to not found: ${toAccountId}` } };
  if (from.platform !== to.platform)
    return {
      status: 400,
      body: { error: `platform mismatch: ${from.platform} vs ${to.platform}` },
    };
  if (from.mergedInto)
    return { status: 409, body: { error: 'from already merged', mergedInto: from.mergedInto } };
  if (to.mergedInto)
    return { status: 409, body: { error: 'to is a tombstone', mergedInto: to.mergedInto } };

  const active = await getActiveSeason();
  if (!active) return { status: 409, body: { error: 'No active season' } };

  const fromPosts = await queryAllPostsByAccount(fromAccountId);
  const { rewritten, skipped } = await rewritePostAccountIds(
    fromPosts.map((p) => p.postId),
    fromAccountId,
    toAccountId
  );

  await docClient.send(
    new DeleteCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: buildSeasonAccountKey(active.seasonId, fromAccountId),
    })
  );

  const newToScore = await recomputeToSeasonScore({
    toAccountId,
    seasonId: active.seasonId,
    toAccount: to,
    preservedAdjustment: to.adjustmentTotalScore || 0,
  });

  const mergedAt = new Date().toISOString();
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ACCOUNTS_TABLE,
        Key: { accountId: fromAccountId },
        UpdateExpression: 'SET mergedInto = :to, mergedAt = :at',
        ConditionExpression: 'attribute_not_exists(mergedInto)',
        ExpressionAttributeValues: { ':to': toAccountId, ':at': mergedAt },
      })
    );
  } catch (e: unknown) {
    if ((e as { name?: string })?.name !== 'ConditionalCheckFailedException') throw e;
  }

  return {
    status: 200,
    body: {
      success: true,
      postsRewritten: rewritten,
      postsAlreadyRewritten: skipped,
      lostAdjustment: from.adjustmentTotalScore || 0,
      toScore: newToScore
        ? {
            totalPostScore: newToScore.totalPostScore,
            postCount: newToScore.postCount,
            userScore: newToScore.userScore,
          }
        : null,
    },
  };
}

// ============================================
// Fixture helpers
// ============================================

async function putAccount(overrides: Partial<Account> = {}): Promise<Account> {
  const accountId = TEST_PREFIX + uuidv4();
  const now = new Date().toISOString();
  const account: Account = {
    accountId,
    platform: 'twitter',
    username: TEST_PREFIX + Math.random().toString(36).slice(2, 8),
    originalUsername: undefined,
    lastKnownRole: 'default',
    followerCount: 100,
    language: 'en',
    displayName: 'E2E Test User',
    profileImageUrl: undefined,
    isRegistered: false,
    totalPostScore: 0,
    postCount: 0,
    signalCountTotal: 0,
    uniqueActiveDays: 0,
    activeDates: [],
    originalPostCount: 0,
    originalTotalScore: 0,
    quotePostCount: 0,
    quoteTotalScore: 0,
    replyPostCount: 0,
    replyTotalScore: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    ...overrides,
    accountId, // force
  };
  await docClient.send(new PutCommand({ TableName: ACCOUNTS_TABLE, Item: account }));
  createdAccountIds.push(accountId);
  return account;
}

async function putPost(accountId: string, seasonId: string, overrides: Partial<Post> = {}): Promise<Post> {
  const postId = TEST_PREFIX + uuidv4();
  const post: Post = {
    postId,
    platform: 'twitter',
    postUrl: `https://x.com/test/status/${postId}`,
    postUrlRaw: `https://x.com/test/status/${postId}`,
    accountId,
    username: 'test_user',
    accountRole: 'default',
    contentSignals: ['standard'],
    postType: 'original',
    baseScore: 1.0,
    postTypeMultiplier: 1.0,
    roleMultiplier: 1.0,
    signalBonus: 0,
    postScore: 1.0,
    createdAt: new Date().toISOString(),
    createdBy: 'e2e-test',
    seasonId,
    ...overrides,
    postId, // force
    accountId, // force
  };
  await docClient.send(new PutCommand({ TableName: POSTS_TABLE, Item: post }));
  createdPostIds.push(postId);
  return post;
}

async function putSeasonAccountScore(accountId: string, seasonId: string): Promise<void> {
  const key = buildSeasonAccountKey(seasonId, accountId);
  createdSeasonKeys.push(key);
  // A zero-state record; the merge recompute will overwrite
  await docClient.send(
    new PutCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Item: {
        ...key,
        accountId,
        seasonId,
        username: 'test',
        platform: 'twitter',
        totalPostScore: 0,
        postCount: 0,
        signalCountTotal: 0,
        uniqueActiveDays: 0,
        activeDates: [],
        originalPostCount: 0,
        originalTotalScore: 0,
        quotePostCount: 0,
        quoteTotalScore: 0,
        replyPostCount: 0,
        replyTotalScore: 0,
        userScore: 0,
        rawScore: 0,
        consistencyBonus: 1,
        freshnessMultiplier: 1,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    })
  );
}

async function createTestSeason(): Promise<string> {
  const seasonId = TEST_PREFIX + 'season-' + uuidv4().slice(0, 8);
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: SEASONS_TABLE,
      Item: {
        seasonId,
        sk: 'METADATA',
        name: 'E2E Test Season',
        description: 'Temporary season for admin-merge-accounts E2E test',
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        createdAt: now,
        updatedAt: now,
        createdBy: 'e2e-test',
        isDefault: false,
        totalAccounts: 0,
        totalPosts: 0,
      },
    })
  );
  createdSeasonId = seasonId;
  return seasonId;
}

async function deleteTestSeason(): Promise<void> {
  if (!createdSeasonId) return;
  await docClient
    .send(
      new DeleteCommand({
        TableName: SEASONS_TABLE,
        Key: { seasonId: createdSeasonId, sk: 'METADATA' },
      })
    )
    .catch(() => {});
}

async function cleanup(): Promise<void> {
  console.log(
    `[CLEANUP] Removing ${createdAccountIds.length} accounts, ${createdPostIds.length} posts, ${createdSeasonKeys.length} season-accounts...`
  );
  await Promise.all(
    createdPostIds.map((postId) =>
      docClient
        .send(new DeleteCommand({ TableName: POSTS_TABLE, Key: { postId } }))
        .catch(() => {})
    )
  );
  await Promise.all(
    createdAccountIds.map((accountId) =>
      docClient
        .send(new DeleteCommand({ TableName: ACCOUNTS_TABLE, Key: { accountId } }))
        .catch(() => {})
    )
  );
  await Promise.all(
    createdSeasonKeys.map((key) =>
      docClient
        .send(new DeleteCommand({ TableName: SEASON_ACCOUNTS_TABLE, Key: key }))
        .catch(() => {})
    )
  );
  await deleteTestSeason();
  console.log('[CLEANUP] Done.');
}

async function bulkScanAndCleanupPrefix(): Promise<void> {
  // Scan-and-clean leftover fixtures from prior aborted runs.
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const tables: Array<{ name: string; keyField: string }> = [
    { name: POSTS_TABLE, keyField: 'postId' },
    { name: ACCOUNTS_TABLE, keyField: 'accountId' },
  ];
  for (const t of tables) {
    let lastKey: Record<string, unknown> | undefined;
    do {
      const r = await docClient.send(
        new ScanCommand({
          TableName: t.name,
          FilterExpression: 'begins_with(#k, :p)',
          ExpressionAttributeNames: { '#k': t.keyField },
          ExpressionAttributeValues: { ':p': TEST_PREFIX },
          ExclusiveStartKey: lastKey,
        })
      );
      for (const item of r.Items || []) {
        await docClient.send(
          new DeleteCommand({ TableName: t.name, Key: { [t.keyField]: item[t.keyField] } })
        );
      }
      lastKey = r.LastEvaluatedKey;
    } while (lastKey);
  }
  // Season accounts: scan by pk containing a test accountId — trickier. Skip; they'll stay orphaned but keyed under deleted accountIds.
}

// ============================================
// Assertions
// ============================================

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function assertEq<T>(label: string, actual: T, expected: T): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ ${label}`);
    passCount++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
    failures.push(label);
    failCount++;
  }
}

function assertApproxEq(label: string, actual: number, expected: number, eps = 0.01): void {
  if (Math.abs(actual - expected) < eps) {
    console.log(`  ✓ ${label} (${actual.toFixed(3)} ≈ ${expected.toFixed(3)})`);
    passCount++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`    expected: ${expected.toFixed(3)}, actual: ${actual.toFixed(3)}`);
    failures.push(label);
    failCount++;
  }
}

// ============================================
// Test cases
// ============================================

async function testHappyPath(seasonId: string): Promise<void> {
  console.log('\n[TEST] Happy path: merge B(1 post) into A(3 posts)');
  const a = await putAccount({ username: 'e2e_a_' + uuidv4().slice(0, 6) });
  const b = await putAccount({ username: 'e2e_b_' + uuidv4().slice(0, 6) });
  await putPost(a.accountId, seasonId);
  await putPost(a.accountId, seasonId);
  await putPost(a.accountId, seasonId);
  await putPost(b.accountId, seasonId);
  await putSeasonAccountScore(a.accountId, seasonId);
  await putSeasonAccountScore(b.accountId, seasonId);

  const res = await merge(b.accountId, a.accountId);
  assertEq('HTTP 200', res.status, 200);
  const body = res.body as Record<string, unknown>;
  assertEq('postsRewritten=1', body.postsRewritten, 1);
  assertEq('postsAlreadyRewritten=0', body.postsAlreadyRewritten, 0);
  const toScore = body.toScore as { postCount: number; totalPostScore: number };
  assertEq('to postCount=4', toScore.postCount, 4);
  assertApproxEq('to totalPostScore=4.0', toScore.totalPostScore, 4.0);

  // Verify B tombstone
  const bAfter = await getAccountById(b.accountId);
  assertEq('B mergedInto=A', bAfter?.mergedInto, a.accountId);
  assertEq('B mergedAt set', typeof bAfter?.mergedAt, 'string');

  // Verify posts
  const aPosts = await queryAllPostsByAccount(a.accountId);
  assertEq('A now has 4 posts', aPosts.length, 4);
  const bPosts = await queryAllPostsByAccount(b.accountId);
  assertEq('B has 0 posts post-merge', bPosts.length, 0);

  // Verify from's SeasonAccountScore deleted
  const bSeason = await docClient.send(
    new GetCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: buildSeasonAccountKey(seasonId, b.accountId),
    })
  );
  assertEq('B SeasonAccountScore deleted', bSeason.Item, undefined);
}

async function testPreconditionSameId(): Promise<void> {
  console.log('\n[TEST] Precondition: from === to');
  const a = await putAccount();
  const res = await merge(a.accountId, a.accountId);
  assertEq('HTTP 400', res.status, 400);
}

async function testPreconditionNotFound(): Promise<void> {
  console.log('\n[TEST] Precondition: non-existent accounts');
  const a = await putAccount();
  let res = await merge('nonexistent-from', a.accountId);
  assertEq('missing from → 404', res.status, 404);
  res = await merge(a.accountId, 'nonexistent-to');
  assertEq('missing to → 404', res.status, 404);
}

async function testPreconditionPlatformMismatch(): Promise<void> {
  console.log('\n[TEST] Precondition: platform mismatch');
  const a = await putAccount({ platform: 'twitter' });
  const b = await putAccount({ platform: 'discord' });
  const res = await merge(a.accountId, b.accountId);
  assertEq('HTTP 400 on mismatch', res.status, 400);
}

async function testPreconditionFromAlreadyMerged(seasonId: string): Promise<void> {
  console.log('\n[TEST] Precondition: from already merged');
  const a = await putAccount();
  const b = await putAccount();
  const c = await putAccount();
  // Pre-flag B as merged
  await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId: b.accountId },
      UpdateExpression: 'SET mergedInto = :t, mergedAt = :a',
      ExpressionAttributeValues: { ':t': c.accountId, ':a': new Date().toISOString() },
    })
  );
  const res = await merge(b.accountId, a.accountId);
  assertEq('HTTP 409 on already-merged from', res.status, 409);
}

async function testPreconditionToAlreadyMerged(): Promise<void> {
  console.log('\n[TEST] Precondition: to is tombstone');
  const a = await putAccount();
  const b = await putAccount();
  const c = await putAccount();
  await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId: b.accountId },
      UpdateExpression: 'SET mergedInto = :t, mergedAt = :a',
      ExpressionAttributeValues: { ':t': c.accountId, ':a': new Date().toISOString() },
    })
  );
  const res = await merge(a.accountId, b.accountId);
  assertEq('HTTP 409 on tombstone to', res.status, 409);
}

async function testIdempotency(seasonId: string): Promise<void> {
  console.log('\n[TEST] Idempotency: run merge twice');
  const a = await putAccount();
  const b = await putAccount();
  await putPost(a.accountId, seasonId);
  await putPost(b.accountId, seasonId);
  await putSeasonAccountScore(a.accountId, seasonId);
  await putSeasonAccountScore(b.accountId, seasonId);

  const res1 = await merge(b.accountId, a.accountId);
  assertEq('first merge 200', res1.status, 200);
  assertEq('first rewritten=1', (res1.body as Record<string, unknown>).postsRewritten, 1);

  const res2 = await merge(b.accountId, a.accountId);
  assertEq('second merge 409 (from already merged)', res2.status, 409);

  // Idempotency from the perspective of a retry *mid-execution* would hit
  // different paths. Here we verify: once complete, re-invoking is safe no-op.
  const aPosts = await queryAllPostsByAccount(a.accountId);
  assertEq('A still has 2 posts after double merge', aPosts.length, 2);
}

async function testEmptyFromPosts(seasonId: string): Promise<void> {
  console.log('\n[TEST] Edge: from has no posts');
  const a = await putAccount();
  const b = await putAccount();
  await putPost(a.accountId, seasonId);
  await putSeasonAccountScore(a.accountId, seasonId);

  const res = await merge(b.accountId, a.accountId);
  assertEq('merge with empty from → 200', res.status, 200);
  assertEq('rewritten=0', (res.body as Record<string, unknown>).postsRewritten, 0);

  const bAfter = await getAccountById(b.accountId);
  assertEq('B still flagged mergedInto', bAfter?.mergedInto, a.accountId);
}

async function testAdjustmentLost(seasonId: string): Promise<void> {
  console.log('\n[TEST] Edge: from.adjustmentTotalScore is lost, to.adjustmentTotalScore preserved');
  const a = await putAccount({ adjustmentTotalScore: 10 });
  const b = await putAccount({ adjustmentTotalScore: 5 });
  await putPost(a.accountId, seasonId);
  await putPost(b.accountId, seasonId);
  await putSeasonAccountScore(a.accountId, seasonId);
  await putSeasonAccountScore(b.accountId, seasonId);

  const res = await merge(b.accountId, a.accountId);
  assertEq('merge 200', res.status, 200);
  assertEq('lostAdjustment=5 (from)', (res.body as Record<string, unknown>).lostAdjustment, 5);

  const aSeason = await docClient.send(
    new GetCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: buildSeasonAccountKey(seasonId, a.accountId),
    })
  );
  assertEq('to preserved adjustmentTotalScore=10', aSeason.Item?.adjustmentTotalScore, 10);
}

async function testMultiSeasonPosts(seasonId: string): Promise<void> {
  console.log('\n[TEST] Edge: posts spanning multiple seasons (only active recomputed)');
  const a = await putAccount();
  const b = await putAccount();

  // Active season posts
  await putPost(a.accountId, seasonId);
  await putPost(b.accountId, seasonId);
  // Past-season posts (different seasonId) — should still be rewritten (Posts.accountId)
  // but NOT affect the active-season recompute
  await putPost(b.accountId, 'PAST_SEASON');

  await putSeasonAccountScore(a.accountId, seasonId);
  await putSeasonAccountScore(b.accountId, seasonId);

  const res = await merge(b.accountId, a.accountId);
  assertEq('merge 200', res.status, 200);
  assertEq('rewritten=2 (all posts across seasons)', (res.body as Record<string, unknown>).postsRewritten, 2);

  // After merge, A has 1 active-season + 1 past-season (from B)
  const aPosts = await queryAllPostsByAccount(a.accountId);
  assertEq('A total posts=3', aPosts.length, 3);
  const aActivePosts = aPosts.filter((p) => p.seasonId === seasonId);
  assertEq('A active-season posts=2', aActivePosts.length, 2);

  const aSeason = await docClient.send(
    new GetCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: buildSeasonAccountKey(seasonId, a.accountId),
    })
  );
  assertEq('A active SeasonAccountScore.postCount=2', aSeason.Item?.postCount, 2);
}

async function testScoreCorrectness(seasonId: string): Promise<void> {
  console.log('\n[TEST] Score correctness: userScore matches calculateScoreComponents');
  const a = await putAccount();
  const b = await putAccount();
  // A: 2 posts, score 1.5 each
  await putPost(a.accountId, seasonId, { postScore: 1.5, contentSignals: ['standard', 'insight'] });
  await putPost(a.accountId, seasonId, { postScore: 1.5, contentSignals: ['standard'] });
  // B: 1 post, score 2.0, different type
  await putPost(b.accountId, seasonId, { postScore: 2.0, postType: 'quote' });

  await putSeasonAccountScore(a.accountId, seasonId);
  await putSeasonAccountScore(b.accountId, seasonId);

  const res = await merge(b.accountId, a.accountId);
  const body = res.body as Record<string, unknown>;
  const toScore = body.toScore as { postCount: number; totalPostScore: number; userScore: number };
  assertEq('postCount=3', toScore.postCount, 3);
  assertApproxEq('totalPostScore=5.0', toScore.totalPostScore, 5.0);
  assertEq('userScore > 0', toScore.userScore > 0, true);

  // Verify against calculateScoreComponents
  const expected = calculateScoreComponents({
    totalPostScore: 5.0,
    postCount: 3,
    uniqueActiveDays: 1,
    lastSeenAt: new Date().toISOString(),
    originalPostCount: 2,
    originalTotalScore: 3.0,
    quotePostCount: 1,
    quoteTotalScore: 2.0,
    replyPostCount: 0,
    replyTotalScore: 0,
  });
  assertApproxEq('userScore matches expected', toScore.userScore, expected.userScore, 0.1);
}

async function testNoPriorSeasonScore(seasonId: string): Promise<void> {
  console.log('\n[TEST] Edge: to had no prior SeasonAccountScore (new season for to)');
  const a = await putAccount();
  const b = await putAccount();
  await putPost(b.accountId, seasonId);
  // Intentionally NO prior SeasonAccountScore for A
  // B has one too
  await putSeasonAccountScore(b.accountId, seasonId);

  const res = await merge(b.accountId, a.accountId);
  assertEq('merge 200', res.status, 200);

  const aSeason = await docClient.send(
    new GetCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: buildSeasonAccountKey(seasonId, a.accountId),
    })
  );
  // After merge, B's post became A's → A should now have a SeasonAccountScore
  assertEq('A SeasonAccountScore created', aSeason.Item !== undefined, true);
  assertEq('A postCount=1', aSeason.Item?.postCount, 1);
  // Track for cleanup
  createdSeasonKeys.push(buildSeasonAccountKey(seasonId, a.accountId));
}

async function testDirectLambda401(): Promise<void> {
  console.log('\n[TEST] Deployed Lambda rejects unauthenticated call');
  const apiUrl =
    'https://ewjyu9feog.execute-api.ap-northeast-2.amazonaws.com/prod/v3/admin/merge-accounts';
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromAccountId: 'x', toAccountId: 'y' }),
    });
    assertEq('HTTP 401 without Bearer', response.status, 401);
  } catch (e) {
    console.log(`  ! fetch error (network): ${(e as Error).message} — skipping`);
  }
}

// ============================================
// Main
// ============================================

async function main() {
  if (process.env.CLEANUP_ONLY === '1') {
    console.log('[CLEANUP_ONLY] Scanning for leftover test fixtures...');
    await bulkScanAndCleanupPrefix();
    console.log('[DONE]');
    return;
  }

  console.log('='.repeat(60));
  console.log('E2E Test: admin-merge-accounts');
  console.log('='.repeat(60));

  // Ensure no existing active season conflicts
  const preExisting = await getActiveSeason();
  if (preExisting) {
    console.error(
      `FATAL: existing active season ${preExisting.seasonId} would conflict with test season. ` +
        `Pause/end it first, or run tests in a clean environment.`
    );
    process.exit(1);
  }

  const seasonId = await createTestSeason();
  console.log(`Created test season: ${seasonId}\n`);
  const activeSeason = await getActiveSeason();
  if (!activeSeason) {
    console.error('FATAL: createTestSeason did not propagate; aborting.');
    process.exit(1);
  }

  try {
    await testPreconditionSameId();
    await testPreconditionNotFound();
    await testPreconditionPlatformMismatch();
    await testPreconditionFromAlreadyMerged(activeSeason.seasonId);
    await testPreconditionToAlreadyMerged();
    await testHappyPath(activeSeason.seasonId);
    await testIdempotency(activeSeason.seasonId);
    await testEmptyFromPosts(activeSeason.seasonId);
    await testAdjustmentLost(activeSeason.seasonId);
    await testMultiSeasonPosts(activeSeason.seasonId);
    await testScoreCorrectness(activeSeason.seasonId);
    await testNoPriorSeasonScore(activeSeason.seasonId);
    await testDirectLambda401();
  } catch (e) {
    console.error('[FATAL] Unhandled error:', e);
    failures.push('Unhandled: ' + (e as Error).message);
    failCount++;
  } finally {
    await cleanup();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`PASS: ${passCount}  FAIL: ${failCount}`);
  if (failCount > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  } else {
    console.log('All assertions passed.');
  }
}

main().catch((e) => {
  console.error(e);
  cleanup().finally(() => process.exit(1));
});
