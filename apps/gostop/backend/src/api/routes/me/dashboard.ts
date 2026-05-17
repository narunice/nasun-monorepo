/**
 * /me/recent-rounds, /me/stats, /me/ecosystem — authenticated user dashboard.
 *
 * Same auth/no-store discipline as routes/me/profile.ts. Wallet always taken
 * from JWT (c.var.wallet), never from URL/query.
 */

import { Hono } from 'hono';
import { reader } from '../../../db/client.js';
import { resolveIdentityId } from '../../lib/identity-resolver.js';
import { GAME_BY_ID } from '../../../config/contracts.js';
import type { AuthVars } from '../../auth/middleware.js';
import { requireAuth } from '../../auth/middleware.js';

export const meDashboardRoutes = new Hono<{ Variables: AuthVars }>();
meDashboardRoutes.use('*', requireAuth);

// ----- GET /me/recent-rounds?limit=N ---------------------------------------

const RECENT_DEFAULT_LIMIT = 20;
const RECENT_MAX_LIMIT = 100;

type RecentRoundRow = {
  game_id: number;
  session_id: Buffer;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  timestamp_ms: string;
  status: string;
  tx_digest: string;
};

meDashboardRoutes.get('/recent-rounds', async (c) => {
  const wallet = c.get('wallet').toLowerCase();

  const limitRaw = c.req.query('limit');
  let limit = RECENT_DEFAULT_LIMIT;
  if (limitRaw !== undefined) {
    const n = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(n) || n < 1) {
      return c.json({ error: 'bad_request', reason: 'invalid_limit' }, 400);
    }
    limit = Math.min(n, RECENT_MAX_LIMIT);
  }

  const sql = reader();
  const rows = await sql<RecentRoundRow[]>`
    SELECT game_id, session_id, bet_amount::text, payout::text,
           multiplier_bps::text, timestamp_ms::text, status, tx_digest
    FROM gostop.game_round
    WHERE player = ${wallet}
    ORDER BY timestamp_ms DESC
    LIMIT ${limit}
  `;

  c.header('Cache-Control', 'no-store');
  return c.json({
    limit,
    rounds: rows.map((r) => ({
      game_id: r.game_id,
      key: GAME_BY_ID[r.game_id] ?? null,
      session_id_hex: '0x' + r.session_id.toString('hex'),
      bet_amount: r.bet_amount,
      payout: r.payout,
      multiplier_bps: r.multiplier_bps,
      timestamp_ms: Number(r.timestamp_ms),
      status: r.status,
      tx_digest: r.tx_digest,
    })),
    generated_at: Date.now(),
  });
});

// ----- GET /me/stats?period=24h|7d|30d|all ---------------------------------

const PERIOD_WINDOW_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

type StatsAggRow = {
  rounds: string;
  total_bet: string;
  total_payout: string;
  net_pnl: string;
  win_rate_bps: string;
  biggest_win: string;
};
type ByGameRow = {
  game_id: number;
  rounds: string;
  net_pnl: string;
};

meDashboardRoutes.get('/stats', async (c) => {
  const wallet = c.get('wallet').toLowerCase();
  const period = c.req.query('period') ?? 'all';
  if (period !== 'all' && !(period in PERIOD_WINDOW_MS)) {
    return c.json({ error: 'bad_request', reason: 'invalid_period' }, 400);
  }

  const sql = reader();

  // Bound the same WHERE clause across all aggregates so by_game and totals
  // stay consistent. `all` skips the timestamp filter entirely (covered by
  // player_stats matview semantics — see player_stats: status='final').
  const sinceMs = period === 'all' ? 0 : Date.now() - PERIOD_WINDOW_MS[period]!;

  const aggRows = await sql<StatsAggRow[]>`
    SELECT
      COUNT(*)::text                                                                AS rounds,
      COALESCE(SUM(bet_amount), 0)::text                                            AS total_bet,
      COALESCE(SUM(payout), 0)::text                                                AS total_payout,
      COALESCE(SUM(payout) - SUM(bet_amount), 0)::text                              AS net_pnl,
      (COUNT(*) FILTER (WHERE payout > bet_amount) * 10000
        / NULLIF(COUNT(*), 0))::text                                                AS win_rate_bps,
      COALESCE(MAX(payout - bet_amount) FILTER (WHERE payout > bet_amount), 0)::text AS biggest_win
    FROM gostop.game_round
    WHERE player = ${wallet}
      AND status = 'final'
      AND timestamp_ms >= ${sinceMs}
  `;
  const agg = aggRows[0]!;

  const byGameRows = await sql<ByGameRow[]>`
    SELECT game_id,
           COUNT(*)::text                                          AS rounds,
           COALESCE(SUM(payout) - SUM(bet_amount), 0)::text        AS net_pnl
    FROM gostop.game_round
    WHERE player = ${wallet}
      AND status = 'final'
      AND timestamp_ms >= ${sinceMs}
    GROUP BY game_id
    ORDER BY game_id
  `;

  c.header('Cache-Control', 'no-store');
  return c.json({
    period,
    rounds: Number(agg.rounds),
    total_bet: agg.total_bet,
    total_payout: agg.total_payout,
    net_pnl: agg.net_pnl,
    win_rate_bps: agg.win_rate_bps === null ? 0 : Number(agg.win_rate_bps),
    biggest_win: agg.biggest_win,
    by_game: byGameRows.map((r) => ({
      game_id: r.game_id,
      key: GAME_BY_ID[r.game_id] ?? null,
      rounds: Number(r.rounds),
      net_pnl: r.net_pnl,
    })),
    generated_at: Date.now(),
  });
});

