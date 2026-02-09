/**
 * useMarketOrderbook Hook
 * Fetches real on-chain orderbook data for a prediction market
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarketOrderbook } from '../lib/prediction-market';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { Orderbook } from '../types';

interface UseMarketOrderbookResult {
  yesOrderbook: Orderbook;
  noOrderbook: Orderbook;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMarketOrderbook(marketId: string | undefined): UseMarketOrderbookResult {
  const adaptiveInterval = useAdaptiveInterval(15_000);

  const { data: yesData, isLoading: yesLoading, error: yesError, refetch: refetchYes } = useQuery({
    queryKey: ['prediction-orderbook', marketId, 'yes'],
    queryFn: () => fetchMarketOrderbook(marketId!, true),
    enabled: !!marketId,
    staleTime: 10_000, // 10 seconds
    refetchInterval: adaptiveInterval,
  });

  const { data: noData, isLoading: noLoading, error: noError, refetch: refetchNo } = useQuery({
    queryKey: ['prediction-orderbook', marketId, 'no'],
    queryFn: () => fetchMarketOrderbook(marketId!, false),
    enabled: !!marketId,
    staleTime: 10_000,
    refetchInterval: adaptiveInterval,
  });

  const refetch = () => {
    refetchYes();
    refetchNo();
  };

  return {
    yesOrderbook: yesData ?? { bids: [], asks: [] },
    noOrderbook: noData ?? { bids: [], asks: [] },
    isLoading: yesLoading || noLoading,
    error: (yesError || noError) as Error | null,
    refetch,
  };
}
