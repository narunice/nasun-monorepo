/**
 * GET /v3/feed/featured
 *
 * Returns featured posts for the leaderboard sidebar.
 * Priority: admin-curated feed > algorithmic fallback.
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
  DYNAMO_KEYS,
} from '../types';
import {
  getActiveSeason,
  getSeasonById,
  getBannedAccountIds,
} from '../services/dynamodb-client';
import { getCuratedFeedRecord, enrichCuratedItems } from '../services/curated-feed';
import { createResponse, getRequestOrigin } from '../utils/response';
import { getTodayDateString, getDateNDaysAgo, getDayOfYearKST } from '../utils/date';

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
 * Get the best recent post for a specific account.
 * Fetches the latest 20 posts, excludes replies, and returns the highest-scoring one.
 * Posts without a score are treated as 0 (older posts naturally rank below scored ones).
 */
async function getBestRecentPost(accountId: string): Promise<Post | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: POSTS_TABLE,
      IndexName: DYNAMO_KEYS.POSTS_CREATED_AT_INDEX || 'createdAt-index',
      KeyConditionExpression: 'accountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': accountId,
      },
      ScanIndexForward: false, // Latest first
      Limit: 20,
    })
  );

  if (!result.Items || result.Items.length === 0) return null;

  const candidates = (result.Items as Post[]).filter(
    (post) => post.postType === 'original' || post.postType === 'quote'
  );

  if (candidates.length === 0) return null;

  // Sort by postScore descending; treat missing postScore as 0
  candidates.sort((a, b) => (b.postScore ?? 0) - (a.postScore ?? 0));

  // Rotate among top 3 posts daily for content variety while maintaining quality
  const top = candidates.slice(0, 3);
  const dayOfYear = getDayOfYearKST();
  return top[dayOfYear % top.length];
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  console.log('Get Featured Feed request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
  }

  try {
    const MAX_FEED_ITEMS = 15;

    // Check for admin-curated items first (before season resolution)
    const curatedRecord = await getCuratedFeedRecord();
    let curatedItems: FeaturedFeedItem[] = [];
    const curatedAccountIds = new Set<string>();

    if (curatedRecord && curatedRecord.items.length > 0) {
      curatedItems = await enrichCuratedItems(curatedRecord.items);
      for (const item of curatedItems) {
        curatedAccountIds.add(item.author.accountId);
      }
      console.log(`[FeaturedFeed] Curated: ${curatedItems.length} items (updated: ${curatedRecord.updatedAt})`);

      // If curated items already fill all slots, return immediately
      if (curatedItems.length >= MAX_FEED_ITEMS) {
        return respond(200, {
          success: true,
          seasonId: 'curated',
          items: curatedItems.slice(0, MAX_FEED_ITEMS),
          calculatedAt: curatedRecord.updatedAt,
        } as FeaturedFeedResponse);
      }
    }

    // Fill remaining slots with algorithmic feed
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
      return respond(404, { error: 'No active season found' });
    }
    seasonId = season.seasonId;

    // 2. Identify Target Users (Rankers and Climbers)
    
    // A. Top 3 Rankers (from latest snapshot, consistent with leaderboard page)
    const bannedIds = await getBannedAccountIds();
    const todayDate = getTodayDateString();
    const currentSnapshot = await getSnapshot(seasonId, todayDate);

    // Fallback if today's snapshot not ready
    if (currentSnapshot.size === 0) {
      const yesterday = getDateNDaysAgo(1);
      const yesterdaySnapshot = await getSnapshot(seasonId, yesterday);
      for (const [k, v] of yesterdaySnapshot) currentSnapshot.set(k, v);
      console.log(`[FeaturedFeed] Today snapshot empty, using yesterday's (${yesterday}), size=${yesterdaySnapshot.size}`);
    }

    const allRankedUsers = Array.from(currentSnapshot.values())
      .filter((s) => !bannedIds.has(s.accountId))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 18);

    const topRankers = allRankedUsers.slice(0, 3);
    const remainingRankers = allRankedUsers.slice(3);

    // B. Top 3 Climbers (excluding rankers to always fill 3 distinct climber slots)
    const sevenDaysAgo = getDateNDaysAgo(7);

    // Smart Fallback for previous snapshot: 7d → 1d
    let previousDate = sevenDaysAgo;
    let previousSnapshot = await getSnapshot(seasonId, previousDate);
    if (previousSnapshot.size === 0) {
      previousDate = getDateNDaysAgo(1);
      previousSnapshot = await getSnapshot(seasonId, previousDate);
      console.log(`[FeaturedFeed] 7-day snapshot empty, falling back to 1-day (${previousDate}), size=${previousSnapshot.size}`);
    }

    console.log(`[FeaturedFeed] Snapshot dates: current=${todayDate}, previous=${previousDate}, currentSize=${currentSnapshot.size}, previousSize=${previousSnapshot.size}`);

    // Fetch extra climbers (10) to account for overlap with rankers, then pick top 3 non-rankers
    const rankerIds = new Set(topRankers.map((r) => r.accountId));
    const topClimbers = calculateTopClimbers(currentSnapshot, previousSnapshot, 10)
      .filter((climber) => !bannedIds.has(climber.accountId) && !rankerIds.has(climber.accountId))
      .slice(0, 3);
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

    // Add Remaining Rankers 4+ (generic 'ranker' badge, skip if already in map as climber)
    remainingRankers.forEach((ranker) => {
      if (!userMap.has(ranker.accountId)) {
        userMap.set(ranker.accountId, { account: ranker, badges: ['ranker'] });
      }
    });

    // 4. Fetch Latest Posts for each user
    const postsMap = new Map<string, Post>();
    const accountIds = Array.from(userMap.keys());
    
    const fetchPromises = accountIds.map(async (accountId) => {
      const latestPost = await getBestRecentPost(accountId);
      if (latestPost) {
        postsMap.set(accountId, latestPost);
      }
    });

    await Promise.all(fetchPromises);

    // 5. Construct Ordered Feed (algorithmic portion)
    const algorithmicItems: FeaturedFeedItem[] = [];
    const addedAccountIds = new Set<string>(curatedAccountIds); // Exclude curated accounts

    const remainingSlots = MAX_FEED_ITEMS - curatedItems.length;

    // Helper to add item
    const addFeedItem = (accountId: string) => {
      if (algorithmicItems.length >= remainingSlots) return;
      if (addedAccountIds.has(accountId)) return;

      const post = postsMap.get(accountId);
      const userInfo = userMap.get(accountId);

      if (post && userInfo) {
        algorithmicItems.push({
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

    // Priority 1: Rankers 1-3
    topRankers.forEach(ranker => addFeedItem(ranker.accountId));
    // Priority 2: Climbers 1-3 (skips if already added as ranker)
    topClimbers.forEach(climber => addFeedItem(climber.accountId));
    // Priority 3: Rankers 4+ (fill remaining space)
    for (const ranker of remainingRankers) {
      if (algorithmicItems.length >= remainingSlots) break;
      addFeedItem(ranker.accountId);
    }

    // Combine: curated first, then algorithmic fill
    const allItems = [...curatedItems, ...algorithmicItems];
    console.log(`[FeaturedFeed] Curated: ${curatedItems.length}, Algorithmic: ${algorithmicItems.length}, Total: ${allItems.length}`);

    const response: FeaturedFeedResponse = {
      success: true,
      seasonId: seasonId!,
      items: allItems,
      calculatedAt: new Date().toISOString(),
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting featured feed:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
