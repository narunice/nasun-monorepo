/**
 * Leaderboard V3 API Service
 *
 * API client for the season-based leaderboard system.
 */

import type {
  Season,
  SeasonLeaderboardResponse,
  TopClimbersResponse,
  GetSeasonLeaderboardParams,
  GetTopClimbersParams,
  Platform,
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

  const response = await fetch(url, {
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

  const response = await fetch(url, {
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

  const response = await fetch(url, {
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

  const response = await fetch(url, {
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
