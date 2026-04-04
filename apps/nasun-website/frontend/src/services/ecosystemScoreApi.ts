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
  isPenalized?: boolean;
  bonusTotal?: number;
  referralBonus?: number;
  referralScalingFactor?: number;
  activations: Array<{ nftType: string; nftCount: number; bonus?: number }>;
  daily: {
    baseScore: number;
    bonusTotal?: number;
    referralBonus?: number;
    ecosystemScore: number;
  };
  weekly: {
    baseScore: number;
    bonusTotal?: number;
    referralBonus?: number;
    ecosystemScore: number;
    activeDays: number;
  };
  allTime: {
    baseScore: number;
    bonusTotal?: number;
    referralBonus?: number;
    ecosystemScore: number;
    activeDays: number;
    bonusCategories?: Array<{ category: string; points: number }>;
    scoreBreakdown?: Array<{ category: string; points: number }>;
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
    period: "daily" | "weekly" | "monthly" | "all-time";
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
  period: "daily" | "weekly" | "monthly" | "all-time" = "daily",
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

/**
 * Trigger per-user NFT activation cache sync on explorer-api.
 * Call after activate/deactivate or manual Refresh.
 */
export async function syncEcosystemActivations(
  identityId: string,
): Promise<{ multiplier: number; synced: boolean } | null> {
  if (!API_BASE) return null;
  if (!IDENTITY_ID_RE.test(identityId)) return null;

  const encoded = encodeURIComponent(identityId);
  const res = await fetch(`${API_BASE}/ecosystem/sync/${encoded}`, {
    method: 'POST',
  });

  if (res.status === 429) return null; // rate-limited, silent
  if (!res.ok) return null;

  const json = await res.json();
  return json.data ?? null;
}

export interface SnapshotHistoryEntry {
  date: string;
  baseScore: number;
  multiplier: number;
  bonusTotal: number;
  referralBonus: number;
  ecosystemScore: number;
  isPenalized: boolean;
  rank: number | null;
}

export async function getSnapshotHistory(
  identityId: string,
  days: number = 30,
): Promise<SnapshotHistoryEntry[]> {
  if (!API_BASE) return [];
  if (!IDENTITY_ID_RE.test(identityId)) return [];

  const encoded = encodeURIComponent(identityId);
  const res = await fetch(
    `${API_BASE}/ecosystem/snapshot/history/${encoded}?days=${days}`,
  );

  if (!res.ok) return [];

  const json = await res.json();
  // API returns DESC order; reverse for chronological display
  // Normalize date to YYYY-MM-DD (API may return ISO timestamp)
  return ((json.data ?? []) as SnapshotHistoryEntry[])
    .map(entry => ({
      ...entry,
      date: entry.date.split('T')[0],
    }))
    .reverse();
}

export interface BonusHistoryItem {
  category: string;
  activityType: string;
  points: number;
  count: number;
}

export interface BonusHistoryDay {
  date: string;
  total: number;
  items: BonusHistoryItem[];
}

export async function getBonusHistory(
  identityId: string,
  days: number = 30,
): Promise<BonusHistoryDay[]> {
  if (!API_BASE) return [];
  if (!IDENTITY_ID_RE.test(identityId)) return [];

  const encoded = encodeURIComponent(identityId);
  const res = await fetch(
    `${API_BASE}/ecosystem/bonus-history/${encoded}?days=${days}`,
  );

  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
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
