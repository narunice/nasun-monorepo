import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import type { TraderFillsResponse } from '../types';

async function fetchTraderFills(address: string, limit: number): Promise<TraderFillsResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { address, fills: [], hasMore: false };
  }

  const params = new URLSearchParams({ limit: String(limit) });
  const url = `${baseUrl}/api/leaderboard/trader/${encodeURIComponent(address)}/fills?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Trader fills API error: ${res.status}`);
  }

  return res.json();
}

export function useTraderFills(address: string | null, limit: number = 50) {
  return useQuery<TraderFillsResponse>({
    queryKey: ['traderFills', address, limit],
    queryFn: () => fetchTraderFills(address!, limit),
    enabled: !!address && !!NETWORK_CONFIG.chatHttpUrl,
    staleTime: 30_000,
  });
}
