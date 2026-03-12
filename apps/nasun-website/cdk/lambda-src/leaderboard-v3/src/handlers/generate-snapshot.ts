/**
 * Generate Snapshot Handler
 *
 * Creates daily leaderboard snapshots for the active season.
 * Triggered by EventBridge at 09:00 KST (00:00 UTC) daily.
 *
 * Also exposed as POST /v3/admin/snapshot for admin-triggered preview and generation.
 *
 * EventBridge invocation (existing behavior unchanged):
 *   - Reads dryRun / customDate from event payload (manual invoke)
 *   - Logs results, no JSON response
 *
 * API Gateway invocation (admin UI):
 *   - Requires Cognito admin auth (Authorization: Bearer <token>)
 *   - Body: { dryRun?: boolean, customDate?: string }
 *   - dryRun=true (default): returns top 50 preview as JSON, no DynamoDB writes
 *   - dryRun=false: checks idempotency, writes snapshot, returns result JSON
 */

import { ScheduledEvent, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DailySnapshot,
  Post,
  SeasonAccountScore,
  DYNAMO_KEYS,
  SCORE_CONSTANTS,
} from '../types';
import { getActiveSeason, getSeasonAccountScores, getBannedAccountIds, getPostsBySeasonId } from '../services/dynamodb-client';
import { calculateScoreComponents, calculateDecayedRawScoreFromPosts, calculateConsistencyBonus } from '../services/score-calculator';
import { getTodayDateString, getYesterdayDateString } from '../utils/date';
import { calculateRankChange } from '../utils/rank';
import { authenticateAdmin } from '../utils/admin-auth';
import { createResponse, getRequestOrigin } from '../utils/response';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const SNAPSHOTS_TABLE =
  process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || DYNAMO_KEYS.SNAPSHOTS_TABLE;
const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;

// TTL: 180 days in seconds (final snapshots are permanent)
const SNAPSHOT_TTL_DAYS = 180;

// Feature toggle: when true, uses post-based daily batch decay instead of cumulative decay
const ENABLE_BATCH_DECAY = process.env.ENABLE_BATCH_DECAY === 'true';

/**
 * Get previous day's snapshot for a season
 */
async function getPreviousDaySnapshot(
  seasonId: string,
  yesterdayDate: string
): Promise<Map<string, number>> {
  const pk = `${seasonId}#${yesterdayDate}`;
  const rankMap = new Map<string, number>();

  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': pk,
      },
    })
  );

  if (result.Items) {
    for (const item of result.Items) {
      const snapshot = item as DailySnapshot;
      rankMap.set(snapshot.accountId, snapshot.rank);
    }
  }

  return rankMap;
}

/**
 * Write snapshots in batches (DynamoDB limit: 25 items per batch)
 * Retries unprocessed items with exponential backoff.
 */
async function batchWriteSnapshots(snapshots: DailySnapshot[]): Promise<void> {
  const BATCH_SIZE = 25;
  const MAX_RETRIES = 3;

  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = snapshots.slice(i, i + BATCH_SIZE);
    let putRequests = batch.map((snapshot) => ({
      PutRequest: {
        Item: snapshot,
      },
    }));

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [SNAPSHOTS_TABLE]: putRequests,
          },
        })
      );

      const unprocessed = result.UnprocessedItems?.[SNAPSHOTS_TABLE];
      if (!unprocessed || unprocessed.length === 0) {
        break;
      }

      if (attempt === MAX_RETRIES) {
        console.error(`Failed to write ${unprocessed.length} items after ${MAX_RETRIES} retries`);
        throw new Error(`BatchWrite failed: ${unprocessed.length} unprocessed items after ${MAX_RETRIES} retries`);
      }

      console.warn(`Retry ${attempt + 1}/${MAX_RETRIES}: ${unprocessed.length} unprocessed items`);
      putRequests = unprocessed as typeof putRequests;
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
    }
  }
}

/**
 * Update season metadata with snapshot counts
 */
async function updateSeasonMetadata(
  seasonId: string,
  totalAccounts: number
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
      UpdateExpression: 'SET totalAccounts = :totalAccounts, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':totalAccounts': totalAccounts,
        ':updatedAt': new Date().toISOString(),
      },
    })
  );
}

