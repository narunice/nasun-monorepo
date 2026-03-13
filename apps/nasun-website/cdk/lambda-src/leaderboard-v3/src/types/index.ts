/**
 * Nasun Community Leaderboard V3 - Type Definitions
 */

// ============================================
// Enums & Constants
// ============================================

export type Platform = 'twitter' | 'discord' | 'farcaster';

export type AccountRole = 'kol' | 'proactive_ct' | 'default';

export type ContentSignal = 'standard' | 'insight' | 'creative' | 'high_reach';

// Post type: original posts get full log decay, quotes get full decay, replies get weaker decay
export type PostType = 'original' | 'quote' | 'reply';

// Language for CT market size adjustment
export type AccountLanguage = 'en' | 'zh' | 'ja' | 'ko';

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

// Post type multipliers: original/quote get full credit, reply gets reduced credit
export const POST_TYPE_MULTIPLIERS: Record<PostType, number> = {
  original: 1.0,
  quote: 1.0,
  reply: 0.5,
};

// Score calculation constants
export const SCORE_CONSTANTS = {
  BASE_SCORE: 1,
  POST_SCORE_MAX: 5.0, // max RoleMultiplier(2.0) + all signals(3) = 5.0
  CONSISTENCY_BONUS_MULTIPLIER: 0.1,
  CONSISTENCY_BONUS_MAX: 1.5, // cap at 30 days
  FRESHNESS_HALF_LIFE_DAYS: 7, // Half-life reduced from 14 to 7 days for faster decay
  // Reply decay: use postCount^0.7 instead of postCount for weaker decay
  // Original/Quote: log₂(N+1)/N (full decay)
  // Reply: log₂(N+1)/N^0.7 (weaker decay, rewards engagement)
  REPLY_DECAY_EXPONENT: 0.7,
  // Continuous role multiplier constants
  // RoleMultiplier = BASE + log₁₀(normalizedFollowers + 1) × LOG_FACTOR
  ROLE_MULTIPLIER_BASE: 1.0,
  ROLE_MULTIPLIER_LOG_FACTOR: 0.2,
  ROLE_MULTIPLIER_MAX: 2.0,
  // Daily hard caps per post type (posts beyond cap are excluded from scoring)
  DAILY_CAP_ORIGINAL: 3,
  DAILY_CAP_QUOTE: 4,
  DAILY_CAP_REPLY: 10,
  // Raw score compression exponent to reduce score gaps between top ranks
  // RawScore^0.8 compresses high scores more than low scores (e.g., 300 -> 121, 20 -> 13)
  RAW_SCORE_EXPONENT: 0.8,
};

// Language scale factors for follower normalization
// Normalizes followers to English-equivalent scale
export const LANGUAGE_SCALE: Record<AccountLanguage, number> = {
  en: 1.0, // Base scale
  zh: 1.3, // Chinese CT ~77% of English
  ja: 1.8, // Japanese CT ~56% of English
  ko: 3.0, // Korean CT ~33% of English
};

// Legacy: Language-based follower thresholds (kept for backwards compatibility)
// Use calculateRoleMultiplier() for new implementations
export const FOLLOWER_THRESHOLDS: Record<AccountLanguage, { kol: number; proactive: number }> = {
  en: { kol: 50000, proactive: 5000 },
  zh: { kol: 30000, proactive: 3000 },
  ja: { kol: 20000, proactive: 2000 },
  ko: { kol: 10000, proactive: 1000 },
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
  postType: PostType; // original, quote, or reply (Phase 9)
  baseScore: number; // Always 1.0
  postTypeMultiplier: number; // original/quote: 1.0, reply: 0.5
  roleMultiplier: number; // 1.0 ~ 2.0 (follower-based continuous)
  signalBonus: number; // 0 ~ 3
  postScore: number; // baseScore × postTypeMultiplier × roleMultiplier + signalBonus
  createdAt: string; // ISO timestamp
  createdBy: string; // Admin username who added this post
  seasonId?: string; // Season this post belongs to (Phase 5)
}

/**
 * Account record stored in DynamoDB
 * Aggregated fields are updated on each post registration
 */
export interface Account {
  accountId: string; // UUID, Primary Key
  platform: Platform;
  username: string; // Unique per platform (lowercase for consistent lookups)
  originalUsername?: string; // Original casing as provided by user (for display)

  // Role tracking (language-based follower thresholds)
  lastKnownRole: AccountRole;
  language?: AccountLanguage; // CT market language for fair role assignment
  followerCount?: number; // X follower count at registration time

  // Profile data (from UserProfiles table via Internal Data Sync)
  displayName?: string; // X display name
  profileImageUrl?: string; // X profile image URL
  isRegistered?: boolean; // Whether user has logged in to Nasun website

  // Telegram channel membership (set via verify-telegram endpoint)
  isTelegramMember?: boolean; // Whether user has verified Telegram channel membership
  telegramUserId?: string; // Telegram user ID (for uniqueness check)
  telegramUsername?: string; // Telegram @username (for display)

