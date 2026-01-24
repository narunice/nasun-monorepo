/**
 * GET /v3/leaderboard - Get leaderboard rankings
 *
 * Public endpoint that returns the leaderboard for a season.
 *
 * Query Parameters:
 * - listSeasons: 'true' to get list of all public seasons (for selector dropdown)
 * - seasonId: string (optional, defaults to active/default season)
 * - snapshotDate: string (optional, YYYY-MM-DD for past snapshot)
 * - limit: number (default: 100, max: 500)
 * - offset: number (default: 0)
 * - breakdown: 'true' to include score breakdown
 * - cumulative: 'true' for all-time view (admin only, requires auth)
 *
 * For current leaderboard (no snapshotDate):
 * - Queries season-accounts table and calculates real-time scores
 * - Includes rank change from previous day's snapshot if available
 *
 * For past snapshot (with snapshotDate):
 * - Returns cached snapshot data from snapshots table
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  Account,
  ComputedUserScore,
  DailySnapshot,
  GetLeaderboardResponse,
  LeaderboardEntry,
  RankChange,
  Season,
  SeasonAccountScore,
  SeasonLeaderboardEntry,
  SeasonLeaderboardResponse,
  DYNAMO_KEYS,
} from '../types';
import {
  getAllAccounts,
  getActiveSeason,
  getSeasonById,
  getSeasonAccountScores,
  getBannedAccountIds,
} from '../services/dynamodb-client';
import { calculateUserScore, compareScores } from '../services/score-calculator';

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
const ADMIN_PASSWORD = process.env.LEADERBOARD_V3_ADMIN_PASSWORD || '';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300', // 5 minute cache
};

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

/**
 * Get yesterday's date string (KST)
 */
function getYesterdayDateString(): string {
  const date = new Date();
  date.setTime(date.getTime() + 9 * 60 * 60 * 1000); // KST
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

/**
 * Check admin authentication for cumulative view
 */
function isAdminAuthenticated(event: APIGatewayProxyEvent): boolean {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader || !ADMIN_PASSWORD) return false;
  const [bearer, password] = authHeader.split(' ');
  return bearer?.toLowerCase() === 'bearer' && password === ADMIN_PASSWORD;
}

/**
 * Get all public seasons (for season selector)
 * Only returns non-archived seasons, sorted by startDate descending
 */
async function getAllPublicSeasons(): Promise<
  Array<{
    seasonId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    isDefault: boolean;
  }>
> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASONS_TABLE,
      FilterExpression: 'sk = :sk AND #status <> :archived',
      ProjectionExpression: 'seasonId, #n, startDate, endDate, #status, isDefault',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#n': 'name',
      },
      ExpressionAttributeValues: {
        ':sk': 'METADATA',
        ':archived': 'archived',
      },
    })
  );

  const seasons = (result.Items || []) as Array<{
    seasonId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    isDefault: boolean;
  }>;

  // Sort by startDate descending (newest first), active/default first
  return seasons.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    if (a.isDefault && !b.isDefault) return -1;
    if (b.isDefault && !a.isDefault) return 1;
    return b.startDate.localeCompare(a.startDate);
  });
}

/**
 * Get previous day's rank map from snapshot
 */
async function getPreviousDayRanks(seasonId: string): Promise<Map<string, number>> {
  const yesterdayDate = getYesterdayDateString();
  const pk = `${seasonId}#${yesterdayDate}`;
  const rankMap = new Map<string, number>();

  try {
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
  } catch (error) {
    console.warn('Failed to get previous day ranks:', error);
  }

  return rankMap;
}

/**
 * Get snapshot data for a specific date
 */
async function getSnapshotData(
  seasonId: string,
  snapshotDate: string,
  limit: number,
  offset: number
): Promise<{ entries: DailySnapshot[]; totalCount: number }> {
  const pk = `${seasonId}#${snapshotDate}`;

  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': pk,
      },
    })
  );

  const items = (result.Items || []) as DailySnapshot[];
  const totalCount = items.length;
  const paginatedItems = items.slice(offset, offset + limit);

  return { entries: paginatedItems, totalCount };
}

/**
 * Recalculate user score with current timestamp
 */