/**
 * Recalculate user scores with current timestamp (for freshness multiplier)
 * Delegates to centralized calculateScoreComponents() in score-calculator.ts
 */
function recalculateUserScore(score: SeasonAccountScore, referenceDate?: Date): {
  userScore: number;
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
} {
  return calculateScoreComponents({
    totalPostScore: score.totalPostScore,
    postCount: score.postCount,
    uniqueActiveDays: score.uniqueActiveDays,
    lastSeenAt: score.lastSeenAt,
    originalPostCount: score.originalPostCount,
    originalTotalScore: score.originalTotalScore,
    quotePostCount: score.quotePostCount,
    quoteTotalScore: score.quoteTotalScore,
    replyPostCount: score.replyPostCount,
    replyTotalScore: score.replyTotalScore,
    adjustmentTotalScore: score.adjustmentTotalScore,
    referenceDate,
  });
}

/**
 * Check if a snapshot already exists for the given date.
 * Used for idempotency guard on admin-triggered generation.
 */
async function snapshotExistsForDate(seasonId: string, date: string): Promise<boolean> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `${seasonId}#${date}` },
      Limit: 1,
      Select: 'COUNT',
    })
  );
  return (result.Count ?? 0) > 0;
}

/**
 * Core snapshot calculation and generation logic.
 * Shared by both EventBridge and API Gateway invocation paths.
 */
