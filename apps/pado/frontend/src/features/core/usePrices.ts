/**
 * Unified Price Hooks
 *
 * Single source of truth for all Oracle price React Query hooks.
 * Both the bulk `usePrices()` and per-symbol `useOraclePrice()` live here
 * so every module sees the same cache with the same refresh timing.
 *
 * @version 2.0.0 (CODE-7: unified Oracle hooks)
 */

import { useQuery } from '@tanstack/react-query';
import {
  refreshAllPrices,
  refreshPrice,
  getUnifiedPrice,
  getPriceSource,
  getPriceChange24h,
  getPriceWithFreshness,
  getTokenByOracleId,
  type TokenSymbol,
} from '../../lib/prices';
import { useAdaptiveInterval } from '../../hooks/useAdaptiveInterval';

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
  const adaptiveInterval = useAdaptiveInterval(REFRESH_INTERVAL_MS);
  const query = useQuery({
    queryKey: ['oracle-prices'],
    queryFn: async () => {
      await refreshAllPrices();
      // Return current prices after refresh
      return {
        NSN: buildPriceInfo('NSN'),
        NBTC: buildPriceInfo('NBTC'),
        NUSDC: buildPriceInfo('NUSDC'),
        NETH: buildPriceInfo('NETH'),
        NSOL: buildPriceInfo('NSOL'),
      };
    },
    enabled,
    refetchInterval: adaptiveInterval,
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
      NSN: buildPriceInfo('NSN'),
      NBTC: buildPriceInfo('NBTC'),
      NUSDC: buildPriceInfo('NUSDC'),
      NETH: buildPriceInfo('NETH'),
      NSOL: buildPriceInfo('NSOL'),
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
// Per-Symbol Hooks (moved from perp/hooks/useOraclePrice)
// ========================================

export interface OraclePriceData {
  price: number;
  timestamp: number;
  isFresh: boolean;
}

/**
 * Fetch oracle price for a single symbol by on-chain ID.
 * @param symbolId - On-chain oracle symbol ID (1=BTC, 2=ETH, 3=NASUN)
 */
export function useOraclePrice(symbolId: number) {
  const adaptiveOracleInterval = useAdaptiveInterval(REFRESH_INTERVAL_MS);
  const token = getTokenByOracleId(symbolId);

  return useQuery<OraclePriceData | null>({
    queryKey: ['oracle-price', symbolId],
    queryFn: async (): Promise<OraclePriceData | null> => {
      if (!token) return null;
      await refreshPrice(token);
      const { price, timestamp, isFresh } = getPriceWithFreshness(token);
      return { price, timestamp, isFresh };
    },
    refetchInterval: adaptiveOracleInterval,
    staleTime: STALE_TIME_MS,
    enabled: !!token,
  });
}

/**
 * Check if oracle price is stale
 */
export function useIsOracleStale(symbolId: number) {
  const { data } = useOraclePrice(symbolId);
  if (!data) return true;
  return !data.isFresh;
}

/**
 * Format price with appropriate decimals based on oracle symbol
 */
export function formatOraclePrice(price: number, symbolId: number): string {
  // BTC (1), ETH (2), SOL (4): 2 decimals (high-value assets)
  // NASUN (3): 4 decimals (sub-dollar asset)
  if (symbolId <= 2 || symbolId === 4) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
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
