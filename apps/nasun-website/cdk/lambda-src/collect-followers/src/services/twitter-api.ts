// X API Client for fetching followers

import { TwitterApi } from 'twitter-api-v2';

export interface Follower {
  id: string;
  username: string;
  name: string;
  profileImageUrl?: string;
  followersCount?: number;
  followingCount?: number;
  verified?: boolean;
  createdAt?: string;
}

export type AuthType = 'bearer' | 'oauth2';

export class TwitterApiService {
  private client: TwitterApi;
  private authType: AuthType;

  constructor(token: string, authType: AuthType = 'bearer') {
    this.authType = authType;
    this.client = new TwitterApi(token);
    console.log(`[TWITTER_API] Initialized with ${authType} authentication`);
  }

  /**
   * Create client with OAuth 2.0 User Context token
   * Required for followers endpoint on Free tier
   */
  static withOAuth2UserContext(accessToken: string): TwitterApiService {
    return new TwitterApiService(accessToken, 'oauth2');
  }

  /**
   * Create client with Bearer token
   * Requires Basic tier ($100/month) for followers endpoint
   */
  static withBearerToken(bearerToken: string): TwitterApiService {
    return new TwitterApiService(bearerToken, 'bearer');
  }

  /**
   * Fetch all followers for a given user ID with pagination
   * X API v2: GET /2/users/:id/followers
   * Rate Limit: 15 requests / 15 minutes (Basic Plan)
   * Max results per request: 1000
   */
  async fetchAllFollowers(userId: string, maxFollowers: number = 15000): Promise<Follower[]> {
    const allFollowers: Follower[] = [];
    let paginationToken: string | undefined;
    let requestCount = 0;
    const maxRequests = 15; // Rate limit protection

    console.log(`[TWITTER_API] Fetching followers for user ID: ${userId}`);

    try {
      do {
        requestCount++;
        console.log(`[TWITTER_API] Request #${requestCount}, current count: ${allFollowers.length}`);

        const response = await this.client.v2.followers(userId, {
          max_results: 1000,
          pagination_token: paginationToken,
          'user.fields': [
            'id',
            'username',
            'name',
            'profile_image_url',
            'public_metrics',
            'verified',
            'created_at',
          ],
        });

        if (response.data) {
          const followers = response.data.map((user): Follower => ({
            id: user.id,
            username: user.username,
            name: user.name,
            profileImageUrl: user.profile_image_url,
            followersCount: user.public_metrics?.followers_count,
            followingCount: user.public_metrics?.following_count,
            verified: user.verified,
            createdAt: user.created_at,
          }));

          allFollowers.push(...followers);
          console.log(`[TWITTER_API] Fetched ${followers.length} followers, total: ${allFollowers.length}`);
        }

        paginationToken = response.meta?.next_token;

        // Rate limit protection: wait between requests
        if (paginationToken && requestCount < maxRequests) {
          await this.delay(1000); // 1 second delay between requests
        }
      } while (
        paginationToken &&
        requestCount < maxRequests &&
        allFollowers.length < maxFollowers
      );

      console.log(`[TWITTER_API] Completed: ${allFollowers.length} followers fetched in ${requestCount} requests`);
      return allFollowers;
    } catch (error: any) {
      console.error('[TWITTER_API] Error fetching followers:', error.message);

      // Handle rate limit errors
      if (error.code === 429) {
        console.error('[TWITTER_API] Rate limit exceeded. Please wait and retry.');
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      throw error;
    }
  }

  /**
   * Get user by username
   * Useful for resolving username to user ID
   */
  async getUserByUsername(username: string): Promise<{ id: string; username: string; name: string } | null> {
    try {
      const response = await this.client.v2.userByUsername(username, {
        'user.fields': ['id', 'username', 'name'],
      });

      if (response.data) {
        return {
          id: response.data.id,
          username: response.data.username,
          name: response.data.name,
        };
      }

      return null;
    } catch (error: any) {
      console.error(`[TWITTER_API] Error fetching user ${username}:`, error.message);
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
