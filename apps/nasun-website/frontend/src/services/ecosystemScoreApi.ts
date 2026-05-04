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

export interface EcosystemHealthSlot {
  /**
   * V3 semantics:
   *   - Alliance slot: alliance_health % (0..100, 25-step). For GP holders, always 100.
   *   - GP slot: gp_bonus * 100 (0..100, 20-step).
   */
  pct: number;
  restDays: number;
  hasNft: boolean;
}

export interface EcosystemScoreData {
  identityId: string;
  multiplier: number;
  disabled?: boolean;
  isWeakened?: boolean;
  isPenalized?: boolean;
  /** V2 per-NFT health data. Present only after ECO_HEALTH_V2_CUTOFF. */
  health?: {
    alliance:    EcosystemHealthSlot;
    genesisPass: EcosystemHealthSlot;
  };
  bonusTotal?: number;
  referralBonus?: number;
  referralScalingFactor?: number;
  activations: Array<{ nftType: string; nftCount: number; bonus?: number }>;
  /** Distinct on-chain categories the identity has credited today (UTC).
   *  Used by the frontend filter as the optimistic layer; backend also applies
   *  the same filter before returning daily.baseScore. */
  todayCategories?: string[];
  daily: {
    /** Filtered base score: only categories in the user's active mission set.
     *  Backend computes this from user_active_missions; frontend re-computes
     *  it optimistically from localStorage for instant UI response. */
    baseScore: number;
    /** Raw (unfiltered) matview base score. Used by the frontend to detect
     *  hasFilteredOutActivity and show the "Today *" tooltip. */
    _rawBaseScore?: number;
    /** True when the user has on-chain activity outside their active mission
     *  set today (i.e. baseScore < _rawBaseScore). */
    hasFilteredActivity?: boolean;
    stakingScore?: number;
    bonusTotal?: number;
    referralBonus?: number;
    governancePoints?: number;
    ecosystemScore: number;
  };
  weekly: {
    baseScore: number;
    stakingScore?: number;
    bonusTotal?: number;
    referralBonus?: number;
    ecosystemScore: number;
    activeDays: number;
  };
  allTime: {
    baseScore: number;
    stakingScore?: number;
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
  activityScore: number;
  creatorPostScore: number;
  bonusScore: number;
  weeklyScore: number;
  activeDays: number;
  volumeCount?: number;
  hasGenesisPass: boolean;
  displayName: string | null;
  xHandle: string | null;
  profileImageUrl: string | null;
  rank: number;
  rankChange: number;
  hasGoogle?: boolean;
  isTelegramMember?: boolean;
}

export interface EcosystemLeaderboardResponse {
  data: EcosystemLeaderboardEntry[];
  meta: {
    weekId: string;
    weekStart: number;
    limit: number;
    offset: number;
    total: number;
    prevTotal: number;
    cappedAt: number;
    updatedAt: number;
  };
}

export interface AvailableEcosystemWeek {
  weekId: string;
  label: string;
}

export async function getEcosystemScore(
  identityId: string,
): Promise<EcosystemScoreData | null> {
  if (!API_BASE) return null;
  if (!IDENTITY_ID_RE.test(identityId)) return null;

  const encoded = encodeURIComponent(identityId);
  // cache: 'no-store' bypasses the browser HTTP cache. The endpoint ships
  // `Cache-Control: public, max-age=30`, which otherwise serves a stale
  // response for 30 s even when react-query explicitly refetches (e.g.
  // right after the user claims their Creators Appreciation bonus). Per-
  // user data shouldn't be browser-cached anyway; react-query's own cache
  // is the single source of truth on the client.
  const res = await fetch(`${API_BASE}/ecosystem/score/${encoded}`, {
    cache: "no-store",
  });

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
  weekId?: string,
  limit: number = 50,
  offset: number = 0,
): Promise<EcosystemLeaderboardResponse> {
  if (!API_BASE) {
    return {
      data: [],
      meta: { weekId: weekId ?? "", weekStart: 0, limit, offset, total: 0, cappedAt: 0, updatedAt: 0 },
    };
  }

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (weekId) params.set("weekId", weekId);

  const res = await fetch(`${API_BASE}/ecosystem/leaderboard?${params}`);
  if (!res.ok) {
    throw new EcosystemScoreError(
      `Ecosystem leaderboard fetch failed: ${res.status}`,
      res.status,
    );
  }

  return res.json();
}

export async function getEcosystemLeaderboardFull(
  weekId?: string,
): Promise<EcosystemLeaderboardResponse> {
  return getEcosystemLeaderboard(weekId, 2000, 0);
}

export async function getAvailableEcosystemWeeks(): Promise<AvailableEcosystemWeek[]> {
  if (!API_BASE) return [];

  const res = await fetch(`${API_BASE}/ecosystem/leaderboard/weeks`);
  if (!res.ok) {
    console.error(`[EcosystemAPI] getAvailableEcosystemWeeks: ${res.status}`);
    return [];
  }

  const json = await res.json();
  return json.weeks ?? [];
}

export const ECOSYSTEM_WEEK_GRACE_PERIOD_MS = 8 * 60 * 60 * 1000;

export function isEcosystemNewWeekGracePeriod(
  meta: EcosystemLeaderboardResponse["meta"] | undefined,
): boolean {
  if (!meta?.weekStart || !meta?.updatedAt) return false;
  return meta.updatedAt - meta.weekStart < ECOSYSTEM_WEEK_GRACE_PERIOD_MS;
}

/**
 * Trigger TODAY-window activity sync on explorer-api.
 * Force-refreshes the scanner's wallet→identity cache and reconciles
 * today's RPC + indexer activity for all of the user's registered wallets.
 * Authenticated (Bearer); identity is derived from the Cognito JWT.
 * Returns null on rate-limit (429) or any non-OK response.
 */
export async function syncEcosystemTodayActivity(
  token: string,
): Promise<{ identityId: string; walletsScanned: number; gapsFilled: number; syncedAt: string } | null> {
  if (!API_BASE || !token) return null;
  const res = await fetch(`${API_BASE}/ecosystem/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) return null;
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
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
  stakingDeltaScaled?: number;
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

// ===== Bonus feed (per-event award stream for the dashboard celebration carousel) =====

// Metadata shape varies by category. The carousel narrows by category before
// reading fields, so a flexible record type keeps the API surface honest about
// what the server actually persists (legacy rows have null metadata).
export interface BonusFeedEntry {
  id: string;
  category: string;
  activityType: string;
  points: number;
  awardedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface BonusFeedResponse {
  data: BonusFeedEntry[];
  cumulativeByCategory: Record<string, number>;
  totalBonusAllTime: number;
}

/**
 * Fetch the user's most recent bonus awards for the celebration carousel.
 *
 * Self-only endpoint: requires a Cognito JWT. Without a token we return an
 * empty result so callers can render their empty-state without spurious 401s.
 */
export async function getBonusFeed(
  identityId: string,
  limit: number = 10,
  token?: string,
): Promise<BonusFeedResponse> {
  const empty: BonusFeedResponse = { data: [], cumulativeByCategory: {}, totalBonusAllTime: 0 };
  if (!API_BASE) return empty;
  if (!IDENTITY_ID_RE.test(identityId)) return empty;
  if (!token) return empty;

  const encoded = encodeURIComponent(identityId);
  const res = await fetch(
    `${API_BASE}/ecosystem/bonus-feed/${encoded}?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return empty;
  const json = await res.json();
  return {
    data: (json.data ?? []) as BonusFeedEntry[],
    cumulativeByCategory: (json.cumulativeByCategory ?? {}) as Record<string, number>,
    totalBonusAllTime: Number(json.totalBonusAllTime ?? 0),
  };
}

export interface BaseHistoryItem {
  category: string;
  points: number;
}

export interface BaseHistoryDay {
  date: string;
  total: number;
  items: BaseHistoryItem[];
}

/**
 * Per-day base composition. Mirrors `ecosystem_daily_scores` matview rules
 * so the items returned for a day sum to that day's `base_score`.
 *
 * Self-only endpoint — caller must pass their Cognito JWT. Without a token
 * we short-circuit to an empty array since the server would 401.
 */
export async function getBaseHistory(
  identityId: string,
  days: number = 30,
  token?: string,
): Promise<BaseHistoryDay[]> {
  if (!API_BASE) return [];
  if (!IDENTITY_ID_RE.test(identityId)) return [];
  if (!token) return [];

  const encoded = encodeURIComponent(identityId);
  const res = await fetch(
    `${API_BASE}/ecosystem/base-history/${encoded}?days=${days}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

export interface ActiveMissionsData {
  /** Flat list of category ids the user has activated, or null if no record exists yet. */
  missions: string[] | null;
  /** ISO timestamp of the last server-side update, or null for no record. */
  updatedAt: string | null;
}

/** Fetch the user's active mission selection from the server. */
export async function getActiveMissions(
  identityId: string,
): Promise<ActiveMissionsData | null> {
  if (!API_BASE) return null;
  if (!IDENTITY_ID_RE.test(identityId)) return null;
  const encoded = encodeURIComponent(identityId);
  const res = await fetch(`${API_BASE}/ecosystem/active-missions/${encoded}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return (json.data as ActiveMissionsData) ?? null;
}

/** Persist the user's active mission selection to the server. Fire-and-forget. */
export async function putActiveMissions(
  identityId: string,
  missions: string[],
): Promise<void> {
  if (!API_BASE) return;
  if (!IDENTITY_ID_RE.test(identityId)) return;
  const encoded = encodeURIComponent(identityId);
  const res = await fetch(`${API_BASE}/ecosystem/active-missions/${encoded}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ missions }),
  });
  if (!res.ok) {
    throw new EcosystemScoreError(
      `putActiveMissions failed: ${res.status}`,
      res.status,
    );
  }
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
