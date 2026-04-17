import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { Period, LeaderboardMode, LeaderboardResponse, PnlLeaderboardResponse, ScoreLeaderboardResponse, TraderScoreResponse, ScoreScope } from '../types';

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

async function fetchScoreLeaderboard(scope: ScoreScope, limit: number, offset: number): Promise<ScoreLeaderboardResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { scope, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ scope, limit: String(limit), offset: String(offset) });
  const url = `${baseUrl}/api/pado/leaderboard/score?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Score API error: ${res.status}`);
  }

  return res.json();
}

export function useScoreLeaderboard(scope: ScoreScope = 'weekly', limit: number = 50, offset: number = 0) {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  return useQuery<ScoreLeaderboardResponse>({
    queryKey: ['leaderboard', 'score', scope, limit, offset],
    queryFn: () => fetchScoreLeaderboard(scope, limit, offset),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

async function fetchTraderScore(address: string, scope: ScoreScope): Promise<TraderScoreResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { address, nickname: null, totalScore: 0, breakdown: { trades: 0, volume: 0, diversity: 0, pnl: 0 }, rank: 0, scope };
  }

  const url = `${baseUrl}/api/pado/leaderboard/trader/${encodeURIComponent(address)}/score?scope=${scope}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Trader score API error: ${res.status}`);
  }

  return res.json();
}

export function useTraderScore(address: string | null, scope: ScoreScope = 'alltime') {
  return useQuery<TraderScoreResponse>({
    queryKey: ['trader-score', address, scope],
    queryFn: () => fetchTraderScore(address!, scope),
    enabled: !!NETWORK_CONFIG.chatHttpUrl && !!address,
    staleTime: 30_000,
  });
}
