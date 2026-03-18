/**
 * Leaderboard V3 API Service
 *
 * API client for the season-based leaderboard system.
 */

import { fetchWithTimeout } from '@/utils/fetchWithTimeout';
import type {
  Season,
  SeasonLeaderboardResponse,
  TopClimbersResponse,
  GetSeasonLeaderboardParams,
  GetTopClimbersParams,
  Platform,
  FeaturedFeedResponse,
  MyRankResponse,
  RankHistoryResponse,
  DateRangeOptionV3,
} from '../types';

// Search result interface
export interface SearchAccountResult {
  accountId: string;
  username: string;
  originalUsername?: string; // Original casing for display
  platform: Platform;
  displayName?: string;
  profileImageUrl?: string;
  userScore?: number;
  rank?: number;
}

export interface SearchAccountsResponse {
  accounts: SearchAccountResult[];
  total: number;
}

const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

/**
 * Get season leaderboard (public)
 * Supports seasonId, snapshotDate for past rankings
 */
export async function getSeasonLeaderboard(
  params: GetSeasonLeaderboardParams = {}
): Promise<SeasonLeaderboardResponse> {
  const searchParams = new URLSearchParams();

  if (params.seasonId) searchParams.append('seasonId', params.seasonId);
  if (params.snapshotDate) searchParams.append('snapshotDate', params.snapshotDate);
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.offset) searchParams.append('offset', params.offset.toString());
  if (params.breakdown) searchParams.append('breakdown', 'true');

  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard?${searchParams}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get leaderboard: ${response.status}`);
  }

  return response.json();
}

/**
 * Get top climbers (public)
 * Returns users with biggest rank improvements
 */
export async function getTopClimbersV3(
  params: GetTopClimbersParams = {}
): Promise<TopClimbersResponse> {
  const searchParams = new URLSearchParams();

  if (params.seasonId) searchParams.append('seasonId', params.seasonId);
  if (params.range) searchParams.append('range', params.range);
  if (params.limit) searchParams.append('limit', params.limit.toString());

  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard/top-climbers?${searchParams}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get top climbers: ${response.status}`);
  }

  return response.json();
}

/**
 * Get all seasons (public)
 * Returns list of all non-archived seasons sorted by startDate desc
 * Uses the leaderboard endpoint with listSeasons=true
 */
export async function getSeasons(): Promise<Season[]> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard?listSeasons=true`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    // Return empty array if no seasons found
    if (response.status === 404) {
      return [];
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get seasons: ${response.status}`);
  }

  const data = await response.json();
  return data.seasons || [];
}

/**
 * Get featured feed (public)
 * Returns recent posts from top rankers and top climbers
 */
export async function getFeaturedFeed(seasonId?: string): Promise<FeaturedFeedResponse> {
  const searchParams = new URLSearchParams();
  if (seasonId) searchParams.append('seasonId', seasonId);

  const url = `${LEADERBOARD_V3_API_URL}/v3/feed/featured?${searchParams}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get featured feed: ${response.status}`);
  }

  return response.json();
}

/**
 * Search accounts by username (public)
 * Returns matching accounts with optional rank info
 */
export async function searchAccounts(params: {
  query: string;
  limit?: number;
  seasonId?: string;
}): Promise<SearchAccountsResponse> {
  const { query, limit = 10, seasonId } = params;

  if (!query || query.length < 2) {
    return { accounts: [], total: 0 };
  }

  const searchParams = new URLSearchParams();
  searchParams.append('q', query);
  searchParams.append('limit', limit.toString());
  if (seasonId) searchParams.append('seasonId', seasonId);

  const url = `${LEADERBOARD_V3_API_URL}/v3/accounts/search?${searchParams}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to search accounts: ${response.status}`);
  }

  return response.json();
}

/**
 * Get account by username (exact match via GSI query)
 */
export async function getAccountByUsername(
  username: string,
  platform: Platform = "twitter"
): Promise<{ found: boolean; account?: SearchAccountResult }> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/accounts/${encodeURIComponent(username.toLowerCase())}?platform=${platform}`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return { found: false };
    return response.json();
  } catch {
    return { found: false };
  }
}

/**
 * Get my rank (public)
 * Returns rank info for a specific user
 */
export async function getMyRank(params: {
  username: string;
  seasonId?: string;
}): Promise<MyRankResponse> {
  const { username, seasonId } = params;

  const searchParams = new URLSearchParams();
  searchParams.append('username', username);
  if (seasonId) searchParams.append('seasonId', seasonId);

  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard/my-rank?${searchParams}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get my rank: ${response.status}`);
  }

  return response.json();
}

/**
 * Get rank history (public)
 * Returns rank history over time for a specific user
 */
export async function getRankHistory(params: {
  username: string;
  seasonId?: string;
  days?: DateRangeOptionV3;
}): Promise<RankHistoryResponse> {
  const { username, seasonId, days } = params;

  const searchParams = new URLSearchParams();
  searchParams.append('username', username);
  if (seasonId) searchParams.append('seasonId', seasonId);
  if (days) searchParams.append('days', days.toString());

  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard/rank-history?${searchParams}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get rank history: ${response.status}`);
  }

  return response.json();
}
