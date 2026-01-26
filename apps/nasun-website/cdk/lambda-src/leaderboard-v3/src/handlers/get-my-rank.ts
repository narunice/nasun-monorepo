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
  UpdateCommand,
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
const USER_PROFILES_TABLE =
  process.env.USER_PROFILES_TABLE || 'UserProfiles';

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
 * Get today's date string (KST)
 */
function getTodayDateString(): string {
  const date = new Date();
  date.setTime(date.getTime() + 9 * 60 * 60 * 1000); // KST
  return date.toISOString().split('T')[0];
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
 * Get rank change by comparing current rank with today's snapshot (KST)
 */
async function getRankChange(
  seasonId: string,
  accountId: string,
  currentRank: number
): Promise<RankChange> {
  const todayStr = getTodayDateString(); // KST
  const pk = `${seasonId}#${todayStr}`;

  // Query for the user's rank in today's snapshot
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
    // No snapshot for today - user is new or snapshot not generated yet
    return { direction: 'new', amount: 0 };
  }

  const snapshot = result.Items[0] as DailySnapshot;
  const previousRank = snapshot.rank;

  // Real-time calculation (same logic as get-leaderboard.ts)
  const change = previousRank - currentRank;
  if (change > 0) return { direction: 'up', amount: change };
  if (change < 0) return { direction: 'down', amount: Math.abs(change) };
  return { direction: 'same', amount: 0 };
}

/**
 * Sync profile data from UserProfiles table to Account + SeasonAccounts tables.
 * Called lazily when user checks their rank, ensuring fresh profile data
 * is reflected in both the My Rank card and the leaderboard table.
 */
async function syncProfileFromUserProfiles(
  account: Account,
  seasonId?: string
): Promise<{ displayName?: string; profileImageUrl?: string }> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: USER_PROFILES_TABLE,
        IndexName: 'twitterHandle-index',
        KeyConditionExpression: 'twitterHandle = :handle',
        ExpressionAttributeValues: {
          ':handle': account.username,
        },
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return {};
    }

    const profile = result.Items[0] as {
      username?: string;
      profileImageUrl?: string;
    };

    const freshDisplayName = profile.username;
    const freshProfileImage = profile.profileImageUrl;

    const resolvedDisplayName = freshDisplayName || account.displayName;
    const resolvedProfileImage = freshProfileImage || account.profileImageUrl;

    const updates: Promise<unknown>[] = [];

    // Update Account table if profile data changed
    const accountNeedsUpdate =
      (freshDisplayName && freshDisplayName !== account.displayName) ||
      (freshProfileImage && freshProfileImage !== account.profileImageUrl);

    if (accountNeedsUpdate) {
      updates.push(
        docClient.send(
          new UpdateCommand({
            TableName: ACCOUNTS_TABLE,
            Key: { accountId: account.accountId },
            UpdateExpression: 'SET displayName = :dn, profileImageUrl = :img, isRegistered = :reg',
            ExpressionAttributeValues: {
              ':dn': resolvedDisplayName,
              ':img': resolvedProfileImage,
              ':reg': true,
            },
          })
        )
      );
    }

    // Always sync profile to SeasonAccounts table (leaderboard table reads from here)
    if (seasonId && resolvedDisplayName) {
      updates.push(
        docClient.send(
          new UpdateCommand({
            TableName: SEASON_ACCOUNTS_TABLE,
            Key: {
              pk: `SEASON#${seasonId}#ACCOUNT#${account.accountId}`,
              sk: 'SCORE',
            },
            UpdateExpression: 'SET displayName = :dn, profileImageUrl = :img, isRegistered = :reg',
            ExpressionAttributeValues: {
              ':dn': resolvedDisplayName,
              ':img': resolvedProfileImage,
              ':reg': true,
            },
            ConditionExpression: 'attribute_exists(pk)',
          })
        ).catch(() => { /* Season-account record may not exist yet */ })
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    return {
      displayName: resolvedDisplayName,
      profileImageUrl: resolvedProfileImage,
    };
  } catch (error) {
    console.warn('Profile sync failed (non-critical):', error);
    return {
      displayName: account.displayName,
      profileImageUrl: account.profileImageUrl,
    };
  }
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
    if (!account || account.isBanned) {
      // User not found or banned
      const notRankedResponse: MyRankResponse = {
        success: true,
        data: { status: 'not_ranked' },
        seasonId,
        calculatedAt: new Date().toISOString(),
      };
      return createResponse(200, notRankedResponse);
    }

    // Sync profile data from UserProfiles (lazy refresh to both accounts + season-accounts)
    const freshProfile = await syncProfileFromUserProfiles(account, seasonId);

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
          displayName: freshProfile.displayName || account.displayName,
          profileImageUrl: freshProfile.profileImageUrl || account.profileImageUrl,
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

    // Get rank change from today's snapshot (real-time calculation)
    const rankChange = await getRankChange(seasonId, account.accountId, rank);

    // Build response (prefer fresh profile data from UserProfiles)
    const data: MyRankData = {
      status: 'ranked',
      rank,
      userScore: seasonScore.userScore,
      postCount: seasonScore.postCount,
      username: seasonScore.username,
      originalUsername: seasonScore.originalUsername || account.originalUsername,
      displayName: freshProfile.displayName || seasonScore.displayName || account.displayName,
      profileImageUrl: freshProfile.profileImageUrl || seasonScore.profileImageUrl || account.profileImageUrl,
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
