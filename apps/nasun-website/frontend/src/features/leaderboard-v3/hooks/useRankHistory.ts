/**
 * useRankHistory Hook
 *
 * Fetches the logged-in user's rank history over time.
 * Requires Twitter account to be connected.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { getTwitterHandle } from '@/utils/getTwitterHandle';
import { getRankHistory } from '../services/leaderboardV3Api';
import type { RankHistoryData, DateRangeOptionV3 } from '../types';

interface UseRankHistoryOptions {
  seasonId?: string;
  days?: DateRangeOptionV3;
  enabled?: boolean;
}

interface UseRankHistoryResult {
  data: RankHistoryData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  twitterUsername: string | null;
  isAuthenticated: boolean;
  refetch: () => void;
}

export function useRankHistory(options: UseRankHistoryOptions = {}): UseRankHistoryResult {
  const { seasonId, days = 7, enabled = true } = options;
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const twitterUsername = getTwitterHandle(user);

  const {
    data: response,
    isLoading: isQueryLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['leaderboard-v3', 'rank-history', seasonId, twitterUsername, days],
    queryFn: () => getRankHistory({
      username: twitterUsername!,
      seasonId,
      days
    }),
    enabled: enabled && !!seasonId && !!twitterUsername,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: 1,
  });

  return {
    data: response?.data ?? null,
    isLoading: isAuthLoading || isQueryLoading,
    isError,
    error: error as Error | null,
    twitterUsername,
    isAuthenticated,
    refetch,
  };
}
