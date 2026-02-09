/**
 * Hook for fetching perpetual market data
 * @module features/perp/hooks/usePerpMarket
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchPerpMarket,
  fetchAllPerpMarkets,
  toMarketDisplay,
} from '../lib/perp-client';
import type { PerpMarket, PerpMarketDisplay } from '../types';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

const MARKET_QUERY_KEY = 'perp-market';
const MARKETS_QUERY_KEY = 'perp-markets';
const REFETCH_INTERVAL = 10_000; // 10 seconds

/**
 * Fetch a single perp market by ID
 */
export function usePerpMarket(marketId: string | undefined) {
  const adaptiveInterval = useAdaptiveInterval(REFETCH_INTERVAL);
  return useQuery<PerpMarket | null>({
    queryKey: [MARKET_QUERY_KEY, marketId],
    queryFn: () => (marketId ? fetchPerpMarket(marketId) : Promise.resolve(null)),
    enabled: !!marketId,
    refetchInterval: adaptiveInterval,
    staleTime: 5_000,
  });
}

/**
 * Fetch all available perp markets
 */
export function usePerpMarkets() {
  const adaptiveMarketsInterval = useAdaptiveInterval(REFETCH_INTERVAL);
  return useQuery<PerpMarket[]>({
    queryKey: [MARKETS_QUERY_KEY],
    queryFn: fetchAllPerpMarkets,
    refetchInterval: adaptiveMarketsInterval,
    staleTime: 5_000,
  });
}

/**
 * Get market display data with human-readable values
 */
export function usePerpMarketDisplay(
  marketId: string | undefined,
  currentPrice: number,
): {
  data: PerpMarketDisplay | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { data: market, isLoading, error } = usePerpMarket(marketId);

  const displayData =
    market && currentPrice > 0 ? toMarketDisplay(market, currentPrice) : null;

  return {
    data: displayData,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Get market statistics
 */
export function useMarketStats(marketId: string | undefined) {
  const { data: market } = usePerpMarket(marketId);

  if (!market) {
    return {
      openInterestLong: 0n,
      openInterestShort: 0n,
      fundingRate: 0,
      isActive: false,
    };
  }

  return {
    openInterestLong: market.openInterestLong,
    openInterestShort: market.openInterestShort,
    fundingRate:
      (market.fundingRateValue / 10000) *
      (market.fundingRateNegative ? -1 : 1),
    isActive: market.isActive,
  };
}
