import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { getChatService } from '../../../lib/chat-service';
import type { FeedResponse } from '../types';

async function fetchFeed(
  limit: number,
  beforeTs?: number,
): Promise<FeedResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  const sessionToken = getChatService().getSessionToken();

  if (!baseUrl || !sessionToken) {
    return { activities: [], hasMore: false };
  }

  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeTs != null) {
    params.set('beforeTs', String(beforeTs));
  }

  const res = await fetch(`${baseUrl}/api/feed?${params}`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });

  if (res.status === 401) {
    return { activities: [], hasMore: false };
  }

  if (!res.ok) {
    throw new Error(`Feed API error: ${res.status}`);
  }

  return res.json();
}

export function useActivityFeed(limit: number = 30, beforeTs?: number) {
  const sessionToken = getChatService().getSessionToken();

  return useQuery<FeedResponse>({
    queryKey: ['activity-feed', limit, beforeTs],
    queryFn: () => fetchFeed(limit, beforeTs),
    enabled: !!NETWORK_CONFIG.chatHttpUrl && !!sessionToken,
    staleTime: 30_000,
    // Only auto-refresh the first page; paginated pages are static
    refetchInterval: beforeTs == null ? 30_000 : false,
  });
}
