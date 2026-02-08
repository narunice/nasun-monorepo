/**
 * useAER - React Query hook for fetching AI Execution Report
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAERByRequestId, type AERData } from '../services/ecrService';

interface UseAERReturn {
  aer: AERData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAER(requestId: number | undefined): UseAERReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['aer', requestId],
    queryFn: () => fetchAERByRequestId(requestId!),
    enabled: requestId !== undefined,
    staleTime: 60_000, // AER is immutable, cache for 1 minute
    retry: 1,
  });

  return {
    aer: data ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch report') : null,
    refetch,
  };
}
