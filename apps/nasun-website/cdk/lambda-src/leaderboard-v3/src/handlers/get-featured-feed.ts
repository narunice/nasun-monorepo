/**
 * GET /v3/feed/featured
 *
 * Returns a combined feed of recent posts from top rankers and top climbers.
 * Used for the vertical community feed on the Leaderboard V3 page.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DailySnapshot,
  TopClimberEntry,
  FeaturedFeedResponse,
  FeaturedFeedItem,
  BadgeType,
  Post,
  SeasonAccountScore,
  DYNAMO_KEYS,
} from '../types';
import {
  getActiveSeason,
  getSeasonById,
  getSeasonAccountScores,
  getBannedAccountIds,
} from '../services/dynamodb-client';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const SNAPSHOTS_TABLE =
  process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || DYNAMO_KEYS.SNAPSHOTS_TABLE;
const POSTS_TABLE =
  process.env.LEADERBOARD_V3_POSTS_TABLE || DYNAMO_KEYS.POSTS_TABLE;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

/**
 * Get date string N days ago in KST
 */
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setTime(date.getTime() + 9 * 60 * 60 * 1000);
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date string in KST
 */
function getTodayDateString(): string {
  const date = new Date();
  date.setTime(date.getTime() + 9 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * Get snapshot for a specific date
 */
async function getSnapshot(seasonId: string, date: string): Promise<Map<string, DailySnapshot>> {
  const pk = `${seasonId}#${date}`;
  const snapshotMap = new Map<string, DailySnapshot>();

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
      snapshotMap.set(snapshot.accountId, snapshot);
    }
  }

  return snapshotMap;
}

/**
 * Calculate top climbers (reused from get-top-climbers.ts)
 */
function calculateTopClimbers(
  currentSnapshot: Map<string, DailySnapshot>,
  previousSnapshot: Map<string, DailySnapshot>,
  limit: number
): TopClimberEntry[] {
  const climbers: TopClimberEntry[] = [];

  for (const [accountId, current] of currentSnapshot) {
    const previous = previousSnapshot.get(accountId);

    let rankChange: number;
    let direction: 'up' | 'new';

    if (!previous) {
      // New entry: appeared in current but not in previous
      direction = 'new';
      rankChange = 0;
    } else {
      rankChange = previous.rank - current.rank;
      if (rankChange <= 0) continue; // Only include upward movement
      direction = 'up';
    }

    climbers.push({
      accountId,
      username: current.username,
      originalUsername: current.originalUsername,
      platform: current.platform,
      displayName: current.displayName,
      profileImageUrl: current.profileImageUrl,
      currentRank: current.rank,
      previousRank: previous?.rank || 0,
      rankChange: {
        direction,
        amount: rankChange,
      },
      currentScore: current.userScore,
    });
  }

  // Sort: prioritize actual climbers over new entries
  climbers.sort((a, b) => {
    if (a.rankChange.direction === 'new' && b.rankChange.direction !== 'new') return 1;
    if (a.rankChange.direction !== 'new' && b.rankChange.direction === 'new') return -1;
    if (b.rankChange.amount !== a.rankChange.amount) return b.rankChange.amount - a.rankChange.amount;
    return a.currentRank - b.currentRank;
  });

  return climbers.slice(0, limit);
}

/**
 * Get the latest post for a specific account
 */
