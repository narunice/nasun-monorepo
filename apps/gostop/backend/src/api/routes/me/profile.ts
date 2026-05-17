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
import type { AuthVars } from '../../auth/middleware.js';
import { requireAuth } from '../../auth/middleware.js';

export const meProfileRoutes = new Hono<{ Variables: AuthVars }>();

// Apply auth to every route mounted here. /me/* is exclusively user-scoped.
meProfileRoutes.use('*', requireAuth);

const VISIBILITY_VALUES = ['public', 'anonymous', 'delayed', 'opt-out'] as const;
type Visibility = (typeof VISIBILITY_VALUES)[number];
const VISIBILITY_SET = new Set<string>(VISIBILITY_VALUES);

// Cache keys busted by PATCH /settings so feed-server snapshot and
// leaderboard opt-out filter pick up the new visibility within one cycle
// instead of waiting 30s/60s for natural TTL expiry. Resolves PR2 F2.
const FEED_VISIBILITY_CACHE_KEY = 'feed:visibility-map';
const LEADERBOARD_OPT_OUT_CACHE_KEY = 'leaderboard:opt-out-set';

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

  c.header('Cache-Control', 'no-store');
  return c.json({
    wallet,
    ecosystem_points: eco ? parseFloat(eco.all_time_score) : 0,
    last_snapshot_date: eco?.snapshot_date ?? null,
    nft_health: nftHealth,
    total_rounds: stats ? Number(stats.rounds) : 0,
    total_bet: stats?.total_bet ?? '0',
    total_payout: stats?.total_payout ?? '0',
    net_pnl: stats?.net_pnl ?? '0',
    first_played_ms: firstRows[0]?.first_played_ms ? Number(firstRows[0].first_played_ms) : null,
    last_played_ms: stats?.last_played_ms ? Number(stats.last_played_ms) : null,
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

  // Bust dependent caches so the new visibility takes effect immediately:
  //   - feed-server snapshot (WS mask decisions)
  //   - leaderboard opt-out filter (list inclusion)
  // Without this the user has to wait the longer of the two TTLs (60s) for
  // their setting to be reflected. PR2 F2 follow-up.
  cacheDel(FEED_VISIBILITY_CACHE_KEY);
  cacheDel(LEADERBOARD_OPT_OUT_CACHE_KEY);

  c.header('Cache-Control', 'no-store');
  return c.json({
    feed_visibility: rows[0]!.feed_visibility,
    updated_at: rows[0]!.updated_at,
  });
});
