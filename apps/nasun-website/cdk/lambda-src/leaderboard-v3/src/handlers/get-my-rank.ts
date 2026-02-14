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
import { createResponse, getRequestOrigin } from '../utils/response';
import { getTodayDateString, getYesterdayDateString } from '../utils/date';
import { calculateRankChange } from '../utils/rank';

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
 * Get user's snapshot for a specific date
 */
async function getUserSnapshot(
  seasonId: string,
  accountId: string,
  dateStr: string
): Promise<DailySnapshot | null> {
  const pk = `${seasonId}#${dateStr}`;

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
    return null;
  }

  return result.Items[0] as DailySnapshot;
}

/**
 * Get total users count from snapshot
 */
async function getSnapshotTotalUsers(seasonId: string, dateStr: string): Promise<number> {
  const pk = `${seasonId}#${dateStr}`;

  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      Select: 'COUNT',
      ExpressionAttributeValues: {
        ':pk': pk,
      },
    })
  );

  return result.Count || 0;
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
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    const emptyResponse: MyRankResponse = {
      success: true,
      data: { status: 'not_ranked' },
      calculatedAt: new Date().toISOString(),
    };
    return respond(200, emptyResponse);
  }

  try {
    const username = event.queryStringParameters?.username;
    let seasonId = event.queryStringParameters?.seasonId;

    // Validate username
    if (!username) {
      return respond(400, { error: 'Query parameter "username" is required' });
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
      // User not found or banned
      const notRankedResponse: MyRankResponse = {
        success: true,
        data: { status: 'not_ranked' },
        seasonId,
        calculatedAt: new Date().toISOString(),
      };
      return respond(200, notRankedResponse);
    }

    // Sync profile data from UserProfiles (lazy refresh to both accounts + season-accounts)
    const freshProfile = await syncProfileFromUserProfiles(account, seasonId);

    // Get user's snapshot
    const todayDate = getTodayDateString();
    const yesterdayDate = getYesterdayDateString();
    const isEndedSeason = season.status === 'ended' || season.status === 'archived';

    let userSnapshot: DailySnapshot | null;
    let usedSnapshotDate: string;

    if (isEndedSeason) {
      // Ended seasons: try endDate first, then fall back up to 7 days before endDate
      const MAX_FALLBACK_DAYS = 7;
      userSnapshot = null;
      usedSnapshotDate = season.endDate;

      for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
        const dateObj = new Date(season.endDate);
        dateObj.setDate(dateObj.getDate() - daysBack);
        const dateStr = dateObj.toISOString().split('T')[0];

        userSnapshot = await getUserSnapshot(seasonId, account.accountId, dateStr);
        if (userSnapshot) {
          usedSnapshotDate = dateStr;
          break;
        }
      }
    } else {
      // Active seasons: try recent snapshots (today, then up to 7 days back)
      userSnapshot = null;
      usedSnapshotDate = todayDate;

      const MAX_FALLBACK_DAYS = 7;
      for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
        const date = new Date();
        date.setTime(date.getTime() + 9 * 60 * 60 * 1000); // KST
        date.setDate(date.getDate() - daysBack);
        const dateStr = date.toISOString().split('T')[0];

        userSnapshot = await getUserSnapshot(seasonId, account.accountId, dateStr);
        if (userSnapshot) {
          usedSnapshotDate = dateStr;
          break;
        }
      }
    }

    if (!userSnapshot) {
      // User not in any snapshot - check if they have posts but aren't ranked yet
      const seasonScore = await getSeasonAccountScore(seasonId, account.accountId);

      const notRankedResponse: MyRankResponse = {
        success: true,
        data: {
          status: 'not_ranked',
          username: account.username,
          originalUsername: account.originalUsername,
          displayName: freshProfile.displayName || account.displayName,
          profileImageUrl: freshProfile.profileImageUrl || account.profileImageUrl,
          // If they have posts, let them know they'll be ranked tomorrow
          message: seasonScore ? 'Your rank will be updated at 9:00 AM KST' : undefined,
        },
        seasonId,
        calculatedAt: new Date().toISOString(),
      };
      return respond(200, notRankedResponse);
    }

    // Get rank change
    let rankChange: RankChange;
    if (!isEndedSeason && usedSnapshotDate === todayDate) {
      // Active season with today's snapshot: compute rank change from yesterday
      const yesterdaySnapshot = await getUserSnapshot(seasonId, account.accountId, yesterdayDate);
      rankChange = calculateRankChange(userSnapshot.rank, yesterdaySnapshot?.rank);
    } else {
      // Ended season or using yesterday's snapshot: use stored rank change
      rankChange = userSnapshot.rankChange || { direction: 'same', amount: 0 };
    }

    // Get total users from snapshot
    const totalUsers = await getSnapshotTotalUsers(seasonId, usedSnapshotDate);

    // Build response (prefer fresh profile data from UserProfiles)
    const data: MyRankData = {
      status: 'ranked',
      rank: userSnapshot.rank,
      userScore: userSnapshot.userScore,
      postCount: userSnapshot.postCount,
      username: userSnapshot.username,
      originalUsername: userSnapshot.originalUsername || account.originalUsername,
      displayName: freshProfile.displayName || userSnapshot.displayName || account.displayName,
      profileImageUrl: freshProfile.profileImageUrl || userSnapshot.profileImageUrl || account.profileImageUrl,
      rankChange,
      totalUsers,
    };

    const response: MyRankResponse = {
      success: true,
      data,
      seasonId,
      snapshotDate: usedSnapshotDate,
      calculatedAt: userSnapshot.snapshotTime || new Date().toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting my rank:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
