import { useQuery } from '@tanstack/react-query';
import { fetchScratchCardPool } from '../lib/scratchcard-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { ScratchCardPool } from '../types';

export interface UseScratchCardPoolResult {
  pool: ScratchCardPool | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useScratchCardPool(): UseScratchCardPoolResult {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['scratchcard-pool'],
    queryFn: fetchScratchCardPool,
    staleTime: 10_000,
    refetchInterval: adaptiveInterval,
  });

  return {
    pool: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
