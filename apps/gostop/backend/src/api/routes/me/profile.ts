/**
 * /me/profile, /me/settings — authenticated user dashboard routes.
 *
 * All endpoints in this file (and routes/me/dashboard.ts) trust ONLY the
 * wallet bound to the JWT (c.var.wallet). They never accept a player address
 * from the URL or query — preventing impersonation by parameter forgery.
 *
 * Caches are per-wallet keyed but transport headers use Cache-Control:
 * no-store (browser must not cache personal data even with a stable ETag).
 */

import { Hono } from 'hono';
import { reader, writer } from '../../../db/client.js';
import { cacheDel } from '../../lib/cache.js';
import { resolveIdentityId } from '../../lib/identity-resolver.js';
import { reduceStreak, type StreakRoundInput } from '../../lib/streak.js';
import { primeVisibilityCache } from '../../lib/visibility-lookup.js';
import type { AuthVars } from '../../auth/middleware.js';
import { requireAuth } from '../../auth/middleware.js';
import { env } from '../../../env.js';

// Process-level mini-cache for explorer-api responses to avoid per-request overhead.
const EXPLORER_TTL = 60_000;

interface LiveScoreEntry { score: number; expiresAt: number }
interface LiveProfileEntry {
  displayName: string | null;
  xHandle: string | null;
  profileImageUrl: string | null;
  expiresAt: number;
}
const liveScoreCache = new Map<string, LiveScoreEntry>();
const liveProfileCache = new Map<string, LiveProfileEntry>();

