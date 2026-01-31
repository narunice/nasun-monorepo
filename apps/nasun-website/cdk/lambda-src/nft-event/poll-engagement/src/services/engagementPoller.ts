/**
 * Engagement Poller Service
 *
 * @description
 * Polls X API liking_users and retweeted_by endpoints using OAuth 1.0a
 * User Context (required by X API Basic Plan) and stores results in
 * DynamoDB as an engagement cache.
 *
 * Cache convention in nasun-nft-event-tasks table:
 *   PK: __LIKE_CACHE__    SK: {xUserId}  → user liked the tweet
 *   PK: __RETWEET_CACHE__ SK: {xUserId}  → user retweeted the tweet
 *
 * Limitation: Both endpoints return at most 100 users per call.
 * Users #101+ are handled by Tier 3 (per-user OAuth) in verify-eligibility.
 *
 * @author Claude Code
 * @created 2026-01-31
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { TwitterApi } from 'twitter-api-v2';

const LIKE_CACHE_PK = '__LIKE_CACHE__';
const RETWEET_CACHE_PK = '__RETWEET_CACHE__';

// DynamoDB BatchWriteItem limit
const BATCH_SIZE = 25;

export interface PollerConfig {
  // OAuth 1.0a credentials (User Context — required for Basic Plan endpoints)
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
  targetTweetId: string;
  tasksTableName: string;
}

export class EngagementPoller {
  private client: TwitterApi;
  private docClient: DynamoDBDocumentClient;
  private config: PollerConfig;

  constructor(config: PollerConfig) {
    this.config = config;
    // OAuth 1.0a User Context — required by X API Basic Plan for retweeted_by and liking_users
    this.client = new TwitterApi({
      appKey: config.appKey,
      appSecret: config.appSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessSecret,
    });
    const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
  }

  /**
   * Poll liking_users and retweeted_by, update both caches.
   * Uses OAuth 1.0a User Context (required by X API Basic Plan).
   * Rate limit: 2 calls per poll = ~6 calls/15min (8% of 75-call limit).
   */
  async poll(): Promise<{ likesCount: number; retweetsCount: number }> {
    const [likeUserIds, retweetUserIds] = await Promise.all([
      this.fetchLikingUsers(),
      this.fetchRetweetedBy(),
    ]);

    console.log(`[EngagementPoller] Fetched ${likeUserIds.length} liking users, ${retweetUserIds.length} retweeting users`);

    await Promise.all([
      this.refreshCache(LIKE_CACHE_PK, likeUserIds),
      this.refreshCache(RETWEET_CACHE_PK, retweetUserIds),
    ]);

    return {
      likesCount: likeUserIds.length,
      retweetsCount: retweetUserIds.length,
    };
  }

  /**
   * GET /2/tweets/:id/liking_users — up to 100 users
   */
  private async fetchLikingUsers(): Promise<string[]> {
    try {
      const result = await this.client.v2.tweetLikedBy(
        this.config.targetTweetId,
        { max_results: 100 }
      );

      const users = result.data || [];
      return users.map((u) => u.id);
    } catch (error: any) {
      console.error('[EngagementPoller] Error fetching liking_users:', error.message || error);
      if (error.code === 429) {
        console.warn('[EngagementPoller] Rate limited on liking_users, skipping');
        return [];
      }
      // Non-fatal for polling — return empty so retweet cache can still update
      return [];
    }
  }

  /**
   * GET /2/tweets/:id/retweeted_by — up to 100 users
   */
  private async fetchRetweetedBy(): Promise<string[]> {
    try {
      const result = await this.client.v2.tweetRetweetedBy(
        this.config.targetTweetId,
        { max_results: 100 }
      );

      const users = result.data || [];
      return users.map((u) => u.id);
    } catch (error: any) {
      console.error('[EngagementPoller] Error fetching retweeted_by:', error.message || error);
      if (error.code === 429) {
        console.warn('[EngagementPoller] Rate limited on retweeted_by, skipping');
      }
      // Non-fatal for polling — return empty so like cache can still update
      return [];
    }
  }

  /**
   * Replace all cache entries for a given PK with new user IDs
   */
  private async refreshCache(pk: string, userIds: string[]): Promise<void> {
    // 1. Delete existing cache entries
    await this.deleteAllCacheEntries(pk);

    // 2. Write new entries in batches
    if (userIds.length === 0) return;

    const polledAt = new Date().toISOString();
    const items = userIds.map((userId) => ({
      PutRequest: {
        Item: {
          walletAddress: pk,
          taskType: userId,
          completed: true,
          polledAt,
        },
      },
    }));

    // BatchWriteItem supports max 25 items per call
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.config.tasksTableName]: batch,
          },
        })
      );
    }

    console.log(`[EngagementPoller] Wrote ${userIds.length} entries to ${pk}`);
  }

  /**
   * Delete all existing cache entries for a given PK
   */
  private async deleteAllCacheEntries(pk: string): Promise<void> {
    try {
      // Query all existing entries
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.config.tasksTableName,
          KeyConditionExpression: 'walletAddress = :pk',
          ExpressionAttributeValues: {
            ':pk': pk,
          },
          ProjectionExpression: 'walletAddress, taskType',
        })
      );

      const existingItems = result.Items || [];
      if (existingItems.length === 0) return;

      // Delete in batches
      const deleteRequests = existingItems.map((item) => ({
        DeleteRequest: {
          Key: {
            walletAddress: item.walletAddress,
            taskType: item.taskType,
          },
        },
      }));

      for (let i = 0; i < deleteRequests.length; i += BATCH_SIZE) {
        const batch = deleteRequests.slice(i, i + BATCH_SIZE);
        await this.docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.config.tasksTableName]: batch,
            },
          })
        );
      }

      console.log(`[EngagementPoller] Deleted ${existingItems.length} stale entries from ${pk}`);
    } catch (error: any) {
      console.error(`[EngagementPoller] Error deleting cache entries for ${pk}:`, error);
      // Non-fatal — continue with write
    }
  }
}
