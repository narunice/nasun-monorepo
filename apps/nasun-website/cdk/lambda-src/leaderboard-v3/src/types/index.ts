/**
 * Nasun Community Leaderboard V3 - Type Definitions
 *
 * This is a completely independent system from v2.
 * Do not import or depend on any v2 code.
 */

// ============================================
// Enums & Constants
// ============================================

export type Platform = 'twitter' | 'discord' | 'farcaster';

export type AccountRole = 'kol' | 'proactive_ct' | 'default';

export type ContentSignal = 'standard' | 'insight' | 'creative' | 'high_reach';

export const ROLE_MULTIPLIERS: Record<AccountRole, number> = {
  kol: 2.0,
  proactive_ct: 1.5,
  default: 1.0,
};

export const SIGNAL_BONUSES: Record<ContentSignal, number> = {
  standard: 0,
  insight: 1,
  creative: 1,
  high_reach: 1,
};

// Score calculation constants
export const SCORE_CONSTANTS = {
  BASE_SCORE: 1,
  POST_SCORE_MAX: 5.0, // KOL(2.0) + all signals(3) = 5.0
  CONSISTENCY_BONUS_MULTIPLIER: 0.1,
  CONSISTENCY_BONUS_MAX: 1.5, // cap at 30 days
  FRESHNESS_HALF_LIFE_DAYS: 14,
};

// ============================================
// Database Models
// ============================================

/**
 * Post record stored in DynamoDB
 */
export interface Post {
  postId: string; // UUID, Primary Key
  platform: Platform;
  postUrl: string; // Normalized URL, Unique
  postUrlRaw: string; // Original URL for debugging
  accountId: string; // FK to Account
  username: string; // Denormalized for convenience
  accountRole: AccountRole;
  contentSignals: ContentSignal[];
  baseScore: number; // Always 1.0
  roleMultiplier: number; // 1.0 / 1.5 / 2.0
  signalBonus: number; // 0 ~ 3
  postScore: number; // baseScore × roleMultiplier + signalBonus
  createdAt: string; // ISO timestamp
  createdBy: string; // Admin username who added this post
}

/**
 * Account record stored in DynamoDB
 * Aggregated fields are updated on each post registration
 */
export interface Account {
  accountId: string; // UUID, Primary Key
  platform: Platform;
  username: string; // Unique per platform

  // Role tracking
  lastKnownRole: AccountRole;

  // Profile data (from UserProfiles table via Internal Data Sync)
  displayName?: string; // X display name
  profileImageUrl?: string; // X profile image URL
  isRegistered?: boolean; // Whether user has logged in to Nasun website

  // Aggregated fields (updated on post registration)
  totalPostScore: number; // Σ(PostScore)
  postCount: number; // Number of registered posts
  signalCountTotal: number; // Total Insight + Creative + High Reach checks
  uniqueActiveDays: number; // Count of unique active days
  activeDates: string[]; // Array of date strings (YYYY-MM-DD) for tracking

  // Timestamps
  firstSeenAt: string; // ISO timestamp
  lastSeenAt: string; // ISO timestamp of last post
}

/**
 * Computed user score (calculated at read-time)
 * Not stored in DB - calculated dynamically
 */
export interface ComputedUserScore {
  accountId: string;
  username: string;
  platform: Platform;

  // Profile data (from Account via Internal Data Sync)
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;

  // Raw aggregates from Account
  totalPostScore: number;
  postCount: number;
  signalCountTotal: number;
  uniqueActiveDays: number;
  lastSeenAt: string;

  // Computed values
  effectivePosts: number; // log₂(postCount + 1)
  rawScore: number; // totalPostScore × effectivePosts / postCount
  consistencyBonus: number; // 1 + log₂(uniqueActiveDays + 1) × 0.1
  freshnessMultiplier: number; // 1 / (1 + daysSinceLastPost / 14)
  userScore: number; // rawScore × consistencyBonus × freshnessMultiplier
}

/**
 * Leaderboard entry returned by API
 */
export interface LeaderboardEntry {
  rank: number;
  username: string;
  platform: Platform;
  userScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastActivity: string;

  // Profile data (from Account via Internal Data Sync)
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;

  // Breakdown for transparency (optional)
  breakdown?: {
    rawScore: number;
    consistencyBonus: number;
    freshnessMultiplier: number;
  };
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * POST /v3/posts request body
 */
export interface CreatePostRequest {
  postUrl: string;
  accountRole: AccountRole;
  contentSignals: ContentSignal[];
}

/**
 * POST /v3/posts response
 */
export interface CreatePostResponse {
  success: boolean;
  post?: Post;
  account?: Account;
  error?: string;
  isDuplicate?: boolean;
}

/**
 * GET /v3/leaderboard query parameters
 */
export interface GetLeaderboardParams {
  period?: 'weekly' | 'monthly' | 'alltime';
  limit?: number;
  offset?: number;
}

/**
 * GET /v3/leaderboard response
 */
export interface GetLeaderboardResponse {
  entries: LeaderboardEntry[];
  totalCount: number;
  period: string;
  calculatedAt: string;
}

/**
 * GET /v3/accounts/:username response
 */
export interface GetAccountResponse {
  found: boolean;
  account?: Account;
  recentPosts?: Post[];
}

/**
 * Admin authentication
 */
export interface AdminAuthRequest {
  password: string;
}

export interface AdminAuthResponse {
  authenticated: boolean;
  token?: string;
  expiresAt?: string;
}

// ============================================
// DynamoDB Key Schemas
// ============================================

export const DYNAMO_KEYS = {
  // Posts table
  POSTS_TABLE: 'leaderboard-v3-posts',
  POSTS_PK: 'postId',
  POSTS_URL_INDEX: 'postUrl-index',

  // Accounts table
  ACCOUNTS_TABLE: 'leaderboard-v3-accounts',
  ACCOUNTS_PK: 'accountId',
  ACCOUNTS_USERNAME_INDEX: 'platform-username-index',
};
