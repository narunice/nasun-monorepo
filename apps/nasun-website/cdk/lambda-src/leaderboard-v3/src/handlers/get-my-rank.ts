/**
 * GET /v3/leaderboard/my-rank - Get user's rank in a season
 *
 * Query Parameters:
 * - username: Twitter handle (required)
 * - seasonId: Season ID (optional, defaults to active season)
 *
 * Returns user's current rank, score, and rank change from previous snapshot.
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
  SeasonAccountScore,
  DailySnapshot,
  MyRankResponse,
  MyRankData,
  RankChange,
  DYNAMO_KEYS,
} from '../types';

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
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
const SNAPSHOTS_TABLE =
  process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || DYNAMO_KEYS.SNAPSHOTS_TABLE;

function createResponse(
  statusCode: number,
  body: MyRankResponse | { error: string }
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

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
 * Get season account score for a specific account
 */
async function getSeasonAccountScore(
  seasonId: string,
  accountId: string
): Promise<SeasonAccountScore | null> {
  const pk = `SEASON#${seasonId}#ACCOUNT#${accountId}`;

  const result = await docClient.send(
    new QueryCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: {
        ':pk': pk,
        ':sk': 'SCORE',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  return result.Items[0] as SeasonAccountScore;
}

/**
 * Calculate user's rank by comparing with all users in the season
 */
async function calculateRank(
  seasonId: string,
  accountId: string,
  userScore: number
): Promise<{ rank: number; totalUsers: number }> {
  // Get all season account scores
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      FilterExpression: 'seasonId = :seasonId AND sk = :sk',
      ExpressionAttributeValues: {
        ':seasonId': seasonId,
        ':sk': 'SCORE',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return { rank: 1, totalUsers: 1 };
  }

  const scores = result.Items as SeasonAccountScore[];
  const totalUsers = scores.length;

  // Count how many users have higher scores
  let higherCount = 0;
  for (const score of scores) {
    if (score.accountId !== accountId && (score.userScore || 0) > userScore) {
      higherCount++;
    }
  }

  return { rank: higherCount + 1, totalUsers };
}

/**
 * Get rank change from yesterday's snapshot
 */
async function getRankChange(
  seasonId: string,
  accountId: string
): Promise<RankChange | undefined> {
  // Get yesterday's date
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const pk = `${seasonId}#${yesterdayStr}`;

  // Query for the user's rank in yesterday's snapshot
  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      FilterExpression: 'accountId = :accountId',
      ExpressionAttributeValues: {
        ':pk': pk,
        ':accountId': accountId,
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    // No previous snapshot - user is new
    return { direction: 'new', amount: 0 };
  }

  const snapshot = result.Items[0] as DailySnapshot;
  return snapshot.rankChange;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    const emptyResponse: MyRankResponse = {
      success: true,
      data: { status: 'not_ranked' },
      calculatedAt: new Date().toISOString(),
    };
    return createResponse(200, emptyResponse);
  }

  try {
    const username = event.queryStringParameters?.username;
    let seasonId = event.queryStringParameters?.seasonId;

    // Validate username
    if (!username) {
      return createResponse(400, { error: 'Query parameter "username" is required' });
    }

    // Get season
    let season: Season | null;
    if (seasonId) {
      season = await getSeasonById(seasonId);
      if (!season) {
        return createResponse(404, { error: `Season "${seasonId}" not found` });
      }
    } else {
      season = await getActiveSeason();
      if (!season) {
        return createResponse(404, { error: 'No active season found' });
      }
      seasonId = season.seasonId;
    }

    // Get account by username
    const account = await getAccountByUsername(username);
    if (!account) {
      // User not found in leaderboard
      const notRankedResponse: MyRankResponse = {
        success: true,
        data: { status: 'not_ranked' },
        seasonId,
        calculatedAt: new Date().toISOString(),
      };
      return createResponse(200, notRankedResponse);
    }

    // Get season account score
    const seasonScore = await getSeasonAccountScore(seasonId, account.accountId);
    if (!seasonScore) {
      // User exists but has no posts in this season
      const notRankedResponse: MyRankResponse = {
        success: true,
        data: {
          status: 'not_ranked',
          username: account.username,
          originalUsername: account.originalUsername,
          displayName: account.displayName,
          profileImageUrl: account.profileImageUrl,
        },
        seasonId,
        calculatedAt: new Date().toISOString(),
      };
      return createResponse(200, notRankedResponse);
    }

    // Calculate rank
    const { rank, totalUsers } = await calculateRank(
      seasonId,
      account.accountId,
      seasonScore.userScore || 0
    );

    // Get rank change from yesterday
    const rankChange = await getRankChange(seasonId, account.accountId);

    // Build response
    const data: MyRankData = {
      status: 'ranked',
      rank,
      userScore: seasonScore.userScore,
      postCount: seasonScore.postCount,
      username: seasonScore.username,
      originalUsername: seasonScore.originalUsername || account.originalUsername,
      displayName: seasonScore.displayName || account.displayName,
      profileImageUrl: seasonScore.profileImageUrl || account.profileImageUrl,
      rankChange,
      totalUsers,
    };

    const response: MyRankResponse = {
      success: true,
      data,
      seasonId,
      calculatedAt: new Date().toISOString(),
    };

    return createResponse(200, response);
  } catch (error) {
    console.error('Error getting my rank:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
