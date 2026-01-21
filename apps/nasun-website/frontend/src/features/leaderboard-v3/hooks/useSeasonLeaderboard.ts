/**
 * useSeasonLeaderboard Hook
 *
 * Fetches season-based leaderboard data with support for snapshots.
 */

import { useQuery } from '@tanstack/react-query';
import { getSeasonLeaderboard } from '../services/leaderboardV3Api';
import type { GetSeasonLeaderboardParams } from '../types';

// Query keys
export const seasonLeaderboardKeys = {
  all: ['leaderboard-v3', 'leaderboard'] as const,
  season: (params: GetSeasonLeaderboardParams) =>
    [...seasonLeaderboardKeys.all, params] as const,
};

/**
 * Hook for fetching season leaderboard
 */
export function useSeasonLeaderboard(params: GetSeasonLeaderboardParams = {}) {
  return useQuery({
    queryKey: seasonLeaderboardKeys.season(params),
    queryFn: () => getSeasonLeaderboard(params),
    staleTime: 5 * 60 * 1000, // 5 minutes (matches API cache)
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
  });
}