async function fetchLiveScore(identityId: string): Promise<number | null> {
  const hit = liveScoreCache.get(identityId);
  if (hit && Date.now() < hit.expiresAt) return hit.score;
  if (!env.explorerApiUrl) return null;
  try {
    const res = await fetch(
      `${env.explorerApiUrl}/api/v1/ecosystem/score/${encodeURIComponent(identityId)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { data?: { allTime?: { ecosystemScore?: number } } };
    const score = data?.data?.allTime?.ecosystemScore;
    if (typeof score !== 'number') return null;
    liveScoreCache.set(identityId, { score, expiresAt: Date.now() + EXPLORER_TTL });
    return score;
  } catch {
    return null;
  }
}

async function fetchNasunProfile(
  identityId: string,
): Promise<Omit<LiveProfileEntry, 'expiresAt'> | null> {
  const hit = liveProfileCache.get(identityId);
  if (hit && Date.now() < hit.expiresAt) return hit;
  if (!env.explorerApiUrl) return null;
  try {
    const res = await fetch(
      `${env.explorerApiUrl}/api/v1/ecosystem/profile/${encodeURIComponent(identityId)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      displayName?: string | null;
      xHandle?: string | null;
      profileImageUrl?: string | null;
    };
    const entry: LiveProfileEntry = {
      displayName: data?.displayName ?? null,
      xHandle: data?.xHandle ?? null,
      profileImageUrl: data?.profileImageUrl ?? null,
      expiresAt: Date.now() + EXPLORER_TTL,
    };
    liveProfileCache.set(identityId, entry);
    return entry;
  } catch {
    return null;
  }
}

export const meProfileRoutes = new Hono<{ Variables: AuthVars }>();

// Apply auth to every route mounted here. /me/* is exclusively user-scoped.
meProfileRoutes.use('*', requireAuth);

const VISIBILITY_VALUES = ['public', 'anonymous', 'delayed', 'opt-out'] as const;
type Visibility = (typeof VISIBILITY_VALUES)[number];
const VISIBILITY_SET = new Set<string>(VISIBILITY_VALUES);

// Leaderboard response cache prefix busted by PATCH /settings so cached
// (period,game,metric,limit) payloads pick up the new visibility within one
// cycle instead of waiting 10 s for natural TTL expiry. The visibility-map
// snapshot itself is invalidated and re-primed by `primeVisibilityCache`
// (see PATCH handler).
const LEADERBOARD_CACHE_PREFIX = 'leaderboard:';

// ----- GET /me/profile ------------------------------------------------------

type StatsRow = {
  rounds: string;
  total_bet: string;
  total_payout: string;
  net_pnl: string;
  last_played_ms: string | null;
};
type FirstPlayedRow = { first_played_ms: string | null };
type EcosystemRow = { all_time_score: string; snapshot_date: string };
type HealthRow = { nft_type: string; health_pct: string };

meProfileRoutes.get('/profile', async (c) => {
  const wallet = c.get('wallet').toLowerCase();
  const sql = reader();

  // Lifetime aggregates from matview (fast: idx_ps_player). May be absent
  // until the next REFRESH for brand-new players — fall back to zeros.
  const statsRows = await sql<StatsRow[]>`
    SELECT rounds::text, total_bet::text, total_payout::text,
           net_pnl::text, last_played_ms::text
    FROM gostop.player_stats
    WHERE player = ${wallet}
  `;
  const stats = statsRows[0];

  // first_played_ms is not in player_stats. Use idx_gr_player_ts backward
  // scan via ASC + LIMIT 1 (cheaper than MIN() across all rows).
  const firstRows = await sql<FirstPlayedRow[]>`
    SELECT timestamp_ms::text AS first_played_ms
    FROM gostop.game_round
    WHERE player = ${wallet} AND status = 'final'
    ORDER BY timestamp_ms ASC
    LIMIT 1
  `;

  // Cross-schema lookups need identity_id. Resolve once (cached) and short-
  // circuit if the wallet has never earned a point — zero snapshot / health
  // is the correct response for an unregistered or brand-new player.
  const identityId = await resolveIdentityId(sql, wallet);

  let eco: EcosystemRow | undefined;
  let healthRows: HealthRow[] = [];
  if (identityId) {
    const ecoRows = await sql<EcosystemRow[]>`
      SELECT all_time_score::text, snapshot_date::text
      FROM public.ecosystem_score_snapshots
      WHERE identity_id = ${identityId}
      ORDER BY snapshot_date DESC
      LIMIT 1
    `;
    eco = ecoRows[0];

    healthRows = await sql<HealthRow[]>`
      SELECT DISTINCT ON (nft_type) nft_type, health_pct::text
      FROM public.nft_health_state
      WHERE identity_id = ${identityId}
      ORDER BY nft_type, last_evaluated_day DESC
    `;
  }
  const nftHealth = healthRows.length === 0
    ? null
    : healthRows.reduce<{ alliance: number | null; genesis_pass: number | null }>(
        (acc, r) => {
          const pct = parseFloat(r.health_pct);
          if (r.nft_type === 'alliance') acc.alliance = pct;
          else if (r.nft_type === 'genesis-pass') acc.genesis_pass = pct;
          return acc;
        },
        { alliance: null, genesis_pass: null },
      );

  // Fetch live data from explorer-api in parallel (fall back gracefully on failure).
  const [liveScore, nasunProfile] = identityId
    ? await Promise.all([fetchLiveScore(identityId), fetchNasunProfile(identityId)])
    : [null, null];

  const snapshotScore = eco ? parseFloat(eco.all_time_score) : 0;

  c.header('Cache-Control', 'no-store');
  return c.json({
    wallet,
    ecosystem_points: liveScore ?? snapshotScore,
    last_snapshot_date: eco?.snapshot_date ?? null,
    nft_health: nftHealth,
    total_rounds: stats ? Number(stats.rounds) : 0,
    total_bet: stats?.total_bet ?? '0',
    total_payout: stats?.total_payout ?? '0',
    net_pnl: stats?.net_pnl ?? '0',
    first_played_ms: firstRows[0]?.first_played_ms ? Number(firstRows[0].first_played_ms) : null,
    last_played_ms: stats?.last_played_ms ? Number(stats.last_played_ms) : null,
    display_name: nasunProfile?.displayName ?? null,
    x_handle: nasunProfile?.xHandle ?? null,
    profile_image_url: nasunProfile?.profileImageUrl ?? null,
    generated_at: Date.now(),
  });
});

// ----- GET /me/streak -------------------------------------------------------

// Mirrors the public /streak/:player handler but trusts c.var.wallet (JWT) so
// the caller's own streak is always available regardless of feed_visibility
// (anonymous/opt-out players still see their own progress). No path param
// avoids impersonation; auth middleware on the meProfileRoutes group covers
// authn. Visibility lookup is intentionally skipped.

type StreakSqlRow = { payout: string; bet_amount: string; timestamp_ms: string };
const STREAK_ROUND_LOOKBACK = 200;

meProfileRoutes.get('/streak', async (c) => {
  const wallet = c.get('wallet').toLowerCase();
  const sql = reader();
  const rows = await sql<StreakSqlRow[]>`
    SELECT payout::text, bet_amount::text, timestamp_ms::text
    FROM gostop.game_round
    WHERE player = ${wallet} AND status = 'final'
    ORDER BY timestamp_ms DESC
    LIMIT ${STREAK_ROUND_LOOKBACK}
  `;
  const inputs: StreakRoundInput[] = rows.map((r) => ({
    payout: BigInt(r.payout),
    bet_amount: BigInt(r.bet_amount),
    timestamp_ms: Number(r.timestamp_ms),
  }));
  const streak = reduceStreak(inputs);
  c.header('Cache-Control', 'no-store');
  return c.json({
    player: wallet,
    kind: streak.kind,
    length: streak.length,
    started_ts_ms: streak.started_ts_ms,
    generated_at: Date.now(),
  });
});

// ----- GET /me/settings -----------------------------------------------------

type SettingsRow = { feed_visibility: Visibility; updated_at: string };

meProfileRoutes.get('/settings', async (c) => {
  const wallet = c.get('wallet').toLowerCase();
  const sql = reader();
  const rows = await sql<SettingsRow[]>`
    SELECT feed_visibility, updated_at::text
    FROM gostop.user_settings
    WHERE player = ${wallet}
  `;
  c.header('Cache-Control', 'no-store');
  return c.json({
    feed_visibility: rows[0]?.feed_visibility ?? 'public',
    updated_at: rows[0]?.updated_at ?? null,
  });
});

// ----- PATCH /me/settings ---------------------------------------------------

meProfileRoutes.patch('/settings', async (c) => {
  const wallet = c.get('wallet').toLowerCase();

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', reason: 'invalid_json' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'bad_request', reason: 'invalid_body' }, 400);
  }

  const patch = body as Record<string, unknown>;
  const visibility = patch.feed_visibility;
  if (visibility === undefined) {
    return c.json({ error: 'bad_request', reason: 'no_fields' }, 400);
  }
  if (typeof visibility !== 'string' || !VISIBILITY_SET.has(visibility)) {
    return c.json({ error: 'bad_request', reason: 'invalid_feed_visibility' }, 400);
  }

  const sql = writer();
  const rows = await sql<SettingsRow[]>`
    INSERT INTO gostop.user_settings (player, feed_visibility)
    VALUES (${wallet}, ${visibility as Visibility})
    ON CONFLICT (player) DO UPDATE
      SET feed_visibility = EXCLUDED.feed_visibility,
          updated_at = now()
    RETURNING feed_visibility, updated_at::text
  `;

  // Refresh dependent caches so the new visibility takes effect immediately:
  //   - visibility snapshot used by feed-server + leaderboard mask decisions
  //     (primeVisibilityCache invalidates AND reloads from writer() so the
  //     refilled cache is coherent with this PATCH even when a reader replica
  //     is lagging — see visibility-lookup.ts file header)
  //   - every cached leaderboard response that may now contain a stale
  //     anon_id or an excluded-but-no-longer-delayed player
  // Without this a public→anonymous toggle would leak the raw address for up
  // to CACHE_TTL_SECONDS (10 s) via stale leaderboard payloads.
  await primeVisibilityCache();
  cacheDel(LEADERBOARD_CACHE_PREFIX);

  c.header('Cache-Control', 'no-store');
  return c.json({
    feed_visibility: rows[0]!.feed_visibility,
    updated_at: rows[0]!.updated_at,
  });
});
