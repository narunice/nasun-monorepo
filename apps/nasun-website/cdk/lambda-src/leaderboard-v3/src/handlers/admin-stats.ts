/**
 * GET /v3/admin/stats - Admin Dashboard Statistics
 *
 * Returns system statistics and recent activity for the admin dashboard.
 * Requires admin authentication.
 *
 * Response includes:
 * - Total posts and accounts
 * - Active season info
 * - Today's stats
 * - Top 5 users (current season)
 * - Recent activity log
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DYNAMO_KEYS,
  Account,
  Season,
  SeasonAccountScore,
  Post,
  SCORE_CONSTANTS,
} from '../types';
import { getActiveSeason, getSeasonAccountScores } from '../services/dynamodb-client';
import { createResponse, getRequestOrigin } from '../utils/response';
import { getTodayDateString } from '../utils/date';
import { authenticateAdmin } from '../utils/admin-auth';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const POSTS_TABLE = process.env.LEADERBOARD_V3_POSTS_TABLE || DYNAMO_KEYS.POSTS_TABLE;
const ACCOUNTS_TABLE = process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;

/**
 * Get today's midnight timestamp (KST)
 */
function getTodayMidnight(): string {
  const todayDate = getTodayDateString();
  return `${todayDate}T00:00:00.000Z`;
}

/**
 * Count total posts
 */
async function countTotalPosts(): Promise<number> {
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: POSTS_TABLE,
        Select: 'COUNT',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    count += result.Count || 0;
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return count;
}

/**
 * Count total accounts
 */
async function countTotalAccounts(): Promise<number> {
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
        Select: 'COUNT',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    count += result.Count || 0;
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return count;
}

/**
 * Count posts created today
 */
async function countTodayPosts(): Promise<number> {
  const todayMidnight = getTodayMidnight();
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: POSTS_TABLE,
        FilterExpression: 'createdAt >= :today',
        ExpressionAttributeValues: {
          ':today': todayMidnight,
        },
        Select: 'COUNT',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    count += result.Count || 0;
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return count;
}

/**
 * Count accounts created today
 */
async function countTodayAccounts(): Promise<number> {
  const todayMidnight = getTodayMidnight();
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
        FilterExpression: 'firstSeenAt >= :today',
        ExpressionAttributeValues: {
          ':today': todayMidnight,
        },
        Select: 'COUNT',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    count += result.Count || 0;
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return count;
}

/**
 * Get top 5 users for a season
 */
async function getTopFive(seasonId: string): Promise<
  Array<{
    rank: number;
    username: string;
    userScore: number;
  }>
> {
  const scores = await getSeasonAccountScores(seasonId);

  // Sort by userScore descending, recalculate with current timestamp
  const sortedScores = scores
    .map((score) => {
      // Recalculate userScore with current timestamp for freshness
      const daysSinceLastPost = Math.floor(
        (Date.now() - new Date(score.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      const freshnessMultiplier = 1 / (1 + daysSinceLastPost / SCORE_CONSTANTS.FRESHNESS_HALF_LIFE_DAYS);
      const userScore = score.rawScore * score.consistencyBonus * freshnessMultiplier;
      return { ...score, userScore };
    })
    .sort((a, b) => b.userScore - a.userScore)
    .slice(0, 5);

  return sortedScores.map((score, index) => ({
    rank: index + 1,
    username: score.username,
    userScore: Math.round(score.userScore * 100) / 100,
  }));
}

/**
 * Get recent activity (last 10 posts)
 * Includes postId and editable fields for admin post editing
 */
async function getRecentActivity(): Promise<
  Array<{
    type: 'post_created' | 'account_created' | 'snapshot_generated';
    description: string;
    timestamp: string;
    postId?: string;
    seasonId?: string;
    platform?: string;
    username?: string;
    originalUsername?: string;
    postUrl?: string;
    postScore?: number;
    accountRole?: string;
    contentSignals?: string[];
  }>
> {
  // Get recent posts
  const result = await docClient.send(
    new ScanCommand({
      TableName: POSTS_TABLE,
      Limit: 100, // Get more to sort
    })
  );

  const posts = (result.Items || []) as Post[];

  // Sort by createdAt descending and take top 10
  const recentPosts = posts
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return recentPosts.map((post) => ({
    type: 'post_created' as const,
    description: `@${post.username} - ${post.accountRole.toUpperCase()} post registered`,
    timestamp: post.createdAt,
    postId: post.postId,
    seasonId: post.seasonId,
    platform: post.platform,
    username: post.username,
    postUrl: post.postUrl,
    postScore: post.postScore,
    accountRole: post.accountRole,
    contentSignals: post.contentSignals,
  }));
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  console.log('Admin Stats request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
  }

  // Validate admin
  const admin = await authenticateAdmin(event);
  if (!admin) {
    return respond(401, { error: 'Unauthorized' });
  }

  try {
    // Fetch all stats in parallel
    const [
      totalPosts,
      totalAccounts,
      activeSeason,
      todayPostsCount,
      todayAccountsCount,
      recentActivity,
    ] = await Promise.all([
      countTotalPosts(),
      countTotalAccounts(),
      getActiveSeason(),
      countTodayPosts(),
      countTodayAccounts(),
      getRecentActivity(),
    ]);

    // Get top 5 if we have an active season
    let topFive: Array<{ rank: number; username: string; userScore: number }> = [];
    let activeSeasonInfo: {
      seasonId: string;
      name: string;
      startDate: string;
      endDate: string;
      totalPosts: number;
      totalAccounts: number;
    } | null = null;

    if (activeSeason) {
      const seasonScores = await getSeasonAccountScores(activeSeason.seasonId);
      topFive = await getTopFive(activeSeason.seasonId);

      activeSeasonInfo = {
        seasonId: activeSeason.seasonId,
        name: activeSeason.name,
        startDate: activeSeason.startDate,
        endDate: activeSeason.endDate,
        totalPosts: activeSeason.totalPosts || 0,
        totalAccounts: seasonScores.length,
      };
    }

    const response = {
      totalPosts,
      totalAccounts,
      activeSeason: activeSeasonInfo,
      todayStats: {
        postsCreated: todayPostsCount,
        newAccounts: todayAccountsCount,
      },
      topFive,
      recentActivity,
      calculatedAt: new Date().toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Admin Stats error:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