async function getLatestPost(accountId: string): Promise<Post | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: POSTS_TABLE,
      IndexName: DYNAMO_KEYS.POSTS_CREATED_AT_INDEX || 'createdAt-index',
      KeyConditionExpression: 'accountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': accountId,
      },
      ScanIndexForward: false, // Descending order (latest first)
      Limit: 1,
    })
  );

  if (result.Items && result.Items.length > 0) {
    return result.Items[0] as Post;
  }
  return null;
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Get Featured Feed request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  try {
    const queryParams = event.queryStringParameters || {};
    let seasonId = queryParams.seasonId;

    // 1. Identify Season
    let season;
    if (seasonId) {
      season = await getSeasonById(seasonId);
    } else {
      season = await getActiveSeason();
    }

    if (!season) {
      return createResponse(404, { error: 'No active season found' });
    }
    seasonId = season.seasonId;

    // 2. Identify Target Users (Rankers and Climbers)
    
    // A. Top 3 Rankers
    const allScores = await getSeasonAccountScores(seasonId);
    const bannedIds = await getBannedAccountIds();
    const topRankers = allScores
      .filter((score) => !bannedIds.has(score.accountId))
      .sort((a, b) => b.userScore - a.userScore)
      .slice(0, 3);

    // B. Top 3 Climbers
    const todayDate = getTodayDateString();
    const sevenDaysAgo = getDateNDaysAgo(7);
    const currentSnapshot = await getSnapshot(seasonId, todayDate);

    // Fallback if today's snapshot not ready
    if (currentSnapshot.size === 0) {
      const yesterday = getDateNDaysAgo(1);
      const yesterdaySnapshot = await getSnapshot(seasonId, yesterday);
      for (const [k, v] of yesterdaySnapshot) currentSnapshot.set(k, v);
      console.log(`[FeaturedFeed] Today snapshot empty, using yesterday's (${yesterday}), size=${yesterdaySnapshot.size}`);
    }

    // Smart Fallback for previous snapshot: 7d → 1d
    let previousDate = sevenDaysAgo;
    let previousSnapshot = await getSnapshot(seasonId, previousDate);
    if (previousSnapshot.size === 0) {
      previousDate = getDateNDaysAgo(1);
      previousSnapshot = await getSnapshot(seasonId, previousDate);
      console.log(`[FeaturedFeed] 7-day snapshot empty, falling back to 1-day (${previousDate}), size=${previousSnapshot.size}`);
    }

    console.log(`[FeaturedFeed] Snapshot dates: current=${todayDate}, previous=${previousDate}, currentSize=${currentSnapshot.size}, previousSize=${previousSnapshot.size}`);

    const topClimbers = calculateTopClimbers(currentSnapshot, previousSnapshot, 3)
      .filter((climber) => !bannedIds.has(climber.accountId));
    console.log(`[FeaturedFeed] Rankers: ${topRankers.length}, Climbers: ${topClimbers.length}`);

    // 3. Deduplicate and Map Badges
    const userMap = new Map<string, { account: any; badges: BadgeType[] }>();

    // Add Rankers
    topRankers.forEach((ranker, index) => {
      const badge = `rank-${index + 1}` as BadgeType;
      userMap.set(ranker.accountId, { account: ranker, badges: [badge] });
    });

    // Add Climbers (append badge if already exists)
    topClimbers.forEach((climber, index) => {
      const badge = `climber-${index + 1}` as BadgeType;
      if (userMap.has(climber.accountId)) {
        userMap.get(climber.accountId)!.badges.push(badge);
      } else {
        userMap.set(climber.accountId, { account: climber, badges: [badge] });
      }
    });

    // 4. Fetch Latest Posts for each user
    const postsMap = new Map<string, Post>();
    const accountIds = Array.from(userMap.keys());
    
    const fetchPromises = accountIds.map(async (accountId) => {
      const latestPost = await getLatestPost(accountId);
      if (latestPost) {
        postsMap.set(accountId, latestPost);
      }
    });

    await Promise.all(fetchPromises);

    // 5. Construct Ordered Feed
    const feedItems: FeaturedFeedItem[] = [];
    const addedAccountIds = new Set<string>();

    // Helper to add item
    const addFeedItem = (accountId: string) => {
      if (addedAccountIds.has(accountId)) return;
      
      const post = postsMap.get(accountId);
      const userInfo = userMap.get(accountId);
      
      if (post && userInfo) {
        feedItems.push({
          type: 'post',
          postId: post.postId,
          author: {
            accountId: userInfo.account.accountId,
            username: userInfo.account.username,
            originalUsername: userInfo.account.originalUsername,
            displayName: userInfo.account.displayName,
            profileImageUrl: userInfo.account.profileImageUrl,
            badges: userInfo.badges,
          },
          content: {
            platform: post.platform,
            postUrl: post.postUrl,
            postType: post.postType || 'original',
            signals: post.contentSignals,
            createdAt: post.createdAt,
          },
        });
        addedAccountIds.add(accountId);
      }
    };

    // Add Rankers first (1, 2, 3)
    topRankers.forEach(ranker => addFeedItem(ranker.accountId));

    // Add Climbers next (1, 2, 3) - skips if already added
    topClimbers.forEach(climber => addFeedItem(climber.accountId));

    const response: FeaturedFeedResponse = {
      success: true,
      seasonId,
      items: feedItems,
      calculatedAt: new Date().toISOString(),
    };

    return createResponse(200, response);
  } catch (error) {
    console.error('Error getting featured feed:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
