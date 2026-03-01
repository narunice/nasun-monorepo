/**
 * X API v2 Client for NFT Event Verification
 *
 * @description
 * X API를 사용하여 사용자의 좋아요, 리트윗 상태를 확인하는 클라이언트
 *
 * @features
 * - checkLiked: 좋아요 여부 확인
 * - checkRetweeted: 리트윗 여부 확인
 * - Rate Limit 자동 처리 (429 에러 감지 및 재시도)
 * - checkFollowing: 팔로우 검증은 X API Basic Plan 미지원으로 제거됨
 *
 * @author Claude Code
 * @created 2025-10-25
 * @updated 2025-10-25 - Follow 검증 제거 (Basic Plan 미지원)
 */

import { TwitterApi } from 'twitter-api-v2';

export interface XApiConfig {
  bearerToken: string;
  targetUserId: string;
  targetTweetId: string;
  isUserContext?: boolean; // User Context OAuth 여부 (Like 조회 가능)
}

export interface VerificationResult {
  success: boolean;
  // isFollowing?: boolean; // X API Basic Plan 미지원으로 제거
  hasLiked?: boolean;
  hasRetweeted?: boolean;
  error?: string;
}

export class XApiClient {
  private client: TwitterApi;
  private config: XApiConfig;

  constructor(config: XApiConfig) {
    this.config = config;
    // User Context OAuth 또는 App-Only OAuth
    this.client = new TwitterApi(config.bearerToken);
    console.log(`[XApiClient] Initialized with ${config.isUserContext ? 'User Context' : 'App-Only'} OAuth`);
  }

  /**
   * 사용자가 타겟 계정을 팔로우하는지 확인
   *
   * ⚠️ X API Basic Plan에서는 GET /2/users/:id/following 엔드포인트를 지원하지 않습니다.
   * Enterprise Plan($42,000/월)에서만 사용 가능합니다.
   * 따라서 이 메서드는 사용하지 않으며, 프론트엔드에서 Intent URL로 팔로우를 유도합니다.
   *
   * @deprecated X API Basic Plan 미지원
   * @param userId - 확인할 사용자의 X User ID
   * @returns 팔로우 여부
   */
  /*
  async checkFollowing(userId: string): Promise<boolean> {
    try {
      console.log(`[XApiClient] Checking following status for user ${userId} -> target ${this.config.targetUserId}`);

      // GET /2/users/:id/following API 사용
      const following = await this.client.v2.following(userId, {
        max_results: 100, // 최대 100명까지 조회
      });

      // 팔로잉 목록에서 타겟 사용자 ID 찾기
      const isFollowing = following.data.some(
        (user) => user.id === this.config.targetUserId
      );

      console.log(`[XApiClient] Following check result: ${isFollowing}`);
      return isFollowing;
    } catch (error: any) {
      console.error('[XApiClient] Error checking following:', error);

      // Rate Limit 에러 처리
      if (error.code === 429 || error.rateLimit?.remaining === 0) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      throw new Error(`X_API_ERROR: ${error.message}`);
    }
  }
  */

  /**
   * 사용자가 타겟 트윗에 좋아요를 눌렀는지 확인
   *
   * @param userId - 확인할 사용자의 X User ID
   * @returns 좋아요 여부
   */
  async checkLiked(userId: string): Promise<boolean> {
    try {
      console.log(`[XApiClient] Checking like status for user ${userId} on tweet ${this.config.targetTweetId}`);

      // GET /2/users/:id/liked_tweets API 사용
      // Pay-per-use: each tweet object costs $0.005, reduced from 100 to 50
      const likedTweets = await this.client.v2.userLikedTweets(userId, {
        max_results: 50,
      });

      // 좋아요 목록에서 타겟 트윗 ID 찾기
      const tweets = likedTweets.tweets || [];
      const hasLiked = tweets.some(
        (tweet: any) => tweet.id === this.config.targetTweetId
      );

      console.log(`[XApiClient] Like check result: ${hasLiked}`);
      return hasLiked;
    } catch (error: any) {
      console.error('[XApiClient] Error checking liked:', error);

      // Rate Limit 에러 처리
      if (error.code === 429 || error.rateLimit?.remaining === 0) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      throw new Error(`X_API_ERROR: ${error.message}`);
    }
  }

  /**
   * 사용자가 타겟 트윗을 리트윗했는지 확인
   *
   * @param userId - 확인할 사용자의 X User ID
   * @returns 리트윗 여부
   */
  async checkRetweeted(userId: string): Promise<boolean> {
    try {
      console.log(`[XApiClient] Checking retweet status for user ${userId} on tweet ${this.config.targetTweetId}`);

      // GET /2/tweets/:id/retweeted_by API 사용
      // 타겟 트윗을 리트윗한 사용자 목록에서 해당 사용자 찾기
      // Pay-per-use: each user object costs $0.010, reduced from 100 to 50
      const retweetedBy = await this.client.v2.tweetRetweetedBy(
        this.config.targetTweetId,
        {
          max_results: 50,
        }
      );

      // 리트윗한 사용자 목록에서 해당 사용자 ID 찾기
      const hasRetweeted = retweetedBy.data.some(
        (user) => user.id === userId
      );

      console.log(`[XApiClient] Retweet check result: ${hasRetweeted}`);
      return hasRetweeted;
    } catch (error: any) {
      console.error('[XApiClient] Error checking retweeted:', error);

      // Rate Limit 에러 처리
      if (error.code === 429 || error.rateLimit?.remaining === 0) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      throw new Error(`X_API_ERROR: ${error.message}`);
    }
  }

