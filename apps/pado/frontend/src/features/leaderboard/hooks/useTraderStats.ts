import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { TraderStatsResponse } from '../types';

async function fetchTraderStats(address: string): Promise<TraderStatsResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { address, nickname: null, stats: { '24h': null, '7d': null, '30d': null, 'all': null } };
  }

  const url = `${baseUrl}/api/leaderboard/trader/${encodeURIComponent(address)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Trader stats API error: ${res.status}`);
  }

  return res.json();
}

export function useTraderStats(address: string | null) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<TraderStatsResponse>({
    queryKey: ['traderStats', address],
    queryFn: () => fetchTraderStats(address!),
    enabled: !!address && !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
  });
}
