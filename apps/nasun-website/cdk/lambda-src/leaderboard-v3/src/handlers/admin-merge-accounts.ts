/**
 * Admin Merge Accounts Handler
 *
 * Merges `from` Account into `to` Account for handle-change/suspension recovery.
 *
 * Active-season only: rewrites Posts.accountId, recomputes `to`'s SeasonAccountScore,
 * deletes `from`'s SeasonAccountScore, sets `mergedInto`/`mergedAt` on `from`.
 * Past seasons and SNAPSHOTS_TABLE are never touched.
 *
 * Idempotency: natural via DynamoDB ConditionExpression
 *  - Posts rewrite: `accountId = :from` guard, CCFE on already-rewritten posts
 *  - from flagging: `attribute_not_exists(mergedInto)` guard
 *  - to recompute: deterministic (runs against current post state)
 *
 * Endpoint: POST /v3/admin/merge-accounts
 * Body: { fromAccountId, toAccountId }
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  buildSeasonAccountKey,
  getAccountById,
  getActiveSeason,
} from '../services/dynamodb-client';
import { calculateScoreComponents } from '../services/score-calculator';
import { Post, SeasonAccountScore } from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';
import { authenticateAdmin } from '../utils/admin-auth';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const POSTS_TABLE =
  process.env.LEADERBOARD_V3_POSTS_TABLE || 'nasun-leaderboard-v3-posts';
const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || 'nasun-leaderboard-v3-accounts';
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE ||
  'nasun-leaderboard-v3-season-accounts';

const HARD_GUARD_POST_LIMIT = 10000;
const UPDATE_CHUNK_SIZE = 25;

interface MergeRequest {
  fromAccountId: string;
  toAccountId: string;
}

function validateBody(body: unknown): {
  valid: boolean;
  data?: MergeRequest;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }
  const req = body as Record<string, unknown>;
  if (typeof req.fromAccountId !== 'string' || !req.fromAccountId.trim()) {
    return { valid: false, error: 'fromAccountId is required' };
  }
  if (typeof req.toAccountId !== 'string' || !req.toAccountId.trim()) {
    return { valid: false, error: 'toAccountId is required' };
  }
  return {
    valid: true,
    data: {
      fromAccountId: req.fromAccountId.trim(),
      toAccountId: req.toAccountId.trim(),
    },
  };
}

/**
 * Query all posts belonging to an accountId via `createdAt-index` (PK=accountId).
 * Returns early with `overLimit=true` if result exceeds HARD_GUARD_POST_LIMIT.
 */
