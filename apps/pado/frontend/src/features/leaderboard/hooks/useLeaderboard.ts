import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { Period, LeaderboardMode, LeaderboardResponse, PnlLeaderboardResponse, PointsLeaderboardResponse, TraderPointsResponse } from '../types';

async function fetchLeaderboard(period: Period, limit: number, offset: number, mode: LeaderboardMode = 'volume'): Promise<LeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { period, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ period, limit: String(limit), offset: String(offset), mode });
  const url = `${baseUrl}/api/leaderboard?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Leaderboard API error: ${res.status}`);
  }

  return res.json();
}

async function fetchPnlLeaderboard(period: Period, limit: number, offset: number): Promise<PnlLeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { mode: 'pnl', period, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ period, limit: String(limit), offset: String(offset), mode: 'pnl' });
  const url = `${baseUrl}/api/leaderboard?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Leaderboard API error: ${res.status}`);
  }

  return res.json();
}

export function useLeaderboard(period: Period, limit: number = 50, offset: number = 0) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', 'volume', period, limit, offset],
    queryFn: () => fetchLeaderboard(period, limit, offset, 'volume'),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function usePnlLeaderboard(period: Period, limit: number = 50, offset: number = 0) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<PnlLeaderboardResponse>({
    queryKey: ['leaderboard', 'pnl', period, limit, offset],
    queryFn: () => fetchPnlLeaderboard(period, limit, offset),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

async function fetchPointsLeaderboard(limit: number, offset: number): Promise<PointsLeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const url = `${baseUrl}/api/leaderboard/points?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Points API error: ${res.status}`);
  }

  return res.json();
}

export function usePointsLeaderboard(limit: number = 50, offset: number = 0) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<PointsLeaderboardResponse>({
    queryKey: ['leaderboard', 'points', limit, offset],
    queryFn: () => fetchPointsLeaderboard(limit, offset),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

async function fetchTraderPoints(address: string): Promise<TraderPointsResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { address, nickname: null, totalPoints: 0, breakdown: { trades: 0, volume: 0, diversity: 0, pnl: 0 }, rank: 0 };
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
