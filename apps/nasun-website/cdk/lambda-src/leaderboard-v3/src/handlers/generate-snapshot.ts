/**
 * Generate Snapshot Handler
 *
 * Creates daily leaderboard snapshots for the active season.
 * Triggered by EventBridge at 09:00 KST (00:00 UTC) daily.
 *
 * Captures:
 * - Current rankings with scores
 * - Rank changes from previous day
 * - Score breakdowns for each account
 */

import { ScheduledEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DailySnapshot,
  RankChange,
  SeasonAccountScore,
  DYNAMO_KEYS,
} from '../types';
import { getActiveSeason, getSeasonAccountScores } from '../services/dynamodb-client';

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

/**
 * Get today's date string in YYYY-MM-DD format (KST)
 */
function getTodayDateString(): string {
  const now = new Date();
  // Convert to KST (UTC+9)
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split('T')[0];
}

/**
 * Get yesterday's date string in YYYY-MM-DD format
 */
function getYesterdayDateString(todayDate: string): string {
  const date = new Date(todayDate);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

/**
 * Calculate rank change between current and previous rank
 */
function calculateRankChange(currentRank: number, previousRank?: number): RankChange {
  if (previousRank === undefined) {
    return { direction: 'new', amount: 0 };
  }

  const change = previousRank - currentRank;
  if (change > 0) {
    return { direction: 'up', amount: change };
  }
  if (change < 0) {
    return { direction: 'down', amount: Math.abs(change) };
  }
  return { direction: 'same', amount: 0 };
}

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
 */
async function batchWriteSnapshots(snapshots: DailySnapshot[]): Promise<void> {
  const BATCH_SIZE = 25;

  for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
    const batch = snapshots.slice(i, i + BATCH_SIZE);
    const putRequests = batch.map((snapshot) => ({
      PutRequest: {
        Item: snapshot,
      },
    }));

    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [SNAPSHOTS_TABLE]: putRequests,
        },
      })
    );
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
 */
function recalculateUserScore(score: SeasonAccountScore): {
  userScore: number;
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
} {
  const { totalPostScore, postCount, uniqueActiveDays, lastSeenAt } = score;

  // RawScore = totalPostScore × log₂(postCount + 1) / postCount
  const effectivePosts = Math.log2(postCount + 1);
  const rawScore = postCount > 0 ? (totalPostScore * effectivePosts) / postCount : 0;

  // ConsistencyBonus = 1 + log₂(uniqueActiveDays + 1) × 0.1
  const consistencyBonus = 1 + Math.log2(uniqueActiveDays + 1) * 0.1;

  // FreshnessMultiplier = 1 / (1 + daysSinceLastPost / 14)
  const daysSinceLastPost = Math.floor(
    (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const freshnessMultiplier = 1 / (1 + daysSinceLastPost / 14);

  // UserScore = rawScore × consistencyBonus × freshnessMultiplier
  const userScore = rawScore * consistencyBonus * freshnessMultiplier;

  return {
    rawScore: Math.round(rawScore * 1000) / 1000,
    consistencyBonus: Math.round(consistencyBonus * 1000) / 1000,
    freshnessMultiplier: Math.round(freshnessMultiplier * 1000) / 1000,
    userScore: Math.round(userScore * 1000) / 1000,
  };
}

/**
 * Main handler - triggered by EventBridge schedule
 */
export const handler = async (event: ScheduledEvent): Promise<void> => {
  console.log('Generate Snapshot triggered:', JSON.stringify(event, null, 2));

  try {
    // Get active season
    const activeSeason = await getActiveSeason();
    if (!activeSeason) {
      console.log('No active season found, skipping snapshot generation');
      return;
    }

    console.log(`Generating snapshot for season: ${activeSeason.seasonId}`);

    // Get all season account scores
    const scores = await getSeasonAccountScores(activeSeason.seasonId);
    if (scores.length === 0) {
      console.log('No accounts found for this season, skipping snapshot');
      return;
    }

    console.log(`Found ${scores.length} accounts for snapshot`);

    // Recalculate scores with current timestamp and sort by userScore
    const scoredAccounts = scores
      .map((score) => ({
        ...score,
        ...recalculateUserScore(score),
      }))
      .sort((a, b) => b.userScore - a.userScore);

    // Get previous day's ranks
    const todayDate = getTodayDateString();
    const yesterdayDate = getYesterdayDateString(todayDate);
    const previousRanks = await getPreviousDaySnapshot(activeSeason.seasonId, yesterdayDate);

    console.log(`Previous day snapshot has ${previousRanks.size} entries`);

    // Create snapshot entries (limit to top 500)
    const MAX_SNAPSHOT_ENTRIES = 500;
    const snapshotTime = new Date().toISOString();

    // Check if this is a final snapshot (today >= season endDate)
    // Final snapshots are permanent (no TTL)
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
          snapshotDate: todayDate,
          snapshotTime,
        };

        // Only set TTL for non-final snapshots
        if (ttl !== undefined) {
          snapshot.ttl = ttl;
        }

        return snapshot;
      });

    // Write snapshots in batches
    await batchWriteSnapshots(snapshots);
    console.log(`Wrote ${snapshots.length} snapshot entries`);

    // Update season metadata
    await updateSeasonMetadata(activeSeason.seasonId, scores.length);

    console.log('Snapshot generation completed successfully');
  } catch (error) {
    console.error('Error generating snapshot:', error);
    throw error;
  }
};
