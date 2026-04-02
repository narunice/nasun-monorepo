/**
 * useSnapshotHistory Hook
 *
 * Fetches the user's ecosystem score snapshot history.
 * Uses useQuery for cache management and deduplication.
 */

import { useQuery } from '@tanstack/react-query';
import { getSnapshotHistory, type SnapshotHistoryEntry } from '@/services/ecosystemScoreApi';

interface UseSnapshotHistoryOptions {
  identityId?: string;
  days?: number;
  enabled?: boolean;
}

export function useSnapshotHistory(options: UseSnapshotHistoryOptions = {}) {
  const { identityId, days = 30, enabled = true } = options;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ecosystem', 'snapshot-history', identityId, days],
    queryFn: () => getSnapshotHistory(identityId!, days),
    enabled: enabled && !!identityId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });

  return {
    data: (data ?? []) as SnapshotHistoryEntry[],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}
