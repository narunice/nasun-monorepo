/**
 * Leaderboard V3 Types
 *
 * Manual curation system for community engagement tracking.
 * Independent from V2 leaderboard system.
 *
 * Types must match backend: cdk/lambda-src/leaderboard-v3/src/types/index.ts
 */

// Platform types (matches backend)
export type Platform = 'twitter' | 'discord' | 'farcaster';

// Account role classification (3-tier)
export type AccountRole = 'kol' | 'proactive_ct' | 'default';

// Content signal types (matches backend)
export type ContentSignal = 'standard' | 'insight' | 'creative' | 'high_reach';

// Post type classification (Phase 9)
export type PostType = 'original' | 'quote' | 'reply';

// Account language for CT market size adjustment
export type AccountLanguage = 'en' | 'zh' | 'ja' | 'ko';

// Account data (matches backend Account interface)
export interface LeaderboardV3Account {
  accountId: string;
  platform: Platform;
  username: string;
  originalUsername?: string; // Original casing for display
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  lastKnownRole: AccountRole;
  language?: AccountLanguage;
  followerCount?: number;
  totalPostScore: number;
  postCount: number;
  uniqueActiveDays: number;
  firstSeenAt: string;
  lastSeenAt: string;
  activeDates: string[];
  signalCountTotal?: number;
}

// Post data (matches backend Post interface)
export interface LeaderboardV3Post {
  postId: string;
  postUrl: string;
  postUrlRaw: string;
  platform: Platform;
  accountId: string;
  username: string;
  accountRole: AccountRole;
  baseScore: number;
  roleMultiplier: number;
  signalBonus: number;
  postScore: number;
  contentSignals: ContentSignal[];
  createdAt: string;
  registeredBy?: string;
}

// Score breakdown for leaderboard display
export interface ScoreBreakdown {
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
}

// Leaderboard entry (matches backend LeaderboardEntry)
export interface LeaderboardEntry {
  rank: number;
  username: string;
  originalUsername?: string; // Original casing for display
  platform: Platform;
  userScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastActivity: string;
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  breakdown?: ScoreBreakdown;
}

// API Request/Response types (matches backend)

export interface CreatePostRequest {
  postUrl: string;
  accountRole: AccountRole;
  contentSignals: ContentSignal[];
  postType?: PostType; // Phase 9: defaults to 'original'
  seasonId?: string; // Target season (defaults to active season if omitted)
  // For new users: language and follower count for role calculation
  language?: AccountLanguage;
  followerCount?: number;
}

export interface CreatePostResponse {
  success: boolean;
  post?: LeaderboardV3Post;
  account?: LeaderboardV3Account;
  error?: string;
  isDuplicate?: boolean;
}

export interface GetLeaderboardParams {
  period?: 'weekly' | 'monthly' | 'alltime';
  limit?: number;
  offset?: number;
  breakdown?: boolean;
}

export interface GetLeaderboardResponse {
  entries: LeaderboardEntry[];
  totalCount: number;
  period: string;
  calculatedAt: string;
}

export interface GetAccountResponse {
  found: boolean;
  account?: LeaderboardV3Account;
  recentPosts?: LeaderboardV3Post[];
}

// Score calculation constants (for UI preview)
export const ROLE_MULTIPLIERS: Record<AccountRole, number> = {
  kol: 2.0,
  proactive_ct: 1.5,
  default: 1.0,
};

export const SIGNAL_BONUSES: Record<ContentSignal, number> = {
  standard: 0,
  insight: 1.0,
  creative: 1.0,
  high_reach: 1.0,
};

export const BASE_SCORE = 1.0;

// Display labels
export const ROLE_LABELS: Record<AccountRole, string> = {
  kol: 'KOL',
  proactive_ct: 'Proactive CT',
  default: 'Default',
};

export const SIGNAL_LABELS: Record<ContentSignal, string> = {
  standard: 'Standard',
  insight: 'Insight',
  creative: 'Creative',
  high_reach: 'High Reach',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: 'X (Twitter)',
  discord: 'Discord',
  farcaster: 'Farcaster',
};

// Keyboard shortcut helper
export const ROLE_SHORTCUTS: Record<string, AccountRole> = {
  '1': 'default',
  '2': 'proactive_ct',
  '3': 'kol',
};

// Signals that provide bonus (excludes 'standard' which is default)
export const BONUS_SIGNALS: ContentSignal[] = ['insight', 'creative', 'high_reach'];

export const SIGNAL_SHORTCUTS: Record<string, ContentSignal> = {
  'q': 'insight',
  'w': 'creative',
  'e': 'high_reach',
};

