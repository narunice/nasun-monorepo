import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import type { Period, LeaderboardResponse } from '../types';

async function fetchLeaderboard(period: Period, limit: number): Promise<LeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { period, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ period, limit: String(limit) });
  const url = `${baseUrl}/api/leaderboard?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Leaderboard API error: ${res.status}`);
  }

  return res.json();
}

export function useLeaderboard(period: Period, limit: number = 50) {
  return useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', period, limit],
    queryFn: () => fetchLeaderboard(period, limit),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
