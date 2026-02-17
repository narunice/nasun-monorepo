import { useQuery } from '@tanstack/react-query';
import { fetchTradingActivity } from '../lib/analytics/analytics-fetcher';
import type { TimeRange, TradingActivityData } from '../lib/analytics/types';

/**
 * Hook for trading activity (OrderFilled events).
 * Separate from useAnalyticsData because it uses queryEvents (different RPC method).
 */
export function useTradingActivity(timeRange: TimeRange) {
  return useQuery<TradingActivityData[]>({
    queryKey: ['analytics', 'trading', timeRange],
    queryFn: () => fetchTradingActivity(timeRange),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
}
