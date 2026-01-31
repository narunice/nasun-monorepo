/**
 * Engagement Cache Service
 *
 * @description
 * DynamoDB nasun-nft-event-tasks 테이블에서 poll-engagement Lambda가 저장한
 * 캐시 엔트리를 조회하는 서비스 (Tier 2)
 *
 * Cache key convention:
 *   PK: __LIKE_CACHE__   SK: {xUserId}  → Like 확인됨
 *   PK: __RETWEET_CACHE__ SK: {xUserId} → Retweet 확인됨
 *
 * @author Claude Code
 * @created 2026-01-31
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const LIKE_CACHE_PK = '__LIKE_CACHE__';
const RETWEET_CACHE_PK = '__RETWEET_CACHE__';

export class EngagementCache {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  /**
   * Check if a user's like is in the engagement cache
   */
  async isUserInLikeCache(xUserId: string): Promise<boolean> {
    return this.checkCache(LIKE_CACHE_PK, xUserId);
  }

  /**
   * Check if a user's retweet is in the engagement cache
   */
  async isUserInRetweetCache(xUserId: string): Promise<boolean> {
    return this.checkCache(RETWEET_CACHE_PK, xUserId);
  }

  /**
   * Check both like and retweet caches in parallel
   *
   * @returns { likeFound, retweetFound }
   */
  async checkBoth(xUserId: string): Promise<{ likeFound: boolean; retweetFound: boolean }> {
    const [likeFound, retweetFound] = await Promise.all([
      this.isUserInLikeCache(xUserId),
      this.isUserInRetweetCache(xUserId),
    ]);
    return { likeFound, retweetFound };
  }

  private async checkCache(pk: string, xUserId: string): Promise<boolean> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            walletAddress: pk,
            taskType: xUserId,
          },
        })
      );
      return result.Item !== undefined;
    } catch (error: any) {
      console.error(`[EngagementCache] Error checking cache ${pk}/${xUserId}:`, error);
      // Cache miss on error — fall through to next tier
      return false;
    }
  }
}
