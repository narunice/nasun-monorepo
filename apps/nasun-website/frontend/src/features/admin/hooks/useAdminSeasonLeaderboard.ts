/**
 * useAdminSeasonLeaderboard - Hook for fetching season leaderboard with elevated limits
 *
 * Admin only - requires Cognito JWT authentication.
 * Bypasses the public 500-entry limit to return full leaderboard data.
 */

import { useQuery } from '@tanstack/react-query';
import { getAdminSeasonLeaderboard } from '../services/leaderboardV3Api';
import { useAdminAuth } from './useAdminAuth';

export interface UseAdminSeasonLeaderboardParams {
  seasonId?: string;
  snapshotDate?: string;
  limit?: number;
  breakdown?: boolean;
  enabled?: boolean;
}

export function useAdminSeasonLeaderboard(params: UseAdminSeasonLeaderboardParams = {}) {
  const { seasonId, snapshotDate, limit = 5000, breakdown = true, enabled = true } = params;
  const { cognitoToken } = useAdminAuth();

  return useQuery({
    queryKey: ['admin-season-leaderboard', { seasonId, snapshotDate, limit, breakdown }],
    queryFn: () => getAdminSeasonLeaderboard(cognitoToken!, { seasonId, snapshotDate, limit, breakdown }),
    enabled: enabled && !!cognitoToken,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}