// Phase 9: Post type labels and shortcuts
export const POST_TYPE_LABELS: Record<PostType, string> = {
  original: 'Original',
  quote: 'Quote',
  reply: 'Reply',
};

export const POST_TYPE_SHORTCUTS: Record<string, PostType> = {
  'r': 'original',
  't': 'quote',
  'y': 'reply',
};

// Language labels for CT market size adjustment
export const LANGUAGE_LABELS: Record<AccountLanguage, string> = {
  en: 'English',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

// Follower thresholds by language (legacy - kept for backwards compatibility)
export const FOLLOWER_THRESHOLDS: Record<AccountLanguage, { kol: number; proactive: number }> = {
  en: { kol: 50000, proactive: 5000 },
  zh: { kol: 30000, proactive: 3000 },
  ja: { kol: 20000, proactive: 2000 },
  ko: { kol: 10000, proactive: 1000 },
};

// Legacy: Calculate role from follower count and language (discrete)
export function getRoleByFollowers(followerCount: number, language: AccountLanguage): AccountRole {
  const thresholds = FOLLOWER_THRESHOLDS[language];
  if (followerCount >= thresholds.kol) return 'kol';
  if (followerCount >= thresholds.proactive) return 'proactive_ct';
  return 'default';
}

// Language scale factors for follower normalization (matches backend)
// Normalizes followers to English-equivalent scale
export const LANGUAGE_SCALE: Record<AccountLanguage, number> = {
  en: 1.0,   // Base scale
  zh: 1.15,  // Chinese CT market normalization
  ja: 1.4,   // Japanese CT market normalization
  ko: 2.0,   // Korean CT market normalization
};

// Continuous role multiplier constants
export const ROLE_MULTIPLIER_BASE = 1.0;
export const ROLE_MULTIPLIER_LOG_FACTOR = 0.2;
export const ROLE_MULTIPLIER_MAX = 2.0;

/**
 * Calculate continuous role multiplier based on follower count and language
 * Formula: RoleMultiplier = 1 + log₁₀(normalizedFollowers + 1) × 0.2
 * Range: 1.0 (0 followers) to 2.0 (100,000+ normalized followers)
 */
export function calculateRoleMultiplier(followerCount: number, language: AccountLanguage = 'en'): number {
  if (followerCount <= 0) {
    return ROLE_MULTIPLIER_BASE;
  }

  const scale = LANGUAGE_SCALE[language] || LANGUAGE_SCALE.en;
  const normalizedFollowers = followerCount * scale;

  const multiplier = ROLE_MULTIPLIER_BASE +
    Math.log10(normalizedFollowers + 1) * ROLE_MULTIPLIER_LOG_FACTOR;

  return Math.min(multiplier, ROLE_MULTIPLIER_MAX);
}

// ============================================
// Score Adjustment Types
// ============================================

export interface AdjustScoreRequest {
  username: string;
  score: number;
  reason: string;
  seasonId?: string;
}

export interface AdjustScoreResponse {
  success: boolean;
  data?: {
    accountId: string;
    username: string;
    adjustedScore: number;
    reason: string;
    seasonId: string;
  };
  error?: string;
}

// ============================================
// Season Types (Phase 5)
// ============================================

export type SeasonStatus = 'upcoming' | 'active' | 'ended' | 'archived';

export interface Season {
  seasonId: string;
  sk: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  isDefault: boolean;
  totalPosts?: number;
  totalAccounts?: number;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

export interface CreateSeasonRequest {
  seasonId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
}

export interface UpdateSeasonRequest {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  status?: SeasonStatus;
  isDefault?: boolean;
}

// ============================================
// Dashboard Stats Types (Phase 7)
// ============================================

export interface DashboardStats {
  totalPosts: number;
  totalAccounts: number;
  activeSeason: {
    seasonId: string;
    name: string;
    startDate: string;
    endDate: string;
    totalPosts: number;
    totalAccounts: number;
  } | null;
  todayStats: {
    postsCreated: number;
    newAccounts: number;
  };
  topFive: Array<{
    rank: number;
    username: string;
    userScore: number;
  }>;
  recentActivity: Array<{
    type: 'post_created' | 'account_created' | 'snapshot_generated';
    description: string;
    timestamp: string;
    postId?: string;
    seasonId?: string;
    platform?: string;
    username?: string;
    originalUsername?: string;
    postUrl?: string;
    postScore?: number;
    postType?: string;
    accountRole?: string;
    contentSignals?: string[];
  }>;
  calculatedAt: string;
}
