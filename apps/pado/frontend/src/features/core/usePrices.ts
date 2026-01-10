/**
 * usePrices Hook
 *
 * React Query-based hook for fetching and caching oracle prices.
 * Automatically refreshes prices at configured intervals.
 *
 * @version 1.0.0 (Phase 16.1)
 */

import { useQuery } from '@tanstack/react-query';
import {
  refreshAllPrices,
  getUnifiedPrice,
  getPriceSource,
  getPriceChange24h,
  type TokenSymbol,
} from '../../lib/prices';

// ========================================
// Configuration
// ========================================

const REFRESH_INTERVAL_MS = 10_000; // 10 seconds
const STALE_TIME_MS = 5_000; // 5 seconds

// ========================================
// Types
// ========================================

export interface PriceInfo {
  symbol: TokenSymbol;
  price: number;
  change24h: number;
  source: 'oracle' | 'simulated' | 'unknown';
}

export interface UsePricesResult {
  prices: Record<TokenSymbol, PriceInfo>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  getPrice: (symbol: TokenSymbol) => number;
  getPriceInfo: (symbol: TokenSymbol) => PriceInfo;
}

// ========================================
// Hook
// ========================================

/**
 * Hook to fetch and cache oracle prices
 *
 * @param enabled - Whether to enable automatic fetching (default: true)
 * @returns Prices and query state
 *
 * @example
 * const { prices, getPrice } = usePrices();
 * const btcPrice = getPrice('NBTC'); // 97000
 */
export function usePrices(enabled: boolean = true): UsePricesResult {
  const query = useQuery({
    queryKey: ['oracle-prices'],
    queryFn: async () => {
      await refreshAllPrices();
      // Return current prices after refresh
      return {
        NASUN: buildPriceInfo('NASUN'),
        NBTC: buildPriceInfo('NBTC'),
        NUSDC: buildPriceInfo('NUSDC'),
      };
    },
    enabled,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });

  const getPrice = (symbol: TokenSymbol): number => {
    return getUnifiedPrice(symbol);
  };

  const getPriceInfo = (symbol: TokenSymbol): PriceInfo => {
    return query.data?.[symbol] ?? buildPriceInfo(symbol);
  };

  return {
    prices: query.data ?? {
      NASUN: buildPriceInfo('NASUN'),
      NBTC: buildPriceInfo('NBTC'),
      NUSDC: buildPriceInfo('NUSDC'),
    },
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    getPrice,
    getPriceInfo,
  };
}

// ========================================
// Helpers
// ========================================

function buildPriceInfo(symbol: TokenSymbol): PriceInfo {
  return {
    symbol,
    price: getUnifiedPrice(symbol),
    change24h: getPriceChange24h(symbol),
    source: getPriceSource(symbol),
  };
}
