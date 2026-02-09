import { useQuery } from '@tanstack/react-query';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { NewsFeedResponse } from '../types';

const NEWS_API_URL = import.meta.env.VITE_NEWS_API_URL;

async function fetchNewsFeed(limit: number): Promise<NewsFeedResponse> {
  if (!NEWS_API_URL) {
    throw new Error('VITE_NEWS_API_URL is not configured');
  }

  const response = await fetch(`${NEWS_API_URL}?limit=${limit}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`News feed error: ${response.status}`);
  }

  return response.json();
}

export function useNewsFeed(limit = 20) {
  const adaptiveInterval = useAdaptiveInterval(60_000);

  return useQuery({
    queryKey: ['newsFeed', limit],
    queryFn: () => fetchNewsFeed(limit),
    enabled: !!NEWS_API_URL,
    refetchInterval: adaptiveInterval,
    staleTime: 30_000,
    retry: 2,
  });
}
