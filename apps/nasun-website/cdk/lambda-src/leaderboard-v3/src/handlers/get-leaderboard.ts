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
import { createResponse, getRequestOrigin } from '../utils/response';
import { authenticateAdmin } from '../utils/admin-auth';
import { getTodayDateString, getYesterdayDateString } from '../utils/date';
import { calculateRankChange } from '../utils/rank';

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
 * Get today's snapshot rank map (most recent snapshot)
 */
async function getTodaySnapshotRanks(seasonId: string): Promise<Map<string, number>> {
  const todayDate = getTodayDateString();
  const pk = `${seasonId}#${todayDate}`;
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
    isTelegramMember: score.isTelegramMember,
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
    isTelegramMember: snapshot.isTelegramMember,
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
    isTelegramMember: score.isTelegramMember,
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
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  console.log('Get Leaderboard request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
  }

  try {
    const queryParams = event.queryStringParameters || {};

    // List all public seasons (for season selector dropdown)
    if (queryParams.listSeasons === 'true') {
      const seasons = await getAllPublicSeasons();
      return respond(200, { seasons });
    }

    const limit = Math.min(parseInt(queryParams.limit || '100', 10), 500);
    const offset = Math.max(0, parseInt(queryParams.offset || '0', 10) || 0);
    const includeBreakdown = queryParams.breakdown === 'true';
    const isCumulative = queryParams.cumulative === 'true';
    const snapshotDate = queryParams.snapshotDate;
    let seasonId = queryParams.seasonId;

    // Cumulative view (admin only)
    if (isCumulative) {
      const admin = await authenticateAdmin(event);
      if (!admin) {
        return respond(401, { error: 'Cumulative view requires admin authentication' });
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

      return respond(200, response);
    }

    // Get season (defaults to active/default season)
    let season: Season | null;
    if (seasonId) {
      season = await getSeasonById(seasonId);
      if (!season) {
        return respond(404, { error: `Season ${seasonId} not found` });
      }
    } else {
      season = await getActiveSeason();
      if (!season) {
        return respond(200, {
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
      // Fetch all entries to filter banned accounts and re-rank
      const { entries: allSnapshots } = await getSnapshotData(
        seasonId,
        snapshotDate,
        2000,
        0
      );

      if (allSnapshots.length === 0) {
        return respond(404, { error: `No snapshot found for ${snapshotDate}` });
      }

      // Filter banned accounts from past snapshots
      const bannedIds = await getBannedAccountIds();
      const filteredSnapshots = allSnapshots.filter(
        (snapshot) => !bannedIds.has(snapshot.accountId)
      );

      // Re-rank after filtering
      const rerankedSnapshots = filteredSnapshots.map((snapshot, index) => ({
        ...snapshot,
        rank: index + 1,
      }));

      const snapshotTotalCount = rerankedSnapshots.length;
      const paginatedSnapshots = rerankedSnapshots.slice(offset, offset + limit);
      const entries = paginatedSnapshots.map((s) => snapshotToLeaderboardEntry(s, includeBreakdown));

      const response: SeasonLeaderboardResponse = {
        season: {
          seasonId: season.seasonId,
          name: season.name,
          startDate: season.startDate,
          endDate: season.endDate,
          status: season.status,
        },
        entries,
        totalCount: snapshotTotalCount,
        snapshotDate,
        calculatedAt: allSnapshots[0]?.snapshotTime || new Date().toISOString(),
      };

      return respond(200, response);
    }

    // Current leaderboard (snapshot-based for consistent rankings throughout the day)
    const todayDate = getTodayDateString();
    const yesterdayDate = getYesterdayDateString();
    const isEndedSeason = season.status === 'ended' || season.status === 'archived';

    let todaySnapshots: DailySnapshot[];
    let totalCount: number;
    let usedSnapshotDate: string;

    if (isEndedSeason) {
      // Ended seasons: try endDate first, then fall back up to 7 days before endDate
      const MAX_FALLBACK_DAYS = 7;
      todaySnapshots = [];
      totalCount = 0;
      usedSnapshotDate = season.endDate;

      for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
        const dateObj = new Date(season.endDate);
        dateObj.setDate(dateObj.getDate() - daysBack);
        const dateStr = dateObj.toISOString().split('T')[0];

        const result = await getSnapshotData(seasonId, dateStr, 2000, 0);
        if (result.entries.length > 0) {
          todaySnapshots = result.entries;
          totalCount = result.totalCount;
          usedSnapshotDate = dateStr;
          break;
        }
      }
    } else {
      // Active seasons: try recent snapshots (today, then up to 7 days back)
      const MAX_FALLBACK_DAYS = 7;
      todaySnapshots = [];
      totalCount = 0;
      usedSnapshotDate = todayDate;

      for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
        const date = new Date();
        date.setTime(date.getTime() + 9 * 60 * 60 * 1000); // KST
        date.setDate(date.getDate() - daysBack);
        const dateStr = date.toISOString().split('T')[0];

        const result = await getSnapshotData(seasonId, dateStr, 2000, 0);
        if (result.entries.length > 0) {
          todaySnapshots = result.entries;
          totalCount = result.totalCount;
          usedSnapshotDate = dateStr;
          break;
        }
      }
    }

    if (todaySnapshots.length === 0) {
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
      return respond(200, response);
    }

    // Filter banned accounts
    const bannedIds = await getBannedAccountIds();
    const filteredSnapshots = todaySnapshots.filter(
      (snapshot) => !bannedIds.has(snapshot.accountId)
    );

    // Get yesterday's snapshot for rank change comparison (active seasons using today's snapshot only)
    let yesterdayRankMap = new Map<string, number>();
    if (!isEndedSeason && usedSnapshotDate === todayDate) {
      const { entries: yesterdaySnapshots } = await getSnapshotData(
        seasonId,
        yesterdayDate,
        2000,
        0
      );
      for (const snapshot of yesterdaySnapshots) {
        yesterdayRankMap.set(snapshot.accountId, snapshot.rank);
      }
    }

    // Re-rank after filtering banned accounts
    const rerankedSnapshots = filteredSnapshots.map((snapshot, index) => ({
      ...snapshot,
      rank: index + 1, // Re-assign rank after filtering
    }));

    totalCount = rerankedSnapshots.length;
    const paginatedSnapshots = rerankedSnapshots.slice(offset, offset + limit);

    const entries: SeasonLeaderboardEntry[] = paginatedSnapshots.map((snapshot) => {
      // Calculate rank change: compare with yesterday's snapshot
      let rankChange: RankChange;
      if (!isEndedSeason && usedSnapshotDate === todayDate) {
        // Active season with today's snapshot: compute rank change from yesterday
        const yesterdayRank = yesterdayRankMap.get(snapshot.accountId);
        rankChange = calculateRankChange(snapshot.rank, yesterdayRank);
      } else {
        // Ended season or using yesterday's snapshot: use stored rank change
        rankChange = snapshot.rankChange || { direction: 'same', amount: 0 };
      }

      return snapshotToLeaderboardEntry(
        { ...snapshot, rankChange },
        includeBreakdown
      );
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
      snapshotDate: usedSnapshotDate,
      calculatedAt: todaySnapshots[0]?.snapshotTime || new Date().toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
