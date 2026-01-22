/**
 * useUserSearchV3 Hook
 *
 * Search for users in the leaderboard by username.
 */

import { useQuery } from '@tanstack/react-query';
import { searchAccounts, SearchAccountsResponse } from '../services/leaderboardV3Api';

interface UseUserSearchV3Options {
  query: string;
  seasonId?: string;
  limit?: number;
  enabled?: boolean;
}

export function useUserSearchV3({
  query,
  seasonId,
  limit = 10,
  enabled = true,
}: UseUserSearchV3Options) {
  const normalizedQuery = query.trim().replace(/^@/, '').toLowerCase();

  return useQuery<SearchAccountsResponse>({
    queryKey: ['leaderboard-v3', 'search', normalizedQuery, seasonId],
    queryFn: () =>
      searchAccounts({
        query: normalizedQuery,
        limit,
        seasonId,
      }),
    enabled: enabled && normalizedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}
