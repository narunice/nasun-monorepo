/**
 * TanStack Query hooks for the gostop Tier 0 API.
 *
 * All /me/* responses are `Cache-Control: no-store` (no ETag), so we rely on
 * TanStack's `staleTime` for in-tab dedup rather than HTTP conditional GETs.
 * Per-endpoint stale times mirror the handoff guidance.
 *
 * `enabled` gates on both wallet presence and (for authed routes) `tokenReady`
 * from `useGostopAuth`. The auth hook auto-acquires the token on connect, so
 * gating prevents 401 churn during the initial sign prompt window.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './client';
import { useGostopAuth } from '../../hooks/useGostopAuth';
import type {
  MeProfile,
  MeRecentRounds,
  MeStats,
  MeSettings,
  MeEcosystem,
  MeLeaderboardRank,
  StreakSummary,
  TransparencyResponse,
  LotteryDrawsResponse,
  StatsPeriod,
  FeedVisibility,
  RoundDetail,
  GameKey,
  LeaderboardResponse,
  LeaderboardPeriod,
  LeaderboardGame,
  LeaderboardMetric,
} from './types';

const STALE = {
  profile: 5_000,
  recentRounds: 5_000,
  stats: 10_000,
  settings: 30_000,
  ecosystem: 30_000,
  streak: 10_000,
  transparency: 5_000,
  lotteryDraws: 5_000,
  round: 60_000,
  rank: 60_000,
  leaderboard: 10_000,
} as const;

// Shared query key roots — exported so components can invalidate by surface
// (e.g. invalidate 'me' after a round settles).
export const QK = {
  me: ['gostop', 'me'] as const,
  meProfile: () => [...QK.me, 'profile'] as const,
  meRecentRounds: (limit: number) => [...QK.me, 'recent-rounds', limit] as const,
  meStats: (period: StatsPeriod) => [...QK.me, 'stats', period] as const,
  meSettings: () => [...QK.me, 'settings'] as const,
  meEcosystem: () => [...QK.me, 'ecosystem'] as const,
  meRank: () => [...QK.me, 'rank'] as const,
  meStreak: () => [...QK.me, 'streak'] as const,
  streak: (player: string) => ['gostop', 'streak', player.toLowerCase()] as const,
  leaderboard: (
    period: LeaderboardPeriod,
    game: LeaderboardGame,
    metric: LeaderboardMetric,
    limit: number,
  ) => ['gostop', 'leaderboard', period, game, metric, limit] as const,
  transparency: () => ['gostop', 'transparency'] as const,
  lotteryDraws: (limit: number) => ['gostop', 'lottery', 'draws', limit] as const,
  round: (game: GameKey, sessionIdHex: string) =>
    ['gostop', 'round', game, sessionIdHex.toLowerCase()] as const,
};

// ──────────────────────────────────────────────────────────────────────────
// /me/* (auth required)
// ──────────────────────────────────────────────────────────────────────────

export function useMeProfile() {
  const { walletAddress, tokenReady } = useGostopAuth();
  return useQuery({
    queryKey: QK.meProfile(),
    enabled: !!walletAddress && tokenReady,
    staleTime: STALE.profile,
    queryFn: () =>
      apiRequest<MeProfile>('/api/gostop/me/profile', { authWallet: walletAddress! }),
  });
}

export function useMeRecentRounds(limit = 20) {
  const { walletAddress, tokenReady } = useGostopAuth();
  return useQuery({
    queryKey: QK.meRecentRounds(limit),
    enabled: !!walletAddress && tokenReady,
    staleTime: STALE.recentRounds,
    queryFn: () =>
      apiRequest<MeRecentRounds>(
        `/api/gostop/me/recent-rounds?limit=${encodeURIComponent(limit)}`,
        { authWallet: walletAddress! },
      ),
  });
}

export function useMeStats(period: StatsPeriod = 'all') {
  const { walletAddress, tokenReady } = useGostopAuth();
  return useQuery({
    queryKey: QK.meStats(period),
    enabled: !!walletAddress && tokenReady,
    staleTime: STALE.stats,
    queryFn: () =>
      apiRequest<MeStats>(`/api/gostop/me/stats?period=${period}`, {
        authWallet: walletAddress!,
      }),
  });
}

export function useMeSettings() {
  const { walletAddress, tokenReady } = useGostopAuth();
  return useQuery({
    queryKey: QK.meSettings(),
    enabled: !!walletAddress && tokenReady,
    staleTime: STALE.settings,
    queryFn: () =>
      apiRequest<MeSettings>('/api/gostop/me/settings', { authWallet: walletAddress! }),
  });
}

/**
 * PATCH /me/settings + invalidate the settings cache. We do not invalidate
 * /me/profile because feed_visibility does not surface there — but the
 * backend cache buster (`feed:visibility-map` + `leaderboard:opt-out-set`)
 * means downstream feed/leaderboard data updates without further action here.
 */