function recalculateSeasonScore(score: SeasonAccountScore): {
  userScore: number;
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
} {
  const { totalPostScore, postCount, uniqueActiveDays, lastSeenAt } = score;

  const effectivePosts = Math.log2(postCount + 1);
  const rawScore = postCount > 0 ? (totalPostScore * effectivePosts) / postCount : 0;
  const consistencyBonus = 1 + Math.log2(uniqueActiveDays + 1) * 0.1;
  const daysSinceLastPost = Math.floor(
    (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const freshnessMultiplier = 1 / (1 + daysSinceLastPost / 14);
  const userScore = rawScore * consistencyBonus * freshnessMultiplier;

  return {
    rawScore: Math.round(rawScore * 1000) / 1000,
    consistencyBonus: Math.round(consistencyBonus * 1000) / 1000,
    freshnessMultiplier: Math.round(freshnessMultiplier * 1000) / 1000,
    userScore: Math.round(userScore * 1000) / 1000,
  };
}

/**
 * Calculate rank change
 */
function calculateRankChange(currentRank: number, previousRank?: number): RankChange {
  if (previousRank === undefined) {
    return { direction: 'new', amount: 0 };
  }
  const change = previousRank - currentRank;
  if (change > 0) return { direction: 'up', amount: change };
  if (change < 0) return { direction: 'down', amount: Math.abs(change) };
  return { direction: 'same', amount: 0 };
}

/**
 * Convert season account score to leaderboard entry
 */
function toSeasonLeaderboardEntry(
  score: SeasonAccountScore & {
    userScore: number;
    rawScore: number;
    consistencyBonus: number;
    freshnessMultiplier: number;
  },
  rank: number,
  rankChange?: RankChange,
  includeBreakdown = false
): SeasonLeaderboardEntry {
  const entry: SeasonLeaderboardEntry = {
    rank,
    username: score.username,
    originalUsername: score.originalUsername,
    platform: score.platform,
    userScore: Math.round(score.userScore * 100) / 100,
    postCount: score.postCount,
    uniqueActiveDays: score.uniqueActiveDays,
    lastActivity: score.lastSeenAt,
    displayName: score.displayName,
    profileImageUrl: score.profileImageUrl,
    isRegistered: score.isRegistered,
    rankChange,
  };

  if (includeBreakdown) {
    entry.breakdown = {
      rawScore: Math.round(score.rawScore * 100) / 100,
      consistencyBonus: Math.round(score.consistencyBonus * 100) / 100,
      freshnessMultiplier: Math.round(score.freshnessMultiplier * 100) / 100,
    };
  }

  return entry;
}

/**
 * Convert snapshot to leaderboard entry
 */
function snapshotToLeaderboardEntry(
  snapshot: DailySnapshot,
  includeBreakdown: boolean
): SeasonLeaderboardEntry {
  const entry: SeasonLeaderboardEntry = {
    rank: snapshot.rank,
    username: snapshot.username,
    originalUsername: snapshot.originalUsername,
    platform: snapshot.platform,
    userScore: Math.round(snapshot.userScore * 100) / 100,
    postCount: snapshot.postCount,
    uniqueActiveDays: snapshot.uniqueActiveDays,
    lastActivity: snapshot.snapshotTime,
    displayName: snapshot.displayName,
    profileImageUrl: snapshot.profileImageUrl,
    isRegistered: snapshot.isRegistered,
    rankChange: snapshot.rankChange,
  };

  if (includeBreakdown) {
    entry.breakdown = {
      rawScore: Math.round(snapshot.rawScore * 100) / 100,
      consistencyBonus: Math.round(snapshot.consistencyBonus * 100) / 100,
      freshnessMultiplier: Math.round(snapshot.freshnessMultiplier * 100) / 100,
    };
  }

  return entry;
}

/**
 * Convert account to leaderboard entry (for cumulative view)
 */
function toLeaderboardEntry(
  score: ComputedUserScore,
  rank: number,
  includeBreakdown = false
): LeaderboardEntry {
  const entry: LeaderboardEntry = {
    rank,
    username: score.username,
    originalUsername: score.originalUsername,
    platform: score.platform,
    userScore: Math.round(score.userScore * 100) / 100,
    postCount: score.postCount,
    uniqueActiveDays: score.uniqueActiveDays,
    lastActivity: score.lastSeenAt,
    displayName: score.displayName,
    profileImageUrl: score.profileImageUrl,
    isRegistered: score.isRegistered,
  };

  if (includeBreakdown) {
    entry.breakdown = {
      rawScore: Math.round(score.rawScore * 100) / 100,
      consistencyBonus: Math.round(score.consistencyBonus * 100) / 100,
      freshnessMultiplier: Math.round(score.freshnessMultiplier * 100) / 100,
    };
  }

  return entry;
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Get Leaderboard request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  try {
    const queryParams = event.queryStringParameters || {};

    // List all public seasons (for season selector dropdown)
    if (queryParams.listSeasons === 'true') {
      const seasons = await getAllPublicSeasons();
      return createResponse(200, { seasons });
    }

    const limit = Math.min(parseInt(queryParams.limit || '100', 10), 500);
    const offset = parseInt(queryParams.offset || '0', 10);
    const includeBreakdown = queryParams.breakdown === 'true';
    const isCumulative = queryParams.cumulative === 'true';
    const snapshotDate = queryParams.snapshotDate;
    let seasonId = queryParams.seasonId;

    // Cumulative view (admin only)
    if (isCumulative) {
      if (!isAdminAuthenticated(event)) {
        return createResponse(401, { error: 'Cumulative view requires admin authentication' });
      }

      // Get all accounts and calculate real-time scores
      const accounts = await getAllAccounts();
      const bannedIds = await getBannedAccountIds();
      const computedScores: ComputedUserScore[] = accounts
        .filter((account) => account.postCount > 0 && !bannedIds.has(account.accountId))
        .map((account) => calculateUserScore(account));

      computedScores.sort(compareScores);

      const totalCount = computedScores.length;
      const paginatedScores = computedScores.slice(offset, offset + limit);
      const entries: LeaderboardEntry[] = paginatedScores.map((score, index) =>
        toLeaderboardEntry(score, offset + index + 1, includeBreakdown)
      );

      const response: GetLeaderboardResponse = {
        entries,
        totalCount,
        period: 'alltime',
        calculatedAt: new Date().toISOString(),
      };

      return createResponse(200, response);
    }

    // Get season (defaults to active/default season)
    let season: Season | null;
    if (seasonId) {
      season = await getSeasonById(seasonId);
      if (!season) {
        return createResponse(404, { error: `Season ${seasonId} not found` });
      }
    } else {
      season = await getActiveSeason();
      if (!season) {
        return createResponse(200, {
          message: 'No active season',
          entries: [],
          totalCount: 0,
          calculatedAt: new Date().toISOString(),
        });
      }
      seasonId = season.seasonId;
    }

    // Past snapshot view
    if (snapshotDate) {
      const { entries: snapshots, totalCount } = await getSnapshotData(
        seasonId,
        snapshotDate,
        limit,
        offset
      );

      if (snapshots.length === 0) {
        return createResponse(404, { error: `No snapshot found for ${snapshotDate}` });
      }

      const entries = snapshots.map((s) => snapshotToLeaderboardEntry(s, includeBreakdown));

      const response: SeasonLeaderboardResponse = {
        season: {
          seasonId: season.seasonId,
          name: season.name,
          startDate: season.startDate,
          endDate: season.endDate,
          status: season.status,
        },
        entries,
        totalCount,
        snapshotDate,
        calculatedAt: snapshots[0]?.snapshotTime || new Date().toISOString(),
      };

      return createResponse(200, response);
    }

    // Current leaderboard (real-time calculation)
    const seasonScores = await getSeasonAccountScores(seasonId);

    if (seasonScores.length === 0) {
      const response: SeasonLeaderboardResponse = {
        season: {
          seasonId: season.seasonId,
          name: season.name,
          startDate: season.startDate,
          endDate: season.endDate,
          status: season.status,
        },
        entries: [],
        totalCount: 0,
        calculatedAt: new Date().toISOString(),
      };
      return createResponse(200, response);
    }

    // Filter banned accounts and recalculate scores
    const bannedIds = await getBannedAccountIds();
    const recalculatedScores = seasonScores
      .filter((score) => !bannedIds.has(score.accountId))
      .map((score) => ({
        ...score,
        ...recalculateSeasonScore(score),
      }))
      .sort((a, b) => b.userScore - a.userScore);

    // Get previous day ranks for rank change
    const previousRanks = await getPreviousDayRanks(seasonId);

    const totalCount = recalculatedScores.length;
    const paginatedScores = recalculatedScores.slice(offset, offset + limit);

    const entries: SeasonLeaderboardEntry[] = paginatedScores.map((score, index) => {
      const rank = offset + index + 1;
      const previousRank = previousRanks.get(score.accountId);
      const rankChange = calculateRankChange(rank, previousRank);
      return toSeasonLeaderboardEntry(score, rank, rankChange, includeBreakdown);
    });

    const response: SeasonLeaderboardResponse = {
      season: {
        seasonId: season.seasonId,
        name: season.name,
        startDate: season.startDate,
        endDate: season.endDate,
        status: season.status,
      },
      entries,
      totalCount,
      calculatedAt: new Date().toISOString(),
    };

    return createResponse(200, response);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