// ----- GET /me/ecosystem ----------------------------------------------------

const ECOSYSTEM_HISTORY_LIMIT = 30;

type SnapshotHistRow = {
  snapshot_date: string;
  all_time_score: string;
  base_score: string;
  multiplier_v2: string | null;
  alliance_health: string | null;
  gp_health: string | null;
};
type MissionsRow = { missions: unknown };
type HealthRow = { nft_type: string; health_pct: string };

meDashboardRoutes.get('/ecosystem', async (c) => {
  const wallet = c.get('wallet').toLowerCase();
  const sql = reader();
  const identityId = await resolveIdentityId(sql, wallet);

  // Unregistered wallet — return a coherent empty payload rather than 404 so
  // the dashboard UI can still render an "earn your first point" state.
  if (!identityId) {
    c.header('Cache-Control', 'no-store');
    return c.json({
      wallet,
      identity_id: null,
      ecosystem_points: 0,
      last_snapshot_date: null,
      nft_health: null,
      active_missions: [],
      score_history: [],
      generated_at: Date.now(),
    });
  }

  const [historyRows, missionsRows, healthRows] = await Promise.all([
    sql<SnapshotHistRow[]>`
      SELECT snapshot_date::text, all_time_score::text, base_score::text,
             multiplier_v2::text, alliance_health::text, gp_health::text
      FROM public.ecosystem_score_snapshots
      WHERE identity_id = ${identityId}
      ORDER BY snapshot_date DESC
      LIMIT ${ECOSYSTEM_HISTORY_LIMIT}
    `,
    sql<MissionsRow[]>`
      SELECT
        CASE
          WHEN jsonb_typeof(missions) = 'array'  THEN missions
          WHEN jsonb_typeof(missions) = 'string' THEN (missions #>> '{}')::jsonb
          ELSE '[]'::jsonb
        END AS missions
      FROM public.user_active_missions
      WHERE identity_id = ${identityId}
    `,
    sql<HealthRow[]>`
      SELECT DISTINCT ON (nft_type) nft_type, health_pct::text
      FROM public.nft_health_state
      WHERE identity_id = ${identityId}
      ORDER BY nft_type, last_evaluated_day DESC
    `,
  ]);

  const latest = historyRows[0];
  const missionsRaw = missionsRows[0]?.missions;
  const activeMissions = Array.isArray(missionsRaw)
    ? (missionsRaw as unknown[]).filter((m): m is string => typeof m === 'string')
    : [];

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
    identity_id: identityId,
    ecosystem_points: latest ? parseFloat(latest.all_time_score) : 0,
    last_snapshot_date: latest?.snapshot_date ?? null,
    nft_health: nftHealth,
    active_missions: activeMissions,
    score_history: historyRows.map((r) => ({
      snapshot_date: r.snapshot_date,
      all_time_score: parseFloat(r.all_time_score),
      base_score: parseFloat(r.base_score),
      multiplier_v2: r.multiplier_v2 === null ? null : parseFloat(r.multiplier_v2),
      alliance_health: r.alliance_health === null ? null : parseFloat(r.alliance_health),
      gp_health: r.gp_health === null ? null : parseFloat(r.gp_health),
    })),
    generated_at: Date.now(),
  });
});
