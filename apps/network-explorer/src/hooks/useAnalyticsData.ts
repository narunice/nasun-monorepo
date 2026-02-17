import { useQuery } from '@tanstack/react-query';
import { fetchAnalyticsData } from '../lib/analytics/analytics-fetcher';
import type { TimeRange, AnalyticsData } from '../lib/analytics/types';

/**
 * Master hook for analytics data (checkpoint-based).
 * Fetches day boundaries via binary search and computes:
 * - Summary cards (totalTx, 24h TX, avg TPS, trends)
 * - Daily TX history for charts
 */
export function useAnalyticsData(timeRange: TimeRange) {
  return useQuery<AnalyticsData>({
    queryKey: ['analytics', 'data', timeRange],
    queryFn: () => fetchAnalyticsData(timeRange),
    staleTime: 10 * 60 * 1000, // 10 min
    refetchInterval: 5 * 60 * 1000, // 5 min
    retry: 2,
  });
}