  // Aggregated fields (updated on post registration)
  totalPostScore: number; // Σ(PostScore)
  postCount: number; // Number of registered posts
  signalCountTotal: number; // Total Insight + Creative + High Reach checks
  uniqueActiveDays: number; // Count of unique active days
  activeDates: string[]; // Array of date strings (YYYY-MM-DD) for tracking

  // Per-type aggregation (Phase 9)
  originalPostCount: number;
  originalTotalScore: number;
  quotePostCount: number;
  quoteTotalScore: number;
  replyPostCount: number;
  replyTotalScore: number;

  // Timestamps
  firstSeenAt: string; // ISO timestamp
  lastSeenAt: string; // ISO timestamp of last post

  // Manual score adjustment (admin-only)
  adjustmentTotalScore?: number; // Cumulative adjustment delta

  // Ban status (soft exclusion)
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string; // ISO 8601
  bannedBy?: string; // Admin username
}

/**
 * Computed user score (calculated at read-time)
 * Not stored in DB - calculated dynamically
 */
export interface ComputedUserScore {
  accountId: string;
  username: string;
  originalUsername?: string; // Original casing for display
  platform: Platform;

  // Profile data (from Account via Internal Data Sync)
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  isTelegramMember?: boolean;

  // Raw aggregates from Account
  totalPostScore: number;
  postCount: number;
  signalCountTotal: number;
  uniqueActiveDays: number;
  lastSeenAt: string;

  // Computed values
  effectivePosts: number; // log₂(postCount + 1)
  rawScore: number; // (totalPostScore × effectivePosts / postCount) ^ RAW_SCORE_EXPONENT
  consistencyBonus: number; // 1 + log₂(uniqueActiveDays + 1) × 0.1
  freshnessMultiplier: number; // 1 / (1 + daysSinceLastPost / FRESHNESS_HALF_LIFE_DAYS)
  userScore: number; // rawScore × consistencyBonus × freshnessMultiplier
}

/**
 * Leaderboard entry returned by API
 */
export interface LeaderboardEntry {
  rank: number;
  username: string;
  originalUsername?: string; // Original casing for display
  platform: Platform;
  userScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastActivity: string;

