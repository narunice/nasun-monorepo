/**
 * Hook for fetching oracle prices
 * @module features/perp/hooks/useOraclePrice
 */

import { useQuery } from '@tanstack/react-query';
import { fetchOraclePrice } from '../lib/perp-client';
import { ORACLE_SYMBOL } from '../constants';

const ORACLE_QUERY_KEY = 'oracle-price';
const REFETCH_INTERVAL = 10_000; // 10 seconds

interface OraclePriceData {
  price: number;
  timestamp: number;
  isFresh: boolean;
}

/**
 * Fetch oracle price for a symbol
 * @param symbolId - 1=BTC, 2=ETH, 3=NASUN
 */
export function useOraclePrice(symbolId: number) {
  return useQuery<OraclePriceData | null>({
    queryKey: [ORACLE_QUERY_KEY, symbolId],
    queryFn: () => fetchOraclePrice(symbolId),
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 5_000,
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

  const now = Date.now();
  const age = now - data.timestamp;
  const isStale = age > 2 * 60 * 1000; // 2 minutes

  return isStale || !data.isFresh;
}

/**
 * Format price with appropriate decimals
 */
export function formatPrice(price: number, symbol: number): string {
  if (symbol === ORACLE_SYMBOL.BTC || symbol === ORACLE_SYMBOL.ETH) {
    // High value assets: 2 decimals
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  // Low value assets: 4 decimals
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
