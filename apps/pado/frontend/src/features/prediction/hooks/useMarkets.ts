/**
 * useMarkets Hook
 * Fetches prediction market list
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarkets } from '../lib/prediction-market';
import type { PredictionMarket } from '../types';

interface UseMarketsResult {
  markets: PredictionMarket[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMarkets(): UseMarketsResult {
  const {
    data: markets = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['prediction-markets'],
    queryFn: fetchMarkets,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // Refetch every minute
  });

  return {
    markets,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
