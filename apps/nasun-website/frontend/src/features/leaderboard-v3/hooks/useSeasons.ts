/**
 * useSeasons Hook
 *
 * Fetches and manages season list.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getSeasons } from '../services/leaderboardV3Api';
import type { Season } from '../types';

// Query keys
export const seasonsKeys = {
  all: ['leaderboard-v3', 'seasons'] as const,
};

/**
 * Hook for fetching all seasons
 */
export function useSeasons() {
  return useQuery({
    queryKey: seasonsKeys.all,
    queryFn: getSeasons,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });
}

/**
 * Hook for getting the active/default season
 */
export function useActiveSeason(): Season | undefined {
  const { data: seasons } = useSeasons();

  return useMemo(() => {
    if (!seasons || seasons.length === 0) return undefined;

    // First try to find active season
    const active = seasons.find((s) => s.status === 'active');
    if (active) return active;

    // Then try default season
    const defaultSeason = seasons.find((s) => s.isDefault);
    if (defaultSeason) return defaultSeason;

    // Fallback to first season
    return seasons[0];
  }, [seasons]);
}
