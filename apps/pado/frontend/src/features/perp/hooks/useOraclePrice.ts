/**
 * Perp Oracle Price Hook
 *
 * Delegates to the unified price source (lib/prices.ts) instead of
 * maintaining a separate oracle RPC client. This ensures all modules
 * see the same price at the same time.
 *
 * @module features/perp/hooks/useOraclePrice
 */

import { useQuery } from '@tanstack/react-query';
import {
  refreshPrice,
  getPriceWithFreshness,
  getTokenByOracleId,
} from '../../../lib/prices';
import { ORACLE_SYMBOL } from '../constants';

const REFETCH_INTERVAL = 10_000; // 10 seconds

interface OraclePriceData {
  price: number;
  timestamp: number;
  isFresh: boolean;
}

/**
 * Fetch oracle price for a symbol via the unified price cache.
 * @param symbolId - On-chain oracle symbol ID (1=BTC, 2=ETH, 3=NASUN)
 */
export function useOraclePrice(symbolId: number) {
  const token = getTokenByOracleId(symbolId);

  return useQuery<OraclePriceData | null>({
    queryKey: ['oracle-price', symbolId],
    queryFn: async (): Promise<OraclePriceData | null> => {
      if (!token) return null;
      await refreshPrice(token);
      const { price, timestamp, isFresh } = getPriceWithFreshness(token);
      return { price, timestamp, isFresh };
    },
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 5_000,
    enabled: !!token,
  });
}

/**
 * Fetch BTC price from oracle
 */
export function useBtcPrice() {
  const { data, isLoading, error } = useOraclePrice(ORACLE_SYMBOL.BTC);

  return {
    price: data?.price ?? 0,
    timestamp: data?.timestamp ?? 0,
    isFresh: data?.isFresh ?? false,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Fetch ETH price from oracle
 */
export function useEthPrice() {
  const { data, isLoading, error } = useOraclePrice(ORACLE_SYMBOL.ETH);

  return {
    price: data?.price ?? 0,
    timestamp: data?.timestamp ?? 0,
    isFresh: data?.isFresh ?? false,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Fetch NASUN price from oracle
 */
export function useNasunPrice() {
  const { data, isLoading, error } = useOraclePrice(ORACLE_SYMBOL.NASUN);

  return {
    price: data?.price ?? 0,
    timestamp: data?.timestamp ?? 0,
    isFresh: data?.isFresh ?? false,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Get price for a market based on its base symbol
 */
export function useMarketPrice(baseSymbol: number) {
  return useOraclePrice(baseSymbol);
}

/**
 * Hook to check if oracle price is stale
 */
export function useIsOracleStale(symbolId: number) {
  const { data } = useOraclePrice(symbolId);
  if (!data) return true;
  return !data.isFresh;
}

/**
 * Format price with appropriate decimals based on symbol
 */
export function formatPrice(price: number, symbol: number): string {
  if (symbol === ORACLE_SYMBOL.BTC || symbol === ORACLE_SYMBOL.ETH) {
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
