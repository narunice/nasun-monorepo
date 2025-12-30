/**
 * useMarkets Hook
 * Fetches prediction market list with orderbooks for accurate probability display
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarketsWithOrderbooks } from '../lib/prediction-market';
import type { PredictionMarket, Orderbook } from '../types';

export interface MarketWithOrderbook {
  market: PredictionMarket;
  yesOrderbook: Orderbook | null;
}

interface UseMarketsResult {
  markets: MarketWithOrderbook[];
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
    queryKey: ['prediction-markets-with-orderbooks'],
    queryFn: fetchMarketsWithOrderbooks,
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
