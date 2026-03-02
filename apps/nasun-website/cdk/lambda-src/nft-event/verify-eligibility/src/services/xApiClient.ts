/**
 * X API v2 Client for NFT Event Verification
 *
 * Cost-optimized for X API pay-per-use pricing (Feb 2026+):
 * - Post object: $0.005, User object: $0.010
 * - Uses userTimeline (Post objects) instead of tweetRetweetedBy (User objects)
 * - max_results tuned for cost vs false-negative balance
 *
 * Both checkLiked and checkRetweeted accept an optional overrideToken
 * for User Context OAuth (per-user rate limits, protected account access).
 * When omitted, App-Only Bearer Token is used.
 */

import { TwitterApi } from 'twitter-api-v2';

export interface XApiConfig {
  bearerToken: string;
  targetUserId: string;
  targetTweetId: string;
}

export interface VerificationResult {
  success: boolean;
  hasLiked?: boolean;
  hasRetweeted?: boolean;
  error?: string;
}

export class XApiClient {
  private client: TwitterApi;
  private config: XApiConfig;

  constructor(config: XApiConfig) {
    this.config = config;
    this.client = new TwitterApi(config.bearerToken);
    console.log('[XApiClient] Initialized with App-Only OAuth');
  }

  /**
   * Check if user liked the target tweet.
   *
   * Uses GET /2/users/:id/liked_tweets (Post objects, $0.005 each).
   * max_results=20: likes are frequent — 5~10 risks false negatives.
   *
   * @param userId X User ID
   * @param overrideToken User OAuth token for User Context (optional)
   */
  async checkLiked(userId: string, overrideToken?: string): Promise<boolean> {
    try {
      const client = overrideToken ? new TwitterApi(overrideToken) : this.client;
      const authMode = overrideToken ? 'User Context' : 'App-Only';
      console.log(`[XApiClient] Checking like (${authMode}) for user ${userId} on tweet ${this.config.targetTweetId}`);

      const likedTweets = await client.v2.userLikedTweets(userId, {
        max_results: 20,
      });

      const tweets = likedTweets.tweets || [];
      const hasLiked = tweets.some(
        (tweet: any) => tweet.id === this.config.targetTweetId
      );

      console.log(`[XApiClient] Like check result: ${hasLiked} (${authMode}, ${tweets.length} tweets checked)`);
      return hasLiked;
    } catch (error: any) {
      console.error('[XApiClient] Error checking liked:', error);

      if (error.code === 429 || error.rateLimit?.remaining === 0) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      throw new Error(`X_API_ERROR: ${error.message}`);
    }
  }

  /**
   * Check if user retweeted the target tweet via their timeline.
   *
   * Uses GET /2/users/:id/tweets (Post objects, $0.005 each) instead of
   * GET /2/tweets/:id/retweeted_by (User objects, $0.010 each).
   * This saves 90% on retweet verification costs.
   *
   * CRITICAL: tweet.fields must include 'referenced_tweets' for retweet detection.
   *
   * Rate limits:
   *   App-Only: 10,000 req/15min (vs tweetRetweetedBy's 75 req/15min)
   *   User Context: 900 req/15min
   *
   * @param userId X User ID
   * @param overrideToken User OAuth token for User Context (optional).
   *   Required for protected accounts — App-Only Bearer Token cannot access
   *   protected users' timelines (403).
   */
  async checkRetweeted(userId: string, overrideToken?: string): Promise<boolean> {
    try {
      const client = overrideToken ? new TwitterApi(overrideToken) : this.client;
      const authMode = overrideToken ? 'User Context' : 'App-Only';
      console.log(`[XApiClient] Checking retweet (${authMode}) for user ${userId} on tweet ${this.config.targetTweetId}`);

      const timeline = await client.v2.userTimeline(userId, {
        max_results: 10,
        'tweet.fields': ['referenced_tweets'],
      });

      const tweets = timeline.data?.data || [];
      const hasRetweeted = tweets.some((tweet: any) => {
        const refs = tweet.referenced_tweets || [];
        return refs.some(
          (ref: any) => ref.type === 'retweeted' && ref.id === this.config.targetTweetId
        );
      });

      console.log(`[XApiClient] Retweet check result: ${hasRetweeted} (${authMode}, ${tweets.length} tweets checked)`);
      return hasRetweeted;
    } catch (error: any) {
      console.error('[XApiClient] Error checking retweeted:', error);

      // Protected account: App-Only Bearer Token cannot access their timeline
      if (error.code === 403 || error.data?.status === 403) {
        console.warn(`[XApiClient] User ${userId} likely has a protected account (403)`);
        throw new Error('PROTECTED_ACCOUNT');
      }

      if (error.code === 429 || error.rateLimit?.remaining === 0) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      throw new Error(`X_API_ERROR: ${error.message}`);
    }
  }

  /**
   * Verify both Like and Retweet in parallel.
   *
   * @param userId X User ID
   * @param overrideToken User OAuth token (optional)
   */
  async verifyAll(userId: string, overrideToken?: string): Promise<VerificationResult> {
    try {
      console.log(`[XApiClient] Starting parallel verification for user ${userId}`);

      const results = await Promise.allSettled([
        this.checkLiked(userId, overrideToken),
        this.checkRetweeted(userId, overrideToken),
      ]);

      const [likedResult, retweetedResult] = results;

      const hasLiked = likedResult.status === 'fulfilled' ? likedResult.value : undefined;
      const hasRetweeted = retweetedResult.status === 'fulfilled' ? retweetedResult.value : undefined;

      const errors: string[] = [];
      if (likedResult.status === 'rejected') {
        errors.push(`Like check failed: ${likedResult.reason?.message || 'Unknown error'}`);
      }
      if (retweetedResult.status === 'rejected') {
        errors.push(`Retweet check failed: ${retweetedResult.reason?.message || 'Unknown error'}`);
      }

      console.log('[XApiClient] Verification complete:', {
        hasLiked,
        hasRetweeted,
        errors: errors.length > 0 ? errors : undefined,
      });

      const anySuccess = hasLiked !== undefined || hasRetweeted !== undefined;

      return {
        success: anySuccess,
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
}
