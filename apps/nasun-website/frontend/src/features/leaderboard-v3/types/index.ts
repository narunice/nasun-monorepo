/**
 * Leaderboard V3 Types
 *
 * Types for the season-based leaderboard system.
 */

// Platform type
export type Platform = 'twitter' | 'discord' | 'farcaster';

// Season status
export type SeasonStatus = 'upcoming' | 'active' | 'ended' | 'archived';

// Rank change direction
export type RankChangeDirection = 'up' | 'down' | 'same' | 'new';

// Season interface
export interface Season {
  seasonId: string;
  name: string;
  description?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: SeasonStatus;
  isDefault: boolean;
  totalPosts?: number;
  totalAccounts?: number;
  createdAt: string;
  createdBy: string;
}

// Rank change data
export interface RankChange {
  direction: RankChangeDirection;
  amount: number;
}

// Score breakdown
export interface ScoreBreakdown {
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
}

// Season leaderboard entry (includes rank change)
export interface SeasonLeaderboardEntry {
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
  isTelegramMember?: boolean;
  rankChange?: RankChange;
  breakdown?: ScoreBreakdown;
}

// Season leaderboard response
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
  snapshotDate?: string;
  calculatedAt: string;
}

// Time range for top climbers
export type TimeRangeV3 = 'today' | '7d' | '4w';

// Top climber entry
export interface TopClimberEntry {
  accountId: string;
  username: string;
  originalUsername?: string; // Original casing for display
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

// Top climbers response
export interface TopClimbersResponse {
  seasonId: string;
  range: TimeRangeV3;
  climbers: TopClimberEntry[];
  calculatedAt: string;
}

// Get season leaderboard params
export interface GetSeasonLeaderboardParams {
  seasonId?: string;
  snapshotDate?: string;
  limit?: number;
  offset?: number;
  breakdown?: boolean;
}

// Get top climbers params
export interface GetTopClimbersParams {
  seasonId?: string;
  range?: TimeRangeV3;
  limit?: number;
}

// Platform labels
export const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: 'X (Twitter)',
  discord: 'Discord',
  farcaster: 'Farcaster',
};

// Time range labels
export const TIME_RANGE_LABELS: Record<TimeRangeV3, string> = {
  today: 'Today',
  '7d': '7D',
  '4w': '4W',
};

// Featured Feed Types (Phase 10)
export type BadgeType = 'rank-1' | 'rank-2' | 'rank-3' | 'ranker' | 'climber-1' | 'climber-2' | 'climber-3';

export type PostType = 'original' | 'quote' | 'reply';
export type ContentSignal = 'standard' | 'insight' | 'creative' | 'high_reach';

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

// My Rank Types (Phase 10)
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
}

export interface MyRankResponse {
  success: boolean;
  data: MyRankData;
  seasonId?: string;
  calculatedAt: string;
}

// ============================================
// Rank History Types (Phase 12)
// ============================================

// Valid date range options for rank history
export type DateRangeOptionV3 = 7 | 14 | 30 | 90;

// Single rank history entry
export interface RankHistoryEntry {
  date: string; // YYYY-MM-DD
  rank: number;
  userScore: number;
  postCount: number;
  rankChange?: RankChange;
}

// Statistics calculated from rank history
export interface RankHistoryStats {
  bestRank: number;
  worstRank: number;
  averageRank: number;
  currentRank: number;
  totalDays: number;
  scoreIncrease: number;
  rankImprovement: number;
}

// User profile for rank history display
export interface RankHistoryProfile {
  username: string;
  originalUsername?: string;
  displayName?: string;
  profileImageUrl?: string;
}

// Complete rank history data
export interface RankHistoryData {
  history: RankHistoryEntry[];
  stats: RankHistoryStats;
  profile: RankHistoryProfile;
}

// API response for rank history
export interface RankHistoryResponse {
  success: boolean;
  data?: RankHistoryData;
  error?: string;
  seasonId?: string;
  calculatedAt: string;
}

// Date range labels for UI
export const DATE_RANGE_LABELS: Record<DateRangeOptionV3, string> = {
  7: '7D',
  14: '2W',
  30: '4W',
  90: '3M',
};
