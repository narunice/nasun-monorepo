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

// Account data (matches backend Account interface)
export interface LeaderboardV3Account {
  accountId: string;
  platform: Platform;
  username: string;
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  lastKnownRole: AccountRole;
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
  }>;
  calculatedAt: string;
}