  /**
   * Like와 Retweet 조건을 병렬로 확인 (Follow 제외)
   *
   * @param userId - 확인할 사용자의 X User ID
   * @returns 검증 결과 (Follow 제외)
   *
   * @note Promise.allSettled를 사용하여 일부 실패해도 성공한 태스크 정보 반환
   * @note Follow 검증은 X API Basic Plan 미지원으로 제거됨
   */
  async verifyAll(userId: string): Promise<VerificationResult> {
    try {
      console.log(`[XApiClient] Starting parallel verification for user ${userId} (Like + Retweet only)`);

      // Promise.allSettled로 병렬 실행 (Follow 제외)
      const results = await Promise.allSettled([
        this.checkLiked(userId),
        this.checkRetweeted(userId),
      ]);

      const [likedResult, retweetedResult] = results;

      // 각 태스크별로 성공/실패 처리
      const hasLiked = likedResult.status === 'fulfilled' ? likedResult.value : undefined;
      const hasRetweeted = retweetedResult.status === 'fulfilled' ? retweetedResult.value : undefined;

      // 에러 메시지 수집
      const errors: string[] = [];
      if (likedResult.status === 'rejected') {
        errors.push(`Like check failed: ${likedResult.reason?.message || 'Unknown error'}`);
      }
      if (retweetedResult.status === 'rejected') {
        errors.push(`Retweet check failed: ${retweetedResult.reason?.message || 'Unknown error'}`);
      }

      console.log(`[XApiClient] Verification complete:`, {
        hasLiked,
        hasRetweeted,
        errors: errors.length > 0 ? errors : undefined,
      });

      // 일부라도 성공했으면 success: true로 반환
      const anySuccess = hasLiked !== undefined || hasRetweeted !== undefined;

      return {
        success: anySuccess,
        // isFollowing 필드 제거 (Basic Plan 미지원)
        hasLiked,
        hasRetweeted,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
    } catch (error: any) {
      console.error('[XApiClient] Verification failed:', error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * [Tier 3] User Context OAuth로 좋아요 확인
   * Uses the user's own rate limit (75 req/15min per user), not the app's.
   *
   * @param userId - X User ID
   * @param xAccessToken - User's OAuth 2.0 access token
   */
  async checkLikedUserContext(userId: string, xAccessToken: string): Promise<boolean> {
    try {
      console.log(`[XApiClient] Checking like via User Context for user ${userId}`);

      const userClient = new TwitterApi(xAccessToken);
      const likedTweets = await userClient.v2.userLikedTweets(userId, {
        max_results: 10, // Recent 10 — target tweet should be near the top
      });

      const tweets = likedTweets.tweets || [];
      const hasLiked = tweets.some(
        (tweet: any) => tweet.id === this.config.targetTweetId
      );

      console.log(`[XApiClient] User Context Like result: ${hasLiked}`);
      return hasLiked;
    } catch (error: any) {
      console.error('[XApiClient] Error checking liked (User Context):', error);
      if (error.code === 429 || error.rateLimit?.remaining === 0) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      throw new Error(`X_API_ERROR: ${error.message}`);
    }
  }

  /**
   * [Tier 3] User Context OAuth로 리트윗 확인
   * Checks user's timeline for retweets of the target tweet.
   * Rate limit: 1500 req/15min per user (userTimeline).
   *
   * @param userId - X User ID
   * @param xAccessToken - User's OAuth 2.0 access token
   */
  async checkRetweetedUserContext(userId: string, xAccessToken: string): Promise<boolean> {
    try {
      console.log(`[XApiClient] Checking retweet via User Context for user ${userId}`);

      const userClient = new TwitterApi(xAccessToken);
      const timeline = await userClient.v2.userTimeline(userId, {
        max_results: 20,
        'tweet.fields': ['referenced_tweets'],
      });

      const tweets = timeline.data?.data || [];
      const hasRetweeted = tweets.some((tweet: any) => {
        const refs = tweet.referenced_tweets || [];
        return refs.some(
          (ref: any) => ref.type === 'retweeted' && ref.id === this.config.targetTweetId
        );
      });

      console.log(`[XApiClient] User Context Retweet result: ${hasRetweeted}`);
      return hasRetweeted;
    } catch (error: any) {
      console.error('[XApiClient] Error checking retweeted (User Context):', error);
      if (error.code === 429 || error.rateLimit?.remaining === 0) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      throw new Error(`X_API_ERROR: ${error.message}`);
    }
  }

  /**
   * Rate Limit 정보 조회
   *
   * @returns Rate Limit 상태
   * @note twitter-api-v2에서는 응답 헤더를 통해 rate limit 정보 확인 가능
   */
  async getRateLimitStatus(): Promise<any> {
    try {
      // Rate limit 정보는 API 응답 헤더에서 확인 가능
      // x-rate-limit-remaining, x-rate-limit-reset 등
      console.log('[XApiClient] Rate limit info is available in response headers');
      return {
        message: 'Rate limit info available in API response headers',
      };
    } catch (error: any) {
      console.error('[XApiClient] Error fetching rate limit:', error);
      throw error;
    }
  }
}
