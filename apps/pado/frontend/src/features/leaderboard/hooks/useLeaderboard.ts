import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { Period, LeaderboardMode, LeaderboardResponse, PnlLeaderboardResponse } from '../types';

async function fetchLeaderboard(period: Period, limit: number, mode: LeaderboardMode = 'volume'): Promise<LeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { period, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ period, limit: String(limit), mode });
  const url = `${baseUrl}/api/leaderboard?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Leaderboard API error: ${res.status}`);
  }

  return res.json();
}

async function fetchPnlLeaderboard(period: Period, limit: number): Promise<PnlLeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { mode: 'pnl', period, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ period, limit: String(limit), mode: 'pnl' });
  const url = `${baseUrl}/api/leaderboard?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Leaderboard API error: ${res.status}`);
  }

  return res.json();
}

export function useLeaderboard(period: Period, limit: number = 50) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', 'volume', period, limit],
    queryFn: () => fetchLeaderboard(period, limit, 'volume'),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
  });
}

export function usePnlLeaderboard(period: Period, limit: number = 50) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<PnlLeaderboardResponse>({
    queryKey: ['leaderboard', 'pnl', period, limit],
    queryFn: () => fetchPnlLeaderboard(period, limit),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
  });
}
