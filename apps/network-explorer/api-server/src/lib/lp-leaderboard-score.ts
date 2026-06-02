/**
 * GoStop bankroll LP participation -> ecosystem leaderboard score.
 *
 * Single source of truth for the net-LP-per-identity computation so the formula never
 * drifts across the live leaderboard route (routes/ecosystem.ts, 4 query sites) and the
 * weekly settlement script (scripts/settle-ecosystem.ts). See
 * apps/nasun-website/doc/ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md.
 *
 * Terminology: this is an intermediate "score" (lp_score) folded into weekly_score, not a
 * final Nasun point payout.
 */

import type postgres from 'postgres';
import { safeFloat } from '../config/ecosystem.js';

// Coefficient on LOG2(net_usd + 1). Balance-patchable like volume's 1.6 / staking's 0.07.
export const LP_LEADERBOARD_COEFF = Math.max(0, safeFloat(process.env.LP_LEADERBOARD_COEFF, 1.0));

// Hard cap on lp_score so a single whale LP cannot dominate ranking. 2^14 ~= $16K net
// deposit saturates the term; a $2.5M LP is capped at the same 14 as a $16K LP.
export const LP_LEADERBOARD_MAX = Math.min(
  30,
  Math.max(0, safeFloat(process.env.LP_LEADERBOARD_MAX, 14)),
);

// LP contributes only to weeks whose Monday start (UTC) is >= this epoch ms. Default is
// 2026-W23 (2026-06-01T00:00:00Z). Past weeks recompute with includeLp=false -> lp_score 0,
// so historical leaderboards stay immutable while the current week onward gains LP.
export const LP_LEADERBOARD_START_MS = (() => {
  const v = safeFloat(process.env.LP_LEADERBOARD_START_MS, Date.UTC(2026, 5, 1));
  return Number.isFinite(v) && v > 0 ? v : Date.UTC(2026, 5, 1);
})();

// Log resolved config at import so a bad env (e.g. COEFF=0 silently disabling LP, or a
// non-Monday START_MS shifting the cutoff week) is visible at startup. This repo has a
// recurring env-rotation incident class; an explicit one-liner makes misconfig diagnosable.
console.log(
  `[lp-leaderboard-score] coeff=${LP_LEADERBOARD_COEFF} max=${LP_LEADERBOARD_MAX} ` +
    `startMs=${LP_LEADERBOARD_START_MS} (${new Date(LP_LEADERBOARD_START_MS).toISOString()})`,
);

type Sql = ReturnType<typeof postgres>;

// Daily ramp: LP contributes 1/7 of its capped score per elapsed day of the week, so it is
// not granted in a single Monday spike. Mon=1/7, Tue=2/7, ... Sun=7/7 (full). A completed week
// (nowMs >= weekEnd, so elapsedDays >= 7) and any past-week re-query / settlement always yield
// 1.0, so settled values and past-week immutability are unaffected — only the in-progress week
// ramps. Single source of truth so the 4 route sites + settlement compute the factor identically.
export function lpDailyRampFactor(weekStartMs: number, nowMs: number): number {
  const elapsedDays = Math.floor((nowMs - weekStartMs) / 86_400_000);
  return Math.max(0, Math.min(elapsedDays + 1, 7)) / 7;
}

/**
 * Returns a `lp_score(identity_id, lp_score)` CTE fragment to splice into the leaderboard
 * WITH clause of the calling `sql` instance. The surrounding SELECT must FULL OUTER JOIN
 * `lp_score lp` and add `COALESCE(lp.lp_score, 0)` to weekly_score (and `lp.identity_id` to
 * the identity COALESCE chains so LP-only identities are not dropped).
 *
 * When `includeLp` is false (pre-cutoff / past weeks) the CTE is an empty typed shell so the
 * surrounding query structure is identical and lp_score COALESCEs to 0 for every row.
 *
 * net_usd = SUM(liquidity_provided.amount - liquidity_redeemed.amount) / 1e6 (NUSDC, 6dp),
 * counted up to weekEndMs so the value is reproducible for past-week settlement re-runs.
 * actor->identity resolution uses idx_ap_wallet_latest_identity
 * (wallet_address, tx_timestamp DESC) INCLUDE (identity_id); the LATERAL runs only over the
 * small aggregated actor set, never a full-table DISTINCT ON (see lp-position-sync.ts).
 */
export function lpScoreCte(sql: Sql, weekEndMs: number, includeLp: boolean, dailyFactor: number) {
  if (!includeLp) {
    return sql`lp_score AS (
      SELECT NULL::text AS identity_id, 0::float8 AS lp_score WHERE false
    )`;
  }
  return sql`lp_score AS (
    SELECT m.identity_id,
           (LEAST(
             ${LP_LEADERBOARD_COEFF}::float8 * LOG(2, SUM(a.net_usd) + 1)::float8,
             ${LP_LEADERBOARD_MAX}::float8
           ) * ${dailyFactor}::float8)::float8 AS lp_score
    FROM (
      SELECT lower(actor) AS actor,
             SUM(CASE WHEN event_type = 'liquidity_provided' THEN amount
                      WHEN event_type = 'liquidity_redeemed' THEN -amount
                      ELSE 0 END) / 1000000.0 AS net_usd
      FROM gostop.bankroll_event
      WHERE event_type IN ('liquidity_provided', 'liquidity_redeemed')
        AND actor IS NOT NULL
        AND timestamp_ms < ${weekEndMs}::bigint
      GROUP BY lower(actor)
      HAVING SUM(CASE WHEN event_type = 'liquidity_provided' THEN amount
                      WHEN event_type = 'liquidity_redeemed' THEN -amount
                      ELSE 0 END) > 0
    ) a
    JOIN LATERAL (
      SELECT identity_id
      FROM activity_points ap
      WHERE ap.wallet_address = a.actor
        AND ap.identity_id IS NOT NULL
      ORDER BY ap.tx_timestamp DESC
      LIMIT 1
    ) m ON true
    GROUP BY m.identity_id
  )`;
}
