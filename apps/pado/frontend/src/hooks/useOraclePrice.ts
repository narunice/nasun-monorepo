/**
 * useOraclePrice - React hook for fetching oracle prices
 *
 * @version 0.1.0
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSuiClient } from '@nasun/wallet';
import {
  getPrice,
  getAllPrices,
  isFresh,
  type SymbolKey,
  type PriceData,
} from '../lib/oracle-client';

// ========================================
// Query Keys
// ========================================

export const ORACLE_QUERY_KEYS = {
  price: (symbol: SymbolKey) => ['oracle-price', symbol] as const,
  allPrices: ['oracle-prices-all'] as const,
};

// ========================================
// Hooks
// ========================================

/**
 * Hook to fetch a single price
 *
 * @param symbol - Symbol to fetch (BTCUSD, ETHUSD, NASUSD)
 * @param options - Query options
 */
export function useOraclePrice(
  symbol: SymbolKey,
  options?: {
    refetchInterval?: number;
    staleTime?: number;
    enabled?: boolean;
  }
) {
  const {
    refetchInterval = 10_000, // 10 seconds
    staleTime = 5_000, // 5 seconds
    enabled = true,
  } = options ?? {};

  return useQuery({
    queryKey: ORACLE_QUERY_KEYS.price(symbol),
    queryFn: async (): Promise<PriceData | null> => {
      const client = getSuiClient();
      return getPrice(client, symbol);
    },
    refetchInterval,
    staleTime,
    enabled,
  });
}

/**
 * Hook to fetch all prices at once
 *
 * @param options - Query options
 */
export function useAllOraclePrices(options?: {
  refetchInterval?: number;
  staleTime?: number;
  enabled?: boolean;
}) {
  const {
    refetchInterval = 10_000,
    staleTime = 5_000,
    enabled = true,
  } = options ?? {};

  return useQuery({
    queryKey: ORACLE_QUERY_KEYS.allPrices,
    queryFn: async () => {
      const client = getSuiClient();
      return getAllPrices(client);
    },
    refetchInterval,
    staleTime,
    enabled,
  });
}

/**
 * Hook to manually refresh oracle prices
 */
export function useRefreshOraclePrices() {
  const queryClient = useQueryClient();

  return {
    refreshAll: () => {
      queryClient.invalidateQueries({ queryKey: ORACLE_QUERY_KEYS.allPrices });
    },
    refreshSymbol: (symbol: SymbolKey) => {
      queryClient.invalidateQueries({ queryKey: ORACLE_QUERY_KEYS.price(symbol) });
    },
  };
}

/**
 * Hook to check if price is fresh
 *
 * @param price - PriceData to check
 * @param maxAgeMs - Maximum age in milliseconds
 */
export function usePriceFreshness(price: PriceData | null | undefined, maxAgeMs = 60_000) {
  if (!price) return { isFresh: false, age: null };

  const age = Date.now() - price.timestamp;
  return {
    isFresh: isFresh(price, maxAgeMs),
    age,
    ageFormatted: formatAge(age),
  };
}

// ========================================
// Helpers
// ========================================

function formatAge(ageMs: number): string {
  if (ageMs < 1000) return 'just now';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}s ago`;
  if (ageMs < 3600_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  return `${Math.floor(ageMs / 3600_000)}h ago`;
}
