/**
 * Ecosystem Score API Client
 *
 * Public API (no auth required) for ecosystem scores and leaderboard.
 * Calls explorer-api endpoints at VITE_EXPLORER_API_URL.
 */

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL;
const IDENTITY_ID_RE = /^[\w-]+:[\w-]{36}$/;

export class EcosystemScoreError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "EcosystemScoreError";
  }
}

export interface EcosystemScoreData {
  identityId: string;
  multiplier: number;
  disabled?: boolean;
  activations: Array<{ nftType: string; nftCount: number; bonus?: number }>;
  daily: {
    baseScore: number;
    ecosystemScore: number;
  };
  weekly: {
    baseScore: number;
    ecosystemScore: number;
    activeDays: number;
  };
  allTime: {
    baseScore: number;
    ecosystemScore: number;
    activeDays: number;
  };
}

export interface EcosystemLeaderboardEntry {
  identityId: string;
  baseScore: number;
  multiplier: number;
  ecosystemScore: number;
  activeDays?: number;
  rank: number;
}

export interface EcosystemLeaderboardResponse {
  data: EcosystemLeaderboardEntry[];
  meta: {
    period: "daily" | "weekly";
    limit: number;
    offset: number;
    total: number;
  };
}

export async function getEcosystemScore(
  identityId: string,
): Promise<EcosystemScoreData | null> {
  if (!API_BASE) return null;
  if (!IDENTITY_ID_RE.test(identityId)) return null;

  const encoded = encodeURIComponent(identityId);
  const res = await fetch(`${API_BASE}/ecosystem/score/${encoded}`);

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new EcosystemScoreError(
      `Ecosystem score fetch failed: ${res.status}`,
      res.status,
    );
  }

  const json = await res.json();
  return json.data ?? null;
}

export async function getEcosystemLeaderboard(
  period: "daily" | "weekly" = "daily",
  limit: number = 50,
  offset: number = 0,
): Promise<EcosystemLeaderboardResponse> {
  if (!API_BASE) return { data: [], meta: { period, limit, offset, total: 0 } };

  const params = new URLSearchParams({
    period,
    limit: String(limit),
    offset: String(offset),
  });

  const res = await fetch(`${API_BASE}/ecosystem/leaderboard?${params}`);
  if (!res.ok) {
    throw new EcosystemScoreError(
      `Ecosystem leaderboard fetch failed: ${res.status}`,
      res.status,
    );
  }

  return res.json();
}

export async function getEcosystemHealth(): Promise<{
  lastRefresh: string | null;
  stale: boolean;
  activationsCacheSize: number;
} | null> {
  if (!API_BASE) return null;

  const res = await fetch(`${API_BASE}/ecosystem/health`);
  if (!res.ok) return null;

  const json = await res.json();
  return json.data ?? null;
}
