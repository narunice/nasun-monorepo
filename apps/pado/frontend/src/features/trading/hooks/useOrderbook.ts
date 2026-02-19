/**
 * useOrderbook Hook
 * React Query based orderbook fetching with realtime event updates
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getOrderbook, type Orderbook } from '../../../lib/deepbook';
import { getEventService } from '../../../lib/event-service';
import { useMarket } from '../context/MarketContext';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

export interface OrderbookData {
  orderbook: Orderbook;
  midPrice: number;
}

/**
 * Orderbook and mid-price fetching with event-based invalidation
 * @param refetchInterval Backup polling interval (default 10s, reduced from 5s due to event updates)
 */
export function useOrderbook(refetchInterval = 10000) {
  const { currentPool, currentMarket } = useMarket();
  const queryClient = useQueryClient();
  const adaptiveInterval = useAdaptiveInterval(refetchInterval);

  // Subscribe to orderbook-affecting events for instant updates
  useEffect(() => {
    const eventService = getEventService();
    const queryKey = ['orderbook', currentMarket];

    // Invalidate orderbook query when relevant events occur
    const invalidateOrderbook = () => {
      queryClient.invalidateQueries({ queryKey });
    };

    // Subscribe to all order-related events
    const unsubscribes = [
      eventService.subscribe('OrderFilled', invalidateOrderbook),
      eventService.subscribe('OrderPlaced', invalidateOrderbook),
      eventService.subscribe('OrderCanceled', invalidateOrderbook),
    ];

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [currentMarket, queryClient]);

  return useQuery<OrderbookData>({
    queryKey: ['orderbook', currentMarket],
    queryFn: async () => {
      // getOrderbook already computes midPrice = (bestAsk + bestBid) / 2
      // No need for separate getPoolMidPrice devInspect call
      const orderbook = await getOrderbook(currentPool);
      return { orderbook, midPrice: orderbook.midPrice };
    },
    refetchInterval: adaptiveInterval,
    staleTime: 3000, // Increased from 2s since we have event-based updates
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });
}
