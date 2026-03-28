import { useQuery } from '@tanstack/react-query';
import { fetchNumberMatchPool } from '../lib/numbermatch-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { NumberMatchPool } from '../types';

export interface UseNumberMatchPoolResult {
  pool: NumberMatchPool | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useNumberMatchPool(): UseNumberMatchPoolResult {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['numbermatch-pool'],
    queryFn: fetchNumberMatchPool,
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
