/**
 * useMarkets Hook
 * Fetches prediction market list with orderbooks for accurate probability display
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarketsWithOrderbooks } from '../lib/prediction-market';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { PredictionMarket, Orderbook } from '../types';

export interface MarketWithOrderbook {
  market: PredictionMarket;
  yesOrderbook: Orderbook | null;
  noOrderbook: Orderbook | null;
}

interface UseMarketsResult {
  markets: MarketWithOrderbook[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMarkets(): UseMarketsResult {
  const adaptiveInterval = useAdaptiveInterval(60_000);

  const {
    data: markets = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['prediction-markets-with-orderbooks'],
    queryFn: fetchMarketsWithOrderbooks,
    staleTime: 30_000, // 30 seconds
    refetchInterval: adaptiveInterval,
  });

  return {
    markets,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
