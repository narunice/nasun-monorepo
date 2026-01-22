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
  platform: Platform;
  userScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastActivity: string;
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
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