export function useUpdateMeSettings() {
  const { walletAddress, tokenReady } = useGostopAuth();
  const queryClient = useQueryClient();

  return useMutation<MeSettings, Error, { feed_visibility: FeedVisibility }>({
    mutationFn: (body) => {
      if (!walletAddress || !tokenReady) {
        throw new Error('wallet not authenticated');
      }
      return apiRequest<MeSettings>('/api/gostop/me/settings', {
        method: 'PATCH',
        body,
        authWallet: walletAddress,
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QK.meSettings(), data);
    },
  });
}

export function useMeEcosystem() {
  const { walletAddress, tokenReady } = useGostopAuth();
  return useQuery({
    queryKey: QK.meEcosystem(),
    enabled: !!walletAddress && tokenReady,
    staleTime: STALE.ecosystem,
    queryFn: () =>
      apiRequest<MeEcosystem>('/api/gostop/me/ecosystem', { authWallet: walletAddress! }),
  });
}

export function useMeStreak() {
  const { walletAddress, tokenReady } = useGostopAuth();
  return useQuery({
    queryKey: QK.meStreak(),
    enabled: !!walletAddress && tokenReady,
    staleTime: STALE.streak,
    queryFn: () =>
      apiRequest<StreakSummary>('/api/gostop/me/streak', { authWallet: walletAddress! }),
  });
}

export function useMeLeaderboardRank() {
  const { walletAddress, tokenReady } = useGostopAuth();
  return useQuery({
    queryKey: QK.meRank(),
    enabled: !!walletAddress && tokenReady,
    staleTime: STALE.rank,
    queryFn: () =>
      apiRequest<MeLeaderboardRank>('/api/gostop/leaderboard/me?period=all&metric=net_pnl', {
        authWallet: walletAddress!,
      }),
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Public (no auth)
// ──────────────────────────────────────────────────────────────────────────

export function useLeaderboard(
  period: LeaderboardPeriod,
  game: LeaderboardGame,
  metric: LeaderboardMetric,
  limit = 100,
) {
  return useQuery({
    queryKey: QK.leaderboard(period, game, metric, limit),
    staleTime: STALE.leaderboard,
    queryFn: () => {
      const params = new URLSearchParams({
        period,
        game: String(game),
        metric,
        limit: String(limit),
      });
      return apiRequest<LeaderboardResponse>(`/api/gostop/leaderboard?${params.toString()}`);
    },
  });
}

export function useStreak(player: string | undefined) {
  return useQuery({
    queryKey: player ? QK.streak(player) : ['gostop', 'streak', 'disabled'],
    enabled: !!player,
    staleTime: STALE.streak,
    queryFn: () => apiRequest<StreakSummary>(`/api/gostop/streak/${player}`),
  });
}

export function useTransparency() {
  return useQuery({
    queryKey: QK.transparency(),
    staleTime: STALE.transparency,
    queryFn: () => apiRequest<TransparencyResponse>('/api/gostop/transparency'),
  });
}

export function useRound(game: GameKey | undefined, sessionIdHex: string | undefined) {
  const enabled = !!game && !!sessionIdHex && /^[0-9a-f]+$/i.test(sessionIdHex);
  return useQuery({
    queryKey: enabled
      ? QK.round(game!, sessionIdHex!)
      : ['gostop', 'round', 'disabled'],
    enabled,
    staleTime: STALE.round,
    queryFn: () =>
      apiRequest<RoundDetail>(
        `/api/gostop/round/${game}/${sessionIdHex!.toLowerCase()}`,
      ),
  });
}

export function useLotteryDraws(limit = 20) {
  return useQuery({
    queryKey: QK.lotteryDraws(limit),
    staleTime: STALE.lotteryDraws,
    queryFn: () =>
      apiRequest<LotteryDrawsResponse>(
        `/api/gostop/lottery/draws?limit=${encodeURIComponent(limit)}`,
      ),
  });
}
