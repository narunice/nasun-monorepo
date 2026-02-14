/**
 * GET /v3/leaderboard/rank-history - Get user's rank history for a season
 *
 * Query Parameters:
 * - username: Twitter handle (required)
 * - seasonId: Season ID (optional, defaults to active season)
 * - days: Number of days (7, 14, 30, 90) (optional, defaults to 7)
 *
 * Returns user's rank history over time with stats.
 * This is public data - no authentication required.
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
  Season,
  DailySnapshot,
  RankChange,
  DYNAMO_KEYS,
} from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';
import { getDateNDaysAgo } from '../utils/date';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const SNAPSHOTS_TABLE =
  process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || DYNAMO_KEYS.SNAPSHOTS_TABLE;

// Response Types
interface RankHistoryEntry {
  date: string;
  rank: number;
  userScore: number;
  postCount: number;
  rankChange?: RankChange;
}

interface RankHistoryStats {
  bestRank: number;
  worstRank: number;
  averageRank: number;
  currentRank: number;
  totalDays: number;
  scoreIncrease: number;
  rankImprovement: number;
}

interface RankHistoryProfile {
  username: string;
  originalUsername?: string;
  displayName?: string;
  profileImageUrl?: string;
}

interface RankHistoryData {
  history: RankHistoryEntry[];
  stats: RankHistoryStats;
  profile: RankHistoryProfile;
}

interface RankHistoryResponse {
  success: boolean;
  data?: RankHistoryData;
  error?: string;
  seasonId?: string;
  calculatedAt: string;
}

const VALID_DAYS = [7, 14, 30, 90];

/**
 * Get active season
 */
async function getActiveSeason(): Promise<Season | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASONS_TABLE,
      FilterExpression: '#status = :active AND sk = :metadata',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':active': 'active',
        ':metadata': 'METADATA',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return result.Items[0] as Season;
}

/**
 * Get season by ID
 */
async function getSeasonById(seasonId: string): Promise<Season | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: SEASONS_TABLE,
      KeyConditionExpression: 'seasonId = :seasonId AND sk = :metadata',
      ExpressionAttributeValues: {
        ':seasonId': seasonId,
        ':metadata': 'METADATA',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return result.Items[0] as Season;
}

/**
 * Get account by username (case-insensitive)
 */
async function getAccountByUsername(
  username: string,
  platform: string = 'twitter'
): Promise<Account | null> {
  const normalizedUsername = username.toLowerCase().replace(/^@/, '');

  const result = await docClient.send(
    new QueryCommand({
      TableName: ACCOUNTS_TABLE,
      IndexName: 'platform-username-index',
      KeyConditionExpression: 'platform = :platform AND username = :username',
      ExpressionAttributeValues: {
        ':platform': platform,
        ':username': normalizedUsername,
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return result.Items[0] as Account;
}



/**
 * Get rank history for a user using the GSI
 * Uses accountId-snapshotDate-index GSI for efficient query
 */
async function getRankHistoryFromSnapshots(
  accountId: string,
  seasonId: string,
  startDate: string
): Promise<DailySnapshot[]> {
  const snapshots: DailySnapshot[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: SNAPSHOTS_TABLE,
        IndexName: 'accountId-snapshotDate-index',
        KeyConditionExpression: 'accountId = :accountId AND snapshotDate >= :startDate',
        FilterExpression: 'begins_with(pk, :seasonPrefix)',
        ExpressionAttributeValues: {
          ':accountId': accountId,
          ':startDate': startDate,
          ':seasonPrefix': `${seasonId}#`,
        },
        ScanIndexForward: true, // Ascending order (oldest first)
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      snapshots.push(...(result.Items as DailySnapshot[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return snapshots;
}

/**
 * Calculate stats from rank history
 */
function calculateStats(history: RankHistoryEntry[]): RankHistoryStats {
  if (history.length === 0) {
    return {
      bestRank: 0,
      worstRank: 0,
      averageRank: 0,
      currentRank: 0,
      totalDays: 0,
      scoreIncrease: 0,
      rankImprovement: 0,
    };
  }

  const ranks = history.map((h) => h.rank);
  const bestRank = Math.min(...ranks);
  const worstRank = Math.max(...ranks);
  const averageRank = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
  const currentRank = history[history.length - 1].rank;
  const firstRank = history[0].rank;

  const firstScore = history[0].userScore;
  const lastScore = history[history.length - 1].userScore;
  const scoreIncrease = Math.round((lastScore - firstScore) * 1000) / 1000;

  // Rank improvement: positive means better (lower rank number)
  const rankImprovement = firstRank - currentRank;

  return {
    bestRank,
    worstRank,
    averageRank,
    currentRank,
    totalDays: history.length,
    scoreIncrease,
    rankImprovement,
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {
      success: true,
      calculatedAt: new Date().toISOString(),
    });
  }

  try {
    const username = event.queryStringParameters?.username;
    let seasonId = event.queryStringParameters?.seasonId;
    const daysParam = event.queryStringParameters?.days;

    // Validate username
    if (!username) {
      return respond(400, { error: 'Query parameter "username" is required' });
    }

    // Validate days parameter
    let days = 7;
    if (daysParam) {
      const parsedDays = parseInt(daysParam, 10);
      if (isNaN(parsedDays) || !VALID_DAYS.includes(parsedDays)) {
        return respond(400, {
          error: `Query parameter "days" must be one of: ${VALID_DAYS.join(', ')}`,
        });
      }
      days = parsedDays;
    }

    // Get season
    let season: Season | null;
    if (seasonId) {
      season = await getSeasonById(seasonId);
      if (!season) {
        return respond(404, { error: `Season "${seasonId}" not found` });
      }
    } else {
      season = await getActiveSeason();
      if (!season) {
        return respond(404, { error: 'No active season found' });
      }
      seasonId = season.seasonId;
    }

    // Get account by username
    const account = await getAccountByUsername(username);
    if (!account || account.isBanned) {
      return respond(404, { error: 'User not found or banned' });
    }

    // Get start date (N days ago)
    const startDate = getDateNDaysAgo(days);

    // Get rank history from snapshots using GSI
    const snapshots = await getRankHistoryFromSnapshots(
      account.accountId,
      seasonId,
      startDate
    );

    // Convert snapshots to history entries
    const history: RankHistoryEntry[] = snapshots.map((snapshot) => ({
      date: snapshot.snapshotDate,
      rank: snapshot.rank,
      userScore: snapshot.userScore,
      postCount: snapshot.postCount,
      rankChange: snapshot.rankChange,
    }));

    // Calculate stats
    const stats = calculateStats(history);

    // Build profile from account or latest snapshot
    const latestSnapshot = snapshots[snapshots.length - 1];
    const profile: RankHistoryProfile = {
      username: account.username,
      originalUsername: account.originalUsername || latestSnapshot?.originalUsername,
      displayName: account.displayName || latestSnapshot?.displayName,
      profileImageUrl: account.profileImageUrl || latestSnapshot?.profileImageUrl,
    };

    const response: RankHistoryResponse = {
      success: true,
      data: {
        history,
        stats,
        profile,
      },
      seasonId,
      calculatedAt: new Date().toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting rank history:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