async function queryAllPostsByAccount(
  accountId: string
): Promise<{ posts: Post[]; overLimit: boolean }> {
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

    if (result.Items) {
      posts.push(...(result.Items as Post[]));
      if (posts.length > HARD_GUARD_POST_LIMIT) {
        return { posts, overLimit: true };
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return { posts, overLimit: false };
}

/**
 * Rewrite accountId on a batch of posts.
 * Each UpdateItem is guarded by `ConditionExpression accountId = :from` so
 * a retry skips already-rewritten posts (CCFE is swallowed as idempotent success).
 */
async function rewritePostAccountIds(
  postIds: string[],
  fromAccountId: string,
  toAccountId: string
): Promise<{ rewritten: number; alreadyRewritten: number }> {
  let rewritten = 0;
  let alreadyRewritten = 0;

  for (let i = 0; i < postIds.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = postIds.slice(i, i + UPDATE_CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((postId) =>
        docClient
          .send(
            new UpdateCommand({
              TableName: POSTS_TABLE,
              Key: { postId },
              UpdateExpression: 'SET accountId = :to',
              ConditionExpression: 'accountId = :from',
              ExpressionAttributeValues: {
                ':to': toAccountId,
                ':from': fromAccountId,
              },
            })
          )
          .then(() => 'rewritten' as const)
          .catch((err: unknown) => {
            if (
              err &&
              typeof err === 'object' &&
              'name' in err &&
              (err as { name: string }).name === 'ConditionalCheckFailedException'
            ) {
              return 'skip' as const;
            }
            throw err;
          })
      )
    );
    for (const r of results) {
      if (r === 'rewritten') rewritten += 1;
      else alreadyRewritten += 1;
    }
  }

  return { rewritten, alreadyRewritten };
}

/**
 * Recompute `to`'s SeasonAccountScore for a given season from scratch.
 *
 * Queries all posts where `accountId = toAccountId` and filters to the given
 * season in-app, then rebuilds per-type aggregates + score components.
 * `adjustmentTotalScore` is preserved from `to`'s existing record (from's
 * adjustment is intentionally not merged — admins re-grant if needed).
 */
async function recomputeToSeasonScore(params: {
  toAccountId: string;
  seasonId: string;
  toAccount: {
    platform: string;
    username: string;
    originalUsername?: string;
    displayName?: string;
    profileImageUrl?: string;
    isRegistered?: boolean;
    isTelegramMember?: boolean;
    language?: string;
    followerCount?: number;
  };
  allToPosts: Post[];
  preservedAdjustment: number;
  preservedFirstSeenAt?: string;
}): Promise<SeasonAccountScore | null> {
  const {
    toAccountId,
    seasonId,
    toAccount,
    allToPosts,
    preservedAdjustment,
    preservedFirstSeenAt,
  } = params;

  const seasonPosts = allToPosts.filter((p) => p.seasonId === seasonId);

  const { pk, sk } = buildSeasonAccountKey(seasonId, toAccountId);

  if (seasonPosts.length === 0) {
    // Remove the SeasonAccountScore entirely: no posts this season.
    await docClient.send(
      new DeleteCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        Key: { pk, sk },
      })
    );
    return null;
  }

  // Aggregate
  let totalPostScore = 0;
  let originalPostCount = 0;
  let originalTotalScore = 0;
  let quotePostCount = 0;
  let quoteTotalScore = 0;
  let replyPostCount = 0;
  let replyTotalScore = 0;
  let signalCountTotal = 0;
  const activeDateSet = new Set<string>();
  let lastSeenAt = seasonPosts[0].createdAt;
  let firstSeenAt = preservedFirstSeenAt || seasonPosts[0].createdAt;

  for (const p of seasonPosts) {
    totalPostScore += p.postScore;
    signalCountTotal += (p.contentSignals || []).filter(
      (s) => s === 'insight' || s === 'creative' || s === 'high_reach'
    ).length;

    const type = p.postType || 'original';
    if (type === 'original') {
      originalPostCount += 1;
      originalTotalScore += p.postScore;
    } else if (type === 'quote') {
      quotePostCount += 1;
      quoteTotalScore += p.postScore;
    } else {
      replyPostCount += 1;
      replyTotalScore += p.postScore;
    }

    // activeDates uses YYYY-MM-DD of createdAt
    const dateKey = p.createdAt.slice(0, 10);
    activeDateSet.add(dateKey);

    if (p.createdAt > lastSeenAt) lastSeenAt = p.createdAt;
    if (p.createdAt < firstSeenAt) firstSeenAt = p.createdAt;
  }

  const activeDates = Array.from(activeDateSet).sort();
  const uniqueActiveDays = activeDates.length;
  const postCount = seasonPosts.length;

  const { rawScore, consistencyBonus, freshnessMultiplier, userScore } =
    calculateScoreComponents({
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
    pk,
    sk,
    accountId: toAccountId,
    seasonId,
    username: toAccount.username,
    originalUsername: toAccount.originalUsername,
    platform: toAccount.platform as SeasonAccountScore['platform'],
    language: toAccount.language as SeasonAccountScore['language'],
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
    userScore,
    rawScore,
    consistencyBonus,
    freshnessMultiplier,
    displayName: toAccount.displayName,
    profileImageUrl: toAccount.profileImageUrl,
    isRegistered: toAccount.isRegistered ?? false,
    isTelegramMember: toAccount.isTelegramMember ?? false,
    firstSeenAt,
    lastSeenAt,
  };

  await docClient.send(
    new PutCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Item: record,
    })
  );

  return record;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) =>
    createResponse(status, body, requestOrigin);

  if (event.httpMethod === 'OPTIONS') return respond(200, {});
  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const admin = await authenticateAdmin(event);
  if (!admin) return respond(401, { error: 'Unauthorized' });

  let body: unknown;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return respond(400, { error: 'Invalid JSON in request body' });
  }

  const validation = validateBody(body);
  if (!validation.valid || !validation.data) {
    return respond(400, { error: validation.error });
  }
  const { fromAccountId, toAccountId } = validation.data;

  if (fromAccountId === toAccountId) {
    return respond(400, { error: 'fromAccountId and toAccountId must differ' });
  }

  try {
    const [fromAccount, toAccount] = await Promise.all([
      getAccountById(fromAccountId),
      getAccountById(toAccountId),
    ]);

    if (!fromAccount) {
      return respond(404, { error: `from account not found: ${fromAccountId}` });
    }
    if (!toAccount) {
      return respond(404, { error: `to account not found: ${toAccountId}` });
    }
    if (fromAccount.platform !== toAccount.platform) {
      return respond(400, {
        error: `platform mismatch: ${fromAccount.platform} vs ${toAccount.platform}`,
      });
    }
    if (fromAccount.mergedInto) {
      return respond(409, {
        error: 'from account is already merged',
        mergedInto: fromAccount.mergedInto,
      });
    }
    if (toAccount.mergedInto) {
      return respond(409, {
        error: 'to account is already a merge tombstone',
        mergedInto: toAccount.mergedInto,
      });
    }

    const activeSeason = await getActiveSeason();
    if (!activeSeason) {
      return respond(409, { error: 'No active season' });
    }

    // 1. Collect from's posts (all seasons, not filtered — we need to rewrite all)
    const { posts: fromPosts, overLimit } = await queryAllPostsByAccount(fromAccountId);
    if (overLimit) {
      console.error(
        JSON.stringify({
          event: 'ADMIN_MERGE_ACCOUNTS_OVER_LIMIT',
          fromAccountId,
          toAccountId,
          fromPostCount: fromPosts.length,
          limit: HARD_GUARD_POST_LIMIT,
        })
      );
      return respond(500, {
        error: `from account has > ${HARD_GUARD_POST_LIMIT} posts; aborting`,
      });
    }

    // 2. Rewrite Posts.accountId from → to
    const { rewritten, alreadyRewritten } = await rewritePostAccountIds(
      fromPosts.map((p) => p.postId),
      fromAccountId,
      toAccountId
    );

    // 3. Delete from's active-season SeasonAccountScore (if exists)
    const fromSeasonKey = buildSeasonAccountKey(activeSeason.seasonId, fromAccountId);
    await docClient.send(
      new DeleteCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        Key: fromSeasonKey,
      })
    );

    // 4. Recompute to's active-season SeasonAccountScore from union of posts.
    //    We need all of to's current posts (which, post-rewrite, now include from's).
    const { posts: allToPosts, overLimit: toOverLimit } =
      await queryAllPostsByAccount(toAccountId);
    if (toOverLimit) {
      console.error(
        JSON.stringify({
          event: 'ADMIN_MERGE_ACCOUNTS_TO_OVER_LIMIT',
          toAccountId,
          toPostCount: allToPosts.length,
          limit: HARD_GUARD_POST_LIMIT,
        })
      );
      return respond(500, {
        error: `to account has > ${HARD_GUARD_POST_LIMIT} posts post-merge; aborting before recompute`,
      });
    }

    const newToScore = await recomputeToSeasonScore({
      toAccountId,
      seasonId: activeSeason.seasonId,
      toAccount: {
        platform: toAccount.platform,
        username: toAccount.username,
        originalUsername: toAccount.originalUsername,
        displayName: toAccount.displayName,
        profileImageUrl: toAccount.profileImageUrl,
        isRegistered: toAccount.isRegistered,
        isTelegramMember: toAccount.isTelegramMember,
        language: toAccount.language,
        followerCount: toAccount.followerCount,
      },
      allToPosts,
      preservedAdjustment: toAccount.adjustmentTotalScore || 0,
      preservedFirstSeenAt: toAccount.firstSeenAt,
    });

    // 5. Flag from as merged (CCFE-guarded)
    const mergedAt = new Date().toISOString();
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: ACCOUNTS_TABLE,
          Key: { accountId: fromAccountId },
          UpdateExpression: 'SET mergedInto = :to, mergedAt = :at',
          ConditionExpression: 'attribute_not_exists(mergedInto)',
          ExpressionAttributeValues: {
            ':to': toAccountId,
            ':at': mergedAt,
          },
        })
      );
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'name' in err &&
        (err as { name: string }).name === 'ConditionalCheckFailedException'
      ) {
        // Flagged by a concurrent call; treat as success with warning.
        console.warn(
          JSON.stringify({
            event: 'ADMIN_MERGE_ACCOUNTS_FLAG_RACE',
            fromAccountId,
            toAccountId,
          })
        );
      } else {
        throw err;
      }
    }

    const lostAdjustment = fromAccount.adjustmentTotalScore || 0;

    console.log(
      JSON.stringify({
        event: 'ADMIN_MERGE_ACCOUNTS',
        adminId: admin.identityId,
        adminEmail: admin.email,
        fromAccountId,
        toAccountId,
        activeSeasonId: activeSeason.seasonId,
        postsRewritten: rewritten,
        postsAlreadyRewritten: alreadyRewritten,
        lostAdjustment,
        toUserScore: newToScore?.userScore ?? 0,
        toRawScore: newToScore?.rawScore ?? 0,
        ts: mergedAt,
      })
    );

    return respond(200, {
      success: true,
      fromAccountId,
      toAccountId,
      mergedAt,
      activeSeasonId: activeSeason.seasonId,
      postsRewritten: rewritten,
      postsAlreadyRewritten: alreadyRewritten,
      lostAdjustment,
      toScore: newToScore
        ? {
            totalPostScore: newToScore.totalPostScore,
            postCount: newToScore.postCount,
            userScore: newToScore.userScore,
            rawScore: newToScore.rawScore,
          }
        : null,
    });
  } catch (err) {
    console.error('Admin Merge Accounts error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return respond(500, { error: message });
  }
};
