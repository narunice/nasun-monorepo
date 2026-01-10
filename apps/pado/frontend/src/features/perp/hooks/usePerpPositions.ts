/**
 * Hook for fetching user's perpetual positions
 * @module features/perp/hooks/usePerpPositions
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@nasun/wallet';
import {
  fetchUserPositions,
  fetchPosition,
  calculatePositionMetrics,
} from '../lib/perp-client';
import type { PerpPosition, PositionWithMetrics } from '../types';

const POSITIONS_QUERY_KEY = 'perp-positions';
const POSITION_QUERY_KEY = 'perp-position';
const REFETCH_INTERVAL = 5_000; // 5 seconds for positions (more frequent)

/**
 * Fetch all positions for the connected wallet
 */
export function usePerpPositions() {
  const { account } = useWallet();

  return useQuery<PerpPosition[]>({
    queryKey: [POSITIONS_QUERY_KEY, account?.address],
    queryFn: () =>
      account?.address
        ? fetchUserPositions(account.address)
        : Promise.resolve([]),
    enabled: !!account?.address,
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 2_000,
  });
}

/**
 * Fetch positions with computed metrics (P&L, margin ratio, etc.)
 */
export function usePerpPositionsWithMetrics(
  currentPrices: Map<string, number>, // marketId -> price
) {
  const { data: positions, isLoading, error, refetch } = usePerpPositions();

  const positionsWithMetrics: PositionWithMetrics[] = (positions || []).map(
    (pos) => {
      const currentPrice = currentPrices.get(pos.marketId) || 0;
      return calculatePositionMetrics(pos, currentPrice);
    },
  );

  return {
    positions: positionsWithMetrics,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Fetch a single position by ID with metrics
 */
export function usePerpPosition(
  positionId: string | undefined,
  currentPrice: number,
) {
  const query = useQuery<PerpPosition | null>({
    queryKey: [POSITION_QUERY_KEY, positionId],
    queryFn: () =>
      positionId ? fetchPosition(positionId) : Promise.resolve(null),
    enabled: !!positionId,
    refetchInterval: REFETCH_INTERVAL,
    staleTime: 2_000,
  });

  const positionWithMetrics =
    query.data && currentPrice > 0
      ? calculatePositionMetrics(query.data, currentPrice)
      : null;

  return {
    ...query,
    positionWithMetrics,
  };
}

/**
 * Hook to invalidate position queries (call after open/close)
 */
export function useInvalidatePositions() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: [POSITIONS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [POSITION_QUERY_KEY] });
  };
}

/**
 * Get positions filtered by market
 */
export function usePositionsByMarket(marketId: string | undefined) {
  const { data: positions, isLoading, error } = usePerpPositions();

  const filteredPositions = marketId
    ? (positions || []).filter((p) => p.marketId === marketId)
    : [];

  return {
    positions: filteredPositions,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Get total position count and value
 */
export function usePositionsSummary(currentPrices: Map<string, number>) {
  const { positions } = usePerpPositionsWithMetrics(currentPrices);

  const totalPositions = positions.length;
  const totalNotionalValue = positions.reduce(
    (sum, p) => sum + p.notionalValue,
    0,
  );
  const totalUnrealizedPnl = positions.reduce((sum, p) => {
    const pnl = p.unrealizedPnlNegative ? -p.unrealizedPnl : p.unrealizedPnl;
    return sum + pnl;
  }, 0);
  const longPositions = positions.filter((p) => p.isLong).length;
  const shortPositions = positions.filter((p) => !p.isLong).length;

  return {
    totalPositions,
    totalNotionalValue,
    totalUnrealizedPnl,
    longPositions,
    shortPositions,
  };
}
