/**
 * useMarket Hook
 * Fetches a single prediction market by ID
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarket } from '../lib/prediction-market';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { PredictionMarket } from '../types';

interface UseMarketResult {
  market: PredictionMarket | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMarket(marketId: string | undefined): UseMarketResult {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  const {
    data: market = null,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['prediction-market', marketId],
    queryFn: () => fetchMarket(marketId!),
    enabled: !!marketId,
    staleTime: 10_000, // 10 seconds
    refetchInterval: adaptiveInterval,
  });

  return {
    market,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
