/**
 * useFeaturedFeed Hook
 *
 * Fetches the featured content feed for the leaderboard page.
 */

import { useQuery } from '@tanstack/react-query';
import { getFeaturedFeed } from '../services/leaderboardV3Api';
import { FeaturedFeedResponse } from '../types';

export function useFeaturedFeed(seasonId?: string) {
  return useQuery<FeaturedFeedResponse>({
    queryKey: ['leaderboard-v3', 'featured-feed', seasonId],
    queryFn: () => getFeaturedFeed(seasonId),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
