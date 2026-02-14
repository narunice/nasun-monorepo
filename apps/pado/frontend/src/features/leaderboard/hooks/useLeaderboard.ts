import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { Period, LeaderboardMode, LeaderboardResponse, PnlLeaderboardResponse, PointsLeaderboardResponse, TraderPointsResponse } from '../types';

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

async function fetchPointsLeaderboard(limit: number): Promise<PointsLeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ limit: String(limit) });
  const url = `${baseUrl}/api/leaderboard/points?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Points API error: ${res.status}`);
  }

  return res.json();
}

export function usePointsLeaderboard(limit: number = 50) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<PointsLeaderboardResponse>({
    queryKey: ['leaderboard', 'points', limit],
    queryFn: () => fetchPointsLeaderboard(limit),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
  });
}

async function fetchTraderPoints(address: string): Promise<TraderPointsResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { address, nickname: null, totalPoints: 0, breakdown: { trades: 0, volume: 0, diversity: 0 }, rank: 0 };
  }

  const url = `${baseUrl}/api/leaderboard/trader/${encodeURIComponent(address)}/points`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Trader points API error: ${res.status}`);
  }

  return res.json();
}

export function useTraderPoints(address: string | null) {
  return useQuery<TraderPointsResponse>({
    queryKey: ['trader-points', address],
    queryFn: () => fetchTraderPoints(address!),
    enabled: !!NETWORK_CONFIG.chatHttpUrl && !!address,
    staleTime: 30_000,
  });
}
