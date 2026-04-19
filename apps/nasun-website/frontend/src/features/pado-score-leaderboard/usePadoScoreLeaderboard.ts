import { useQuery } from '@tanstack/react-query';

// Mirror of pado/frontend/src/features/leaderboard/types.ts ScoreLeaderboardTrader
export interface ScoreLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass?: boolean;
  profileImageUrl?: string | null;
  xHandle?: string | null;
  totalScore: number;
  tradeCount: number;
  volumeUsd: string;
  rankChange: number;
  hasGoogle?: boolean;
  hasTelegram?: boolean;
}

export interface ScoreLeaderboardResponse {
  scope: 'weekly' | 'alltime';
  weekId?: string;
  weekStart?: number; // ms timestamp of week start (Monday 00:10 UTC)
  traders: ScoreLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

// 12-hour grace period after weekly reset before switching to live scores
export const WEEK_GRACE_PERIOD_MS = 12 * 60 * 60 * 1000;

// ISO 8601 week ID (Thursday-anchor algorithm). Copied from pado useLeaderboard.ts.
function getWeekId(weeksAgo = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7 * weeksAgo);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getChatHttpUrl(): string {
  return import.meta.env.VITE_NASUN_CHAT_HTTP_URL || '';
}

async function fetchWeeklyScoreLeaderboard(
  weekId: string,
  limit: number,
  offset: number,
): Promise<ScoreLeaderboardResponse> {
  const baseUrl = getChatHttpUrl();
  if (!baseUrl) {
    return { scope: 'weekly', weekId, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const res = await fetch(`${baseUrl}/api/pado/leaderboard/score/weekly/${weekId}?${params}`);

  if (res.status === 404) {
    return { scope: 'weekly', weekId, traders: [], updatedAt: 0, totalTraders: 0 };
  }

  if (!res.ok) {
    throw new Error(`Pado score leaderboard API error: ${res.status}`);
  }

  return res.json();
}

export interface AvailableWeek { weekId: string; label: string; }

export function useAvailableWeeks() {
  return useQuery<{ weeks: AvailableWeek[] }>({
    queryKey: ['pado-score-leaderboard', 'weeks'],
    queryFn: async () => {
      const baseUrl = getChatHttpUrl();
      if (!baseUrl) return { weeks: [] };
      const res = await fetch(`${baseUrl}/api/pado/leaderboard/score/weekly`);
      if (!res.ok) throw new Error(`Available weeks API error: ${res.status}`);
      return res.json();
    },
    enabled: !!getChatHttpUrl(),
    staleTime: 2 * 60_000,
  });
}

export function getCurrentWeekId(): string {
  return getWeekId(0);
}

export function usePadoScoreLeaderboard(weekId?: string) {
  const resolvedWeekId = weekId ?? getWeekId(0);

  return useQuery<ScoreLeaderboardResponse>({
    queryKey: ['pado-score-leaderboard', 'current', resolvedWeekId],
    queryFn: () => fetchWeeklyScoreLeaderboard(resolvedWeekId, 1000, 0),
    enabled: !!getChatHttpUrl(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

export function usePreviousPadoScoreLeaderboard(enabled: boolean, limit = 50, offset = 0) {
  const weekId = getWeekId(1);

  return useQuery<ScoreLeaderboardResponse>({
    queryKey: ['pado-score-leaderboard', 'previous', weekId, limit, offset],
    queryFn: () => fetchWeeklyScoreLeaderboard(weekId, limit, offset),
    enabled: enabled && !!getChatHttpUrl(),
    staleTime: 5 * 60_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

export function isNewWeekGracePeriod(data: ScoreLeaderboardResponse | undefined): boolean {
  if (!data) return false;
  if (!data.weekStart) return false;
  return Date.now() - data.weekStart < WEEK_GRACE_PERIOD_MS;
}
