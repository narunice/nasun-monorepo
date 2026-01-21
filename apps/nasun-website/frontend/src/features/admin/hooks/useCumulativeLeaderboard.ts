/**
 * useCumulativeLeaderboard - Hook for fetching all-time cumulative leaderboard
 *
 * Admin only - requires authentication.
 * Returns leaderboard data across all seasons.
 */

import { useQuery } from '@tanstack/react-query';
import { getCumulativeLeaderboard } from '../services/leaderboardV3Api';

const ADMIN_PASSWORD = import.meta.env.VITE_LEADERBOARD_V3_ADMIN_PASSWORD;

export interface UseCumulativeLeaderboardParams {
  limit?: number;
  offset?: number;
  breakdown?: boolean;
  enabled?: boolean;
}

export function useCumulativeLeaderboard(params: UseCumulativeLeaderboardParams = {}) {
  const { limit = 100, offset = 0, breakdown = true, enabled = true } = params;

  return useQuery({
    queryKey: ['admin-cumulative-leaderboard', { limit, offset, breakdown }],
    queryFn: () => getCumulativeLeaderboard(ADMIN_PASSWORD, { limit, offset, breakdown }),
    enabled: enabled && !!ADMIN_PASSWORD,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}
