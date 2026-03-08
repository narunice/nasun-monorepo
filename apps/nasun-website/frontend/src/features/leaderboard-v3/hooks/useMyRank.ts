/**
 * useMyRank Hook
 *
 * Fetches the logged-in user's rank in the current season.
 * Requires Twitter account to be connected.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { getMyRank } from '../services/leaderboardV3Api';
import { getTwitterHandle } from '@/utils/getTwitterHandle';
import type { MyRankResponse, MyRankData } from '../types';

interface UseMyRankResult {
  data: MyRankData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  twitterUsername: string | null;
  isAuthenticated: boolean;
}

export function useMyRank(seasonId?: string): UseMyRankResult {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const twitterUsername = getTwitterHandle(user);

  const {
    data: response,
    isLoading: isQueryLoading,
    isError,
    error,
  } = useQuery<MyRankResponse>({
    queryKey: ['leaderboard-v3', 'my-rank', seasonId, twitterUsername],
    queryFn: () => getMyRank({
      username: twitterUsername!,
      seasonId
    }),
    enabled: !!seasonId && !!twitterUsername,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  // Determine the MyRankData based on authentication and response
  let data: MyRankData | null = null;

  if (!isAuthenticated) {
    data = null; // Not logged in - component should show login prompt
  } else if (!twitterUsername) {
    data = { status: 'no_twitter' }; // Logged in but no Twitter connected
  } else if (response?.data) {
    data = response.data;
  } else if (isError) {
    data = { status: 'error' };
  }

  return {
    data,
    isLoading: isAuthLoading || isQueryLoading,
    isError,
    error: error as Error | null,
    twitterUsername,
    isAuthenticated,
  };
}
