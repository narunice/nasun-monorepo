/**
 * useMarketOrderbook Hook (round-6 plan §2.6)
 *
 * Polls both YES and NO orderbooks. Adds `status` + `lastUpdateMs` so the UI
 * can render a freshness indicator without changing the existing call sites.
 * Future swap to a WebSocket feed keeps this surface stable.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarketOrderbook } from '../lib/prediction-market';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { Orderbook } from '../types';

export type OrderbookStatus = 'live' | 'reconnecting' | 'error';

interface UseMarketOrderbookResult {
  yesOrderbook: Orderbook;
  noOrderbook: Orderbook;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  status: OrderbookStatus;
  lastUpdateMs: number;
}

const EMPTY: Orderbook = { bids: [], asks: [] };

export function useMarketOrderbook(marketId: string | undefined): UseMarketOrderbookResult {
  const adaptiveInterval = useAdaptiveInterval(15_000);

  const yesQuery = useQuery({
    queryKey: ['prediction', 'orderbook', marketId, 'yes'] as const,
    queryFn: () => fetchMarketOrderbook(marketId!, true),
    enabled: !!marketId,
    staleTime: 10_000,
    refetchInterval: adaptiveInterval,
  });

  const noQuery = useQuery({
    queryKey: ['prediction', 'orderbook', marketId, 'no'] as const,
    queryFn: () => fetchMarketOrderbook(marketId!, false),
    enabled: !!marketId,
    staleTime: 10_000,
    refetchInterval: adaptiveInterval,
  });

  const refetch = () => {
    yesQuery.refetch();
    noQuery.refetch();
  };

  const lastUpdateMs = Math.max(yesQuery.dataUpdatedAt ?? 0, noQuery.dataUpdatedAt ?? 0);
  const error = (yesQuery.error || noQuery.error) as Error | null;

  let status: OrderbookStatus = 'live';
  if (error) status = 'error';
  else if (yesQuery.isFetching || noQuery.isFetching) status = lastUpdateMs > 0 ? 'live' : 'reconnecting';

  return {
    yesOrderbook: yesQuery.data ?? EMPTY,
    noOrderbook: noQuery.data ?? EMPTY,
    isLoading: yesQuery.isLoading || noQuery.isLoading,
    error,
    refetch,
    status,
    lastUpdateMs,
  };
}
