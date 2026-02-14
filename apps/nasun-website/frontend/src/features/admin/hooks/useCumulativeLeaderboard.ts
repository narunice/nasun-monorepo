/**
 * useCumulativeLeaderboard - Hook for fetching all-time cumulative leaderboard
 *
 * Admin only - requires Cognito JWT authentication.
 * Returns leaderboard data across all seasons.
 */

import { useQuery } from '@tanstack/react-query';
import { getCumulativeLeaderboard } from '../services/leaderboardV3Api';
import { useAdminAuth } from './useAdminAuth';

export interface UseCumulativeLeaderboardParams {
  limit?: number;
  offset?: number;
  breakdown?: boolean;
  enabled?: boolean;
}

export function useCumulativeLeaderboard(params: UseCumulativeLeaderboardParams = {}) {
  const { limit = 100, offset = 0, breakdown = true, enabled = true } = params;
  const { cognitoToken } = useAdminAuth();

  return useQuery({
    queryKey: ['admin-cumulative-leaderboard', { limit, offset, breakdown }],
    queryFn: () => getCumulativeLeaderboard(cognitoToken!, { limit, offset, breakdown }),
    enabled: enabled && !!cognitoToken,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}
