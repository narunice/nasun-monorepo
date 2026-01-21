/**
 * useTopClimbersV3 Hook
 *
 * Fetches top climbers (users with biggest rank improvements).
 */

import { useQuery } from '@tanstack/react-query';
import { getTopClimbersV3 } from '../services/leaderboardV3Api';
import type { GetTopClimbersParams } from '../types';

// Query keys
export const topClimbersKeys = {
  all: ['leaderboard-v3', 'top-climbers'] as const,
  byParams: (params: GetTopClimbersParams) =>
    [...topClimbersKeys.all, params] as const,
};

/**
 * Hook for fetching top climbers
 */
export function useTopClimbersV3(params: GetTopClimbersParams = {}) {
  return useQuery({
    queryKey: topClimbersKeys.byParams(params),
    queryFn: () => getTopClimbersV3(params),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
  });
}
