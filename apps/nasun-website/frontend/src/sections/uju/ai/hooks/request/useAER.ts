/**
 * React Query hook that resolves an AER record for a given on-chain request id.
 * Thin wrapper around aerService.fetchAERByRequestId.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAERByRequestId, type AERData } from '../../services/aerService';

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
    staleTime: 60_000,
    retry: 1,
  });

  return {
    aer: data ?? null,
    isLoading,
    error: error
      ? error instanceof Error
        ? error.message
        : 'Failed to fetch report'
      : null,
    refetch,
  };
}
