/**
 * /me/lp/position — authenticated LP self-position.
 *
 * Companion to the public `risk.top_lp_5` block on /api/gostop/transparency.
 * Public payload is always masked (N7 compliance, tier1-chunk2-bankroll-pnl-sot
 * v3 §768); raw self address is only ever exposed through this JWT-gated
 * endpoint. Wallet is read from `c.var.wallet` (JWT-bound), never URL/query.
 *
 *   GET /api/gostop/me/lp/position
 *     -> {
 *       wallet,
 *       net_shares,       // BigInt string, 0 if not an LP
 *       share_pct_bps,    // 0..10_000, vs total positive net shares
 *       rank_in_top_5,    // 1..5 or null
 *     }
 *
 * `deposit_time` / `withdraw_requested_at` from the LPToken object are
 * intentionally omitted in v1 — resolving the per-wallet LPToken objectId
 * requires `getOwnedObjects` filtered by type, an extra chain round-trip the
 * frontend doesn't need yet (the /lp page already does that lookup
 * separately). Defer to Move v0.0.4 §10.B if it becomes useful.
 */

import { Hono } from 'hono';
import { reader } from '../../../db/client.js';
import type { AuthVars } from '../../auth/middleware.js';
import { requireAuth } from '../../auth/middleware.js';

export const meLpRoutes = new Hono<{ Variables: AuthVars }>();
meLpRoutes.use('*', requireAuth);

interface LpAggRow {
  net_shares: string;
  total_shares: string;
}

interface RankRow {
  rank: number;
}

meLpRoutes.get('/lp/position', async (c) => {
  const wallet = c.var.wallet;
  const sql = reader();

  // One round trip: caller's net shares + system total positive net shares.
  // CROSS JOIN keeps the result shape single-row even when caller has zero
  // LP history.
  const rows = await sql<LpAggRow[]>`
    WITH per_actor AS (
      SELECT actor,
             COALESCE(SUM(CASE WHEN event_type='liquidity_provided' THEN shares ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN event_type='liquidity_redeemed' THEN shares ELSE 0 END), 0)
             AS net_shares
      FROM gostop.bankroll_event
      WHERE actor IS NOT NULL
        AND event_type IN ('liquidity_provided','liquidity_redeemed')
      GROUP BY actor
    ),
    me AS (
      SELECT COALESCE((SELECT net_shares FROM per_actor WHERE actor = ${wallet}), 0) AS net_shares
    ),
    total AS (
      SELECT COALESCE(SUM(net_shares), 0) AS total_shares FROM per_actor WHERE net_shares > 0
    )
    SELECT me.net_shares::text     AS net_shares,
           total.total_shares::text AS total_shares
    FROM me CROSS JOIN total
  `;

  const row = rows[0] ?? { net_shares: '0', total_shares: '0' };
  const myShares = BigInt(row.net_shares);
  const totalShares = BigInt(row.total_shares);

  const pctBps = (myShares > 0n && totalShares > 0n)
    ? Number((myShares * 10_000n) / totalShares)
    : 0;

  let rankInTop5: number | null = null;
  if (myShares > 0n) {
    // Rank among positive holders. LIMIT 5 + filter on shares > my shares
    // is cheaper than computing dense_rank over the full set; ties on the
    // exact share count fall back to "tied or just below" which is
    // acceptable for a top-5 self-position display.
    const rankRows = await sql<RankRow[]>`
      WITH per_actor AS (
        SELECT actor,
               COALESCE(SUM(CASE WHEN event_type='liquidity_provided' THEN shares ELSE 0 END), 0)
               - COALESCE(SUM(CASE WHEN event_type='liquidity_redeemed' THEN shares ELSE 0 END), 0)
               AS net_shares
        FROM gostop.bankroll_event
        WHERE actor IS NOT NULL
          AND event_type IN ('liquidity_provided','liquidity_redeemed')
        GROUP BY actor
      )
      SELECT (COUNT(*) + 1)::int AS rank
      FROM per_actor
      WHERE net_shares > ${row.net_shares}::numeric
    `;
    const r = rankRows[0]?.rank ?? 9999;
    rankInTop5 = r <= 5 ? r : null;
  }

  // Authenticated user-scoped resource — never cache at edge.
  c.header('Cache-Control', 'no-store');
  return c.json({
    wallet,
    net_shares: myShares.toString(),
    share_pct_bps: pctBps,
    rank_in_top_5: rankInTop5,
  });
});
