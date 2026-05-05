import { useQuery } from '@tanstack/react-query';

export interface PadoFeedItem {
  id: string;
  source: 'twitter' | 'rss';
  sourceLabel: string;
  title: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
  timestamp: number;
  audience?: 'pado' | 'uju';
}

interface PadoFeedResponse {
  items: PadoFeedItem[];
  fetchedAt: string;
  sources: { rss: boolean; twitter: boolean };
}

const FEED_API_URL = import.meta.env.VITE_NEWS_API_URL as string | undefined;

async function fetchPadoFeed(limit: number): Promise<PadoFeedResponse> {
  if (!FEED_API_URL) throw new Error('VITE_NEWS_API_URL is not configured');
  const res = await fetch(`${FEED_API_URL}?audience=pado&limit=${limit}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Feed error: ${res.status}`);
  return res.json();
}

export function usePadoFeed(limit = 20) {
  return useQuery({
    queryKey: ['padoFeed', limit],
    queryFn: () => fetchPadoFeed(limit),
    enabled: !!FEED_API_URL,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
  });
}