async function runSnapshotCore(params: {
  customDate: string | undefined;
}): Promise<{
  seasonId: string;
  todayDate: string;
  filteredCount: number;
  snapshots: DailySnapshot[];
}> {
  const { customDate } = params;

  // Get active season
  const activeSeason = await getActiveSeason();
  if (!activeSeason) {
    throw new Error('No active season found');
  }

  console.log(`Generating snapshot for season: ${activeSeason.seasonId}`);

  // Get all season account scores
  const scores = await getSeasonAccountScores(activeSeason.seasonId);
  if (scores.length === 0) {
    throw new Error('No accounts found for this season');
  }

  // Filter banned accounts and records with missing username
  const bannedIds = await getBannedAccountIds();
  const filteredScores = scores.filter((score) => {
    if (!score.username) {
      console.warn(`Skipping score without username: accountId=${score.accountId}`);
      return false;
    }
    return !bannedIds.has(score.accountId);
  });

  console.log(
    `Found ${scores.length} accounts, ${scores.length - filteredScores.length} filtered (banned or missing username), ${filteredScores.length} included in snapshot`
  );

  // For custom date backfills, use the target date for freshness calculation
  const referenceDate = customDate
    ? new Date(customDate + 'T00:00:00+09:00')
    : undefined;

  // Recalculate scores and sort by userScore
  let scoredAccounts: (SeasonAccountScore & {
    userScore: number;
    rawScore: number;
    consistencyBonus: number;
    freshnessMultiplier: number;
  })[];

  if (ENABLE_BATCH_DECAY) {
    console.log('Batch decay enabled: querying posts for daily-scoped decay');
    const allPosts = await getPostsBySeasonId(activeSeason.seasonId);
    console.log(`Fetched ${allPosts.length} posts for batch decay calculation`);

    const postsByAccount = new Map<string, Post[]>();
    for (const post of allPosts) {
      const existing = postsByAccount.get(post.accountId);
      if (existing) {
        existing.push(post);
      } else {
        postsByAccount.set(post.accountId, [post]);
      }
    }

    scoredAccounts = filteredScores
      .map((score) => {
        const accountPosts = postsByAccount.get(score.accountId) || [];
        const decayedRawScore = calculateDecayedRawScoreFromPosts(accountPosts);
        const rawScore = decayedRawScore + (score.adjustmentTotalScore || 0);
        const consistencyBonus = calculateConsistencyBonus(score.uniqueActiveDays);

        const lastSeenDate = new Date(score.lastSeenAt);
        const refDate = referenceDate || new Date();
        const daysSinceLastPost = Math.max(
          0,
          Math.floor((refDate.getTime() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24))
        );
        const freshnessMultiplier = 1 / (1 + daysSinceLastPost / SCORE_CONSTANTS.FRESHNESS_HALF_LIFE_DAYS);
        const userScore = Math.max(0, rawScore * consistencyBonus * freshnessMultiplier);

        return {
          ...score,
          rawScore: Math.round(rawScore * 1000) / 1000,
          consistencyBonus: Math.round(consistencyBonus * 1000) / 1000,
          freshnessMultiplier: Math.round(freshnessMultiplier * 1000) / 1000,
          userScore: Math.round(userScore * 1000) / 1000,
        };
      })
      .sort((a, b) => b.userScore - a.userScore);
  } else {
    scoredAccounts = filteredScores
      .map((score) => ({
        ...score,
        ...recalculateUserScore(score, referenceDate),
      }))
      .sort((a, b) => b.userScore - a.userScore);
  }

  // Get previous day's ranks for rank change calculation
  const todayDate = customDate || getTodayDateString();
  const yesterdayDate = getYesterdayDateString(todayDate);
  const previousRanks = await getPreviousDaySnapshot(activeSeason.seasonId, yesterdayDate);

  if (customDate) {
    console.log(`Backfill mode: generating snapshot for ${customDate}`);
  }
  console.log(`Previous day snapshot has ${previousRanks.size} entries`);

  // Create snapshot entries (limit to top 2000)
  const MAX_SNAPSHOT_ENTRIES = 2000;
  const snapshotTime = customDate
    ? new Date(customDate + 'T00:00:00+09:00').toISOString()
    : new Date().toISOString();

  const isFinalSnapshot = todayDate >= activeSeason.endDate;
  const ttl = isFinalSnapshot
    ? undefined
    : Math.floor(Date.now() / 1000) + SNAPSHOT_TTL_DAYS * 24 * 60 * 60;

  if (isFinalSnapshot) {
    console.log(`Final snapshot detected (${todayDate} >= ${activeSeason.endDate}), TTL disabled for permanent storage`);
  }

  const snapshots: DailySnapshot[] = scoredAccounts
    .slice(0, MAX_SNAPSHOT_ENTRIES)
    .map((score, index) => {
      const rank = index + 1;
      const previousRank = previousRanks.get(score.accountId);
      const rankChange = calculateRankChange(rank, previousRank);

      const snapshot: DailySnapshot = {
        pk: `${activeSeason.seasonId}#${todayDate}`,
        sk: `RANK#${String(rank).padStart(4, '0')}`,
        accountId: score.accountId,
        username: score.username,
        originalUsername: score.originalUsername,
        platform: score.platform,
        userScore: score.userScore,
        rank,
        previousDayRank: previousRank,
        rankChange,
        totalPostScore: score.totalPostScore,
        postCount: score.postCount,
        uniqueActiveDays: score.uniqueActiveDays,
        rawScore: score.rawScore,
        consistencyBonus: score.consistencyBonus,
        freshnessMultiplier: score.freshnessMultiplier,
        displayName: score.displayName,
        profileImageUrl: score.profileImageUrl,
        isRegistered: score.isRegistered,
        isTelegramMember: score.isTelegramMember,
        snapshotDate: todayDate,
        snapshotTime,
      };

      if (ttl !== undefined) {
        snapshot.ttl = ttl;
      }

      return snapshot;
    });

  return {
    seasonId: activeSeason.seasonId,
    todayDate,
    filteredCount: filteredScores.length,
    snapshots,
  };
}

/**
 * Main handler - handles both EventBridge schedule and API Gateway (admin UI).
 */
