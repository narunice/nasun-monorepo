/**
 * X API v2 Client for NFT Event Verification
 *
 * Cost-optimized for X API pay-per-use pricing (Feb 2026+):
 * - Post object: $0.005, User object: $0.010
 * - Uses userTimeline (Post objects) instead of tweetRetweetedBy (User objects)
 * - max_results tuned for cost vs false-negative balance
 *
 * Verification logic (Mar 2026):
 * - Like: any @Nasun_io post (author_id matching, not specific tweet ID)
 * - Repost: any @Nasun_io post via retweet or quote tweet (expansion + author_id)
 *
 * Both checkLiked and checkReposted accept an optional overrideToken
 * for User Context OAuth (per-user rate limits, protected account access).
 * When omitted, App-Only Bearer Token is used.
 */

import { TwitterApi } from 'twitter-api-v2';

export interface XApiConfig {
  bearerToken: string;
  targetUserId: string; // @Nasun_io's X User ID (for author_id matching)
}

export interface VerificationResult {
  success: boolean;
  hasLiked?: boolean;
  hasReposted?: boolean;
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
   * Check if user liked any @Nasun_io post (author_id matching).
   *
   * Uses GET /2/users/:id/liked_tweets (Post objects, $0.005 each).
   * tweet.fields: ['author_id'] adds author info at no extra cost.
   * max_results=20: likes are frequent — 5~10 risks false negatives.
   *
   * @param userId X User ID
   * @param overrideToken User OAuth token for User Context (optional)
   */
  async checkLiked(userId: string, overrideToken?: string): Promise<boolean> {
    try {
      const client = overrideToken ? new TwitterApi(overrideToken) : this.client;
      const authMode = overrideToken ? 'User Context' : 'App-Only';
      console.log(`[XApiClient] Checking like (${authMode}) for user ${userId} on any @Nasun_io post`);

      const likedTweets = await client.v2.userLikedTweets(userId, {
        max_results: 20,
        'tweet.fields': ['author_id'],
      });

      const tweets = likedTweets.tweets || [];
      const hasLiked = tweets.some(
        (tweet: any) => tweet.author_id === this.config.targetUserId
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
   * Check if user reposted (retweeted or quote-tweeted) any @Nasun_io post.
   *
   * Uses GET /2/users/:id/tweets (Post objects, $0.005 each) with
   * expansions: ['referenced_tweets.id'] to get original tweet author_id.
   * exclude: ['replies'] reduces expansion object count for cost savings.
   *
   * Detection logic:
   *   1. Get user's recent timeline tweets
   *   2. From includes.tweets (expanded referenced tweets), find Nasun posts
   *   3. Check if any tweet references (retweet or quote) a Nasun post
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
  async checkReposted(userId: string, overrideToken?: string): Promise<boolean> {
    try {
      const client = overrideToken ? new TwitterApi(overrideToken) : this.client;
      const authMode = overrideToken ? 'User Context' : 'App-Only';
      console.log(`[XApiClient] Checking repost (${authMode}) for user ${userId} on any @Nasun_io post`);

      const timeline = await client.v2.userTimeline(userId, {
        max_results: 10,
        exclude: ['replies'],
        'tweet.fields': ['referenced_tweets', 'author_id'],
        expansions: ['referenced_tweets.id'],
      });

      // Build set of Nasun tweet IDs from expanded referenced tweets
      const nasunTweetIds = new Set(
        (timeline.data.includes?.tweets || [])
          .filter((t: any) => t.author_id === this.config.targetUserId)
          .map((t: any) => t.id)
      );

      const tweets = timeline.data?.data || [];
      const hasReposted = tweets.some((tweet: any) => {
        const refs = tweet.referenced_tweets || [];
        return refs.some(
          (ref: any) =>
            (ref.type === 'retweeted' || ref.type === 'quoted') &&
            nasunTweetIds.has(ref.id)
        );
      });

      console.log(`[XApiClient] Repost check result: ${hasReposted} (${authMode}, ${tweets.length} tweets, ${nasunTweetIds.size} Nasun refs found)`);
      return hasReposted;
    } catch (error: any) {
      console.error('[XApiClient] Error checking reposted:', error);

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
   * Verify both Like and Repost in parallel.
   *
   * @param userId X User ID
   * @param overrideToken User OAuth token (optional)
   */
  async verifyAll(userId: string, overrideToken?: string): Promise<VerificationResult> {
    try {
      console.log(`[XApiClient] Starting parallel verification for user ${userId}`);

      const results = await Promise.allSettled([
        this.checkLiked(userId, overrideToken),
        this.checkReposted(userId, overrideToken),
      ]);

      const [likedResult, repostedResult] = results;

      const hasLiked = likedResult.status === 'fulfilled' ? likedResult.value : undefined;
      const hasReposted = repostedResult.status === 'fulfilled' ? repostedResult.value : undefined;

      const errors: string[] = [];
      if (likedResult.status === 'rejected') {
        errors.push(`Like check failed: ${likedResult.reason?.message || 'Unknown error'}`);
      }
      if (repostedResult.status === 'rejected') {
        errors.push(`Repost check failed: ${repostedResult.reason?.message || 'Unknown error'}`);
      }

      console.log('[XApiClient] Verification complete:', {
        hasLiked,
        hasReposted,
        errors: errors.length > 0 ? errors : undefined,
      });

      const anySuccess = hasLiked !== undefined || hasReposted !== undefined;

      return {
        success: anySuccess,
        hasLiked,
        hasReposted,
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
