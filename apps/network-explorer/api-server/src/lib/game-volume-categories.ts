/**
 * GoStop game + wallet-transfer categories that feed the ecosystem weekly
 * volume_count term (weekly_score += 1.6 * LOG2(volume_count + 1)).
 *
 * Single source of truth so the list never drifts across the live leaderboard
 * route (routes/ecosystem.ts, 4 query sites) and the weekly settlement script
 * (scripts/settle-ecosystem.ts). The drift this prevents is exactly how
 * gostop-wheel was omitted: it is a mapped game (config/points.ts) recorded in
 * activity_points and already counted in base_score, but was missing from these
 * five duplicated volume_count IN-lists, so wheel plays earned 0 volume score.
 */

import type postgres from 'postgres';
import { safeFloat } from '../config/ecosystem.js';

type Sql = ReturnType<typeof postgres>;

// gostop-wheel joins volume_count only for weeks whose Monday start (UTC) is
// >= this epoch ms. Default is 2026-W24 (2026-06-08T00:00:00Z). Past weeks (and
// the in-progress week before the cutoff) recompute without wheel, so historical
// leaderboards stay immutable — mirrors LP_LEADERBOARD_START_MS in
// lib/lp-leaderboard-score.ts.
export const WHEEL_VOLUME_START_MS = (() => {
  const v = safeFloat(process.env.WHEEL_VOLUME_START_MS, Date.UTC(2026, 5, 8));
  return Number.isFinite(v) && v > 0 ? v : Date.UTC(2026, 5, 8);
})();

// Log resolved cutoff at import so a bad env (e.g. a non-Monday value shifting
// the gate week) is diagnosable at startup; this repo has a recurring
// env-rotation incident class.
console.log(
  `[game-volume-categories] wheelStartMs=${WHEEL_VOLUME_START_MS} ` +
    `(${new Date(WHEEL_VOLUME_START_MS).toISOString()})`,
);

export function includeWheelVolume(weekStartMs: number): boolean {
  return weekStartMs >= WHEEL_VOLUME_START_MS;
}

/**
 * Returns the category IN-list fragment for the weekly volume_score CTE, to
 * splice into `WHERE category IN (${gameVolumeCategoriesSql(sql, weekStartMs)})`.
 * Keeps the list as SQL literals (not a parameterized array) so the query plan
 * is identical to the previous hand-written IN-list. gostop-wheel is appended
 * only when the week is at or past WHEEL_VOLUME_START_MS.
 *
 * Must be built from the same `sql` instance as the surrounding query for
 * postgres-js fragment composition.
 */
export function gameVolumeCategoriesSql(sql: Sql, weekStartMs: number) {
  const base = sql`'gostop-lottery', 'gostop-numbermatch', 'gostop-mines', 'gostop-crash', 'gostop-scratchcard', 'wallet-transfer'`;
  return includeWheelVolume(weekStartMs) ? sql`${base}, 'gostop-wheel'` : base;
}