  // Profile data (from Account via Internal Data Sync)
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  isTelegramMember?: boolean;

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
  postType?: PostType; // Optional, defaults to 'original'
  seasonId?: string; // Optional, defaults to active season
  // For new users: language and follower count for role calculation
  language?: AccountLanguage;
  followerCount?: number;
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

// Blacklist management types
export interface BanAccountRequest {
  accountId: string;
  reason?: string;
}

export interface BannedAccountEntry {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: Platform;
  displayName?: string;
  profileImageUrl?: string;
  postCount: number;
  totalPostScore: number;
  banReason?: string;
  bannedAt?: string;
  bannedBy?: string;
}

export interface BannedAccountsResponse {
  success: true;
  accounts: BannedAccountEntry[];
  total: number;
}

// ============================================
// DynamoDB Key Schemas
// ============================================

export const DYNAMO_KEYS = {
  // Posts table
  POSTS_TABLE: 'leaderboard-v3-posts',
  POSTS_PK: 'postId',
  POSTS_URL_INDEX: 'postUrl-index',
  POSTS_SEASON_INDEX: 'seasonId-createdAt-index',
  POSTS_CREATED_AT_INDEX: 'createdAt-index',

  // Accounts table
  ACCOUNTS_TABLE: 'leaderboard-v3-accounts',
  ACCOUNTS_PK: 'accountId',
  ACCOUNTS_USERNAME_INDEX: 'platform-username-index',

  // Seasons table
  SEASONS_TABLE: 'leaderboard-v3-seasons',
  SEASONS_PK: 'seasonId',
  SEASONS_SK: 'sk',

  // Snapshots table
  SNAPSHOTS_TABLE: 'leaderboard-v3-snapshots',
  SNAPSHOTS_PK: 'pk',
  SNAPSHOTS_SK: 'sk',

  // Season-Accounts table
  SEASON_ACCOUNTS_TABLE: 'leaderboard-v3-season-accounts',
  SEASON_ACCOUNTS_PK: 'pk',
  SEASON_ACCOUNTS_SK: 'sk',
};

// ============================================
// Season System Types (Phase 5)
// ============================================

export type SeasonStatus = 'upcoming' | 'active' | 'ended' | 'archived';

/**
 * Season record stored in DynamoDB
 * Defines time periods for independent leaderboard calculation
 */
export interface Season {
  seasonId: string; // PK: "SEASON1", "SEASON2", "LEGACY"
  sk: string; // SK: "METADATA"
  name: string; // "Season 1", "Genesis Season"
  description?: string;
  startDate: string; // "2026-01-01" (YYYY-MM-DD)
  endDate: string; // "2026-01-31" (YYYY-MM-DD)
  status: SeasonStatus;
  isDefault: boolean; // Currently displayed season for public
  totalPosts?: number; // Cached count
  totalAccounts?: number; // Cached count
  createdAt: string; // ISO timestamp
  createdBy: string; // Admin username
  updatedAt?: string; // ISO timestamp
}

export type RankChangeDirection = 'up' | 'down' | 'same' | 'new';

export interface RankChange {
  direction: RankChangeDirection;
  amount: number;
}

/**
 * Daily snapshot record stored in DynamoDB
 * Captures ranked leaderboard state at a point in time
 */
export interface DailySnapshot {
  pk: string; // "{seasonId}#{date}" e.g., "SEASON1#2026-01-21"
  sk: string; // "RANK#{rank:04d}" e.g., "RANK#0001"
  accountId: string;
  username: string;
  originalUsername?: string; // Original casing for display
  platform: Platform;
  userScore: number;
  rank: number;
  previousDayRank?: number;
  rankChange: RankChange;
  // Score breakdown
  totalPostScore: number;
  postCount: number;
  uniqueActiveDays: number;
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
  // Profile
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  isTelegramMember?: boolean;
  // Meta
  snapshotDate: string; // "2026-01-21"
  snapshotTime: string; // ISO timestamp
  ttl?: number; // Unix timestamp for auto-deletion (180 days, final snapshots are permanent)
}

/**
 * Season-specific account score record
 * Aggregates posts within a specific season (independent from cumulative)
 */
export interface SeasonAccountScore {
  pk: string; // "SEASON#{seasonId}#ACCOUNT#{accountId}"
  sk: string; // "SCORE"
  accountId: string;
  seasonId: string;
  username: string;
  originalUsername?: string; // Original casing for display
  platform: Platform;
  language?: AccountLanguage; // CT market language
  followerCount?: number; // X follower count
  // Season-specific aggregates
  totalPostScore: number;
  postCount: number;
  signalCountTotal: number;
  uniqueActiveDays: number;
  activeDates: string[];
  // Per-type aggregation (Phase 9)
  originalPostCount: number;
  originalTotalScore: number;
  quotePostCount: number;
  quoteTotalScore: number;
  replyPostCount: number;
  replyTotalScore: number;
  // Manual score adjustment (admin-only)
  adjustmentTotalScore?: number; // Cumulative adjustment delta
  // Computed scores (updated on post registration)
  userScore: number;
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
  // Profile (denormalized for snapshot efficiency)
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  isTelegramMember?: boolean;
  // Timestamps
  firstSeenAt: string;
  lastSeenAt: string;
}

// ============================================
// Season API Request/Response Types
// ============================================

/**
 * POST /v3/admin/seasons request body
 */
export interface CreateSeasonRequest {
  seasonId: string; // e.g., "SEASON1"
  name: string;
  description?: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
}

/**
 * PATCH /v3/admin/seasons/:seasonId request body
 */
export interface UpdateSeasonRequest {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: SeasonStatus;
  isDefault?: boolean;
}

/**
 * GET /v3/leaderboard response (extended for season support)
 */
export interface SeasonLeaderboardResponse {
  season: {
    seasonId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: SeasonStatus;
  };
  entries: SeasonLeaderboardEntry[];
  totalCount: number;
  snapshotDate?: string; // If viewing past snapshot
  calculatedAt: string;
}

/**
 * Leaderboard entry with rank change info
 */
export interface SeasonLeaderboardEntry extends LeaderboardEntry {
  rankChange?: RankChange;
}

/**
 * GET /v3/leaderboard/top-climbers response
 */
export interface TopClimbersResponse {
  seasonId: string;
  range: 'today' | '7d' | '4w';
  climbers: TopClimberEntry[];
  calculatedAt: string;
}

export interface TopClimberEntry {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: Platform;
  displayName?: string;
  profileImageUrl?: string;
  currentRank: number;
  previousRank: number;
  rankChange: RankChange;
  currentScore: number;
  previousScore?: number;
  scoreIncrease?: number;
  percentageIncrease?: number;
}

// ============================================
// Featured Feed Types (Phase 10)
// ============================================

export type BadgeType = 'rank-1' | 'rank-2' | 'rank-3' | 'climber-1' | 'climber-2' | 'climber-3';

export interface FeaturedFeedItem {
  type: 'post';
  postId: string;
  author: {
    accountId: string;
    username: string;
    originalUsername?: string;
    displayName?: string;
    profileImageUrl?: string;
    badges: BadgeType[];
  };
  content: {
    platform: Platform;
    postUrl: string;
    postType: PostType;
    signals: ContentSignal[];
    createdAt: string;
  };
}

export interface FeaturedFeedResponse {
  success: boolean;
  seasonId: string;
  items: FeaturedFeedItem[];
  calculatedAt: string;
}

// ============================================
// My Rank Types (Phase 10)
// ============================================

export type MyRankStatus = 'no_twitter' | 'not_ranked' | 'ranked' | 'error';

export interface MyRankData {
  status: MyRankStatus;
  rank?: number;
  userScore?: number;
  postCount?: number;
  username?: string;
  originalUsername?: string;
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  isTelegramMember?: boolean;
  rankChange?: RankChange;
  totalUsers?: number;
  message?: string; // e.g., "Your rank will be updated at 9:00 AM KST"
}

export interface MyRankResponse {
  success: boolean;
  data: MyRankData;
  seasonId?: string;
  snapshotDate?: string; // Date of snapshot being displayed (YYYY-MM-DD)
  calculatedAt: string;
}