export const handler = async (
  event: ScheduledEvent | APIGatewayProxyEvent
): Promise<void | APIGatewayProxyResult> => {
  const isApiGateway = 'httpMethod' in event;

  // -------------------------------------------------------
  // API Gateway path: admin-triggered preview or generation
  // -------------------------------------------------------
  if (isApiGateway) {
    const apiEvent = event as APIGatewayProxyEvent;
    const requestOrigin = getRequestOrigin(apiEvent.headers);
    const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);

    if (apiEvent.httpMethod === 'OPTIONS') {
      return respond(200, {});
    }

    // Authenticate admin via Cognito JWT + UserProfiles ADMIN role
    const admin = await authenticateAdmin(apiEvent);
    if (!admin) {
      return respond(401, { error: 'Unauthorized' });
    }

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(apiEvent.body || '{}');
    } catch {
      return respond(400, { error: 'Invalid JSON body' });
    }

    // dryRun defaults to true for safety - must explicitly pass false to write
    const dryRun = body.dryRun !== false;
    const rawCustomDate = body.customDate as string | undefined;

    if (rawCustomDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawCustomDate) || isNaN(new Date(rawCustomDate + 'T00:00:00Z').getTime())) {
        return respond(400, { error: `Invalid customDate format: ${rawCustomDate}. Expected YYYY-MM-DD.` });
      }
    }

    console.log(`[Admin Snapshot] admin=${admin.identityId} dryRun=${dryRun} customDate=${rawCustomDate}`);

    try {
      const result = await runSnapshotCore({ customDate: rawCustomDate });

      if (dryRun) {
        const preview = result.snapshots.slice(0, 50).map((s) => ({
          rank: s.rank,
          username: s.username,
          displayName: s.displayName,
          profileImageUrl: s.profileImageUrl,
          userScore: s.userScore,
          rawScore: s.rawScore,
          consistencyBonus: s.consistencyBonus,
          freshnessMultiplier: s.freshnessMultiplier,
          postCount: s.postCount,
          uniqueActiveDays: s.uniqueActiveDays,
          previousRank: s.previousDayRank,
          rankChange: s.rankChange,
        }));

        return respond(200, {
          success: true,
          dryRun: true,
          seasonId: result.seasonId,
          calculatedAt: new Date().toISOString(),
          totalAccounts: result.filteredCount,
          preview,
        });
      }

      // dryRun=false: check idempotency before writing
      const alreadyExists = await snapshotExistsForDate(result.seasonId, result.todayDate);
      if (alreadyExists) {
        console.warn(`[Admin Snapshot] Snapshot already exists for ${result.seasonId}#${result.todayDate}`);
        return respond(409, {
          error: 'Snapshot already exists for this date',
          snapshotDate: result.todayDate,
        });
      }

      // Write to DynamoDB
      await batchWriteSnapshots(result.snapshots);
      console.log(`[Admin Snapshot] Wrote ${result.snapshots.length} snapshot entries`);
      await updateSeasonMetadata(result.seasonId, result.filteredCount);

      return respond(200, {
        success: true,
        dryRun: false,
        seasonId: result.seasonId,
        snapshotDate: result.todayDate,
        totalAccounts: result.filteredCount,
        snapshotCount: result.snapshots.length,
      });
    } catch (error) {
      console.error('[Admin Snapshot] Error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return respond(500, { error: message });
    }
  }

  // -------------------------------------------------------
  // EventBridge / manual Lambda console path (existing behavior)
  // -------------------------------------------------------
  console.log('Generate Snapshot triggered:', JSON.stringify(event, null, 2));

  const rawEvent = event as unknown as Record<string, unknown>;
  const dryRun = rawEvent.dryRun === true;
  const rawCustomDate = rawEvent.customDate as string | undefined;
  let customDate: string | undefined;
  if (rawCustomDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawCustomDate) || isNaN(new Date(rawCustomDate + 'T00:00:00Z').getTime())) {
      console.error(`Invalid customDate format: ${rawCustomDate}. Expected YYYY-MM-DD.`);
      return;
    }
    customDate = rawCustomDate;
  }

  if (dryRun) {
    console.log('[DRY RUN] Scores will be calculated but NOT written to DynamoDB');
  }

  try {
    const result = await runSnapshotCore({ customDate });

    if (dryRun) {
      const preview = result.snapshots.slice(0, 50).map((s) => ({
        rank: s.rank,
        username: s.username,
        userScore: s.userScore,
        rawScore: s.rawScore,
        consistencyBonus: s.consistencyBonus,
        freshnessMultiplier: s.freshnessMultiplier,
        postCount: s.postCount,
        uniqueActiveDays: s.uniqueActiveDays,
      }));
      console.log(`[DRY RUN] Top ${preview.length} of ${result.snapshots.length} accounts:`);
      console.log(JSON.stringify(preview, null, 2));
      console.log('[DRY RUN] No data was written to DynamoDB');
      return;
    }

    await batchWriteSnapshots(result.snapshots);
    console.log(`Wrote ${result.snapshots.length} snapshot entries`);
    await updateSeasonMetadata(result.seasonId, result.filteredCount);
    console.log('Snapshot generation completed successfully');
  } catch (error) {
    console.error('Error generating snapshot:', error);
    throw error;
  }
};
