/**
 * Ecosystem weekly volume term: bot-resistant game BET volume (USD).
 *
 * The legacy term `1.6 * LOG2(volume_count + 1)` counted activity_points ROWS
 * (deduped to 1 per category/day, max ~42), which produced large score ties
 * (e.g. 197 identities at weeklyScore 31.4). It also rewarded free, bot-farmable
 * self-transfers. This replaces the count with actual GoStop bet volume
 * (gostop.game_round.bet_amount), which a bot cannot farm for free — every point
 * costs the game's house edge. Bet volume is a wide continuous distribution
 * ($1..$19,890/week, median ~$119) that separates the count-based ties.
 *
 * Single source of truth for the four live-leaderboard query sites in
 * routes/ecosystem.ts and the weekly settlement in scripts/settle-ecosystem.ts.
 * Mirrors lib/lp-leaderboard-score.ts (week gate + wallet->identity LATERAL).
 */

import type postgres from 'postgres';
import { safeFloat } from '../config/ecosystem.js';
import { gameVolumeCategoriesSql } from './game-volume-categories.js';

type Sql = ReturnType<typeof postgres>;

// volume_score = LEAST(COEFF * LOG2(weekly_bet_usd + 1), MAX). Calibrated on
// live W23 data (9046 identities) to be WEIGHT-NEUTRAL vs the legacy count term:
// at COEFF=1.0 the new term's mean (6.45) was ~2x the legacy mean (3.11), which
// would over-weight games and amplify the gambling incentive. COEFF=0.5 brings
// the mean back to ~3.3 ≈ legacy, so total score weight is preserved while the
// continuous distribution (632 distinct values vs the legacy 27) still resolves
// the ties. MAX=6 saturates ~$4k so a whale better cannot dominate ranking. The
// tie resolution comes from continuity, not magnitude, so the low COEFF keeps it.
export const GAME_VOLUME_COEFF = Math.max(0, safeFloat(process.env.GAME_VOLUME_COEFF, 0.5));
export const GAME_VOLUME_MAX = Math.min(30, Math.max(0, safeFloat(process.env.GAME_VOLUME_MAX, 6)));

// Bet volume replaces the count term only for weeks whose Monday start (UTC) is
// >= this epoch ms. Default 2026-W24 (2026-06-08T00:00:00Z), aligned with
// game-volume-categories' wheel gate. Past weeks (and the in-progress week before
// the cutoff) recompute with the legacy count term, so historical leaderboards
// stay immutable. Mirrors LP_LEADERBOARD_START_MS.
export const GAME_VOLUME_START_MS = (() => {
  const v = safeFloat(process.env.GAME_VOLUME_START_MS, Date.UTC(2026, 5, 8));
  return Number.isFinite(v) && v > 0 ? v : Date.UTC(2026, 5, 8);
})();

console.log(
  `[ecosystem-volume-score] coeff=${GAME_VOLUME_COEFF} max=${GAME_VOLUME_MAX} ` +
    `startMs=${GAME_VOLUME_START_MS} (${new Date(GAME_VOLUME_START_MS).toISOString()})`,
);

export function includeBetVolume(weekStartMs: number): boolean {
  return weekStartMs >= GAME_VOLUME_START_MS;
}

/**
 * Returns a `volume_score(identity_id, volume_count, volume_score)` CTE fragment
 * to splice into the leaderboard WITH clause. The surrounding query keeps the
 * `volume_score v` alias and reads `COALESCE(v.volume_score, 0)` in weekly_score
 * (and `v.volume_count` for the display column). Must be built from the same
 * `sql` instance as the surrounding query.
 *
 * Bet variant (week >= cutoff): SUM(bet_amount)/1e6 per wallet (status='final',
 * in-window), wallet->identity via the latest activity_points row
 * (idx_ap_wallet_latest_identity), summed per identity, scored LEAST(COEFF*LOG2,
 * MAX). Banned identities are filtered by the surrounding NOT EXISTS(banned_users).
 *
 * Count variant (earlier weeks): reproduces the legacy 1.6*LOG2(count+1) exactly
 * so past-week recomputes are byte-identical.
 */
export function ecosystemVolumeScoreCte(sql: Sql, bounds: { start: Date; end: Date }) {
  const weekStartMs = bounds.start.getTime();
  const weekEndMs = bounds.end.getTime();

  if (!includeBetVolume(weekStartMs)) {
    return sql`volume_score AS (
      SELECT identity_id,
             COUNT(*)::int AS volume_count,
             (1.6 * LOG(2, COUNT(*) + 1))::float8 AS volume_score
      FROM activity_points
      WHERE category IN (${gameVolumeCategoriesSql(sql, weekStartMs)})
        AND NOT flagged
        AND identity_id IS NOT NULL
        AND tx_timestamp >= ${bounds.start}
        AND tx_timestamp < ${bounds.end}
      GROUP BY identity_id
    )`;
  }

  return sql`volume_score AS (
    SELECT m.identity_id,
           SUM(a.bet_cnt)::int AS volume_count,
           LEAST(
             ${GAME_VOLUME_COEFF}::float8 * LOG(2, SUM(a.bet_usd) + 1)::float8,
             ${GAME_VOLUME_MAX}::float8
           )::float8 AS volume_score
    FROM (
      SELECT lower(player) AS player,
             SUM(bet_amount) / 1000000.0 AS bet_usd,
             COUNT(*) AS bet_cnt
      FROM gostop.game_round
      WHERE status = 'final'
        AND timestamp_ms >= ${weekStartMs}::bigint
        AND timestamp_ms < ${weekEndMs}::bigint
      GROUP BY lower(player)
    ) a
    JOIN LATERAL (
      SELECT identity_id
      FROM activity_points ap
      WHERE ap.wallet_address = a.player
        AND ap.identity_id IS NOT NULL
      ORDER BY ap.tx_timestamp DESC
      LIMIT 1
    ) m ON true
    GROUP BY m.identity_id
  )`;
}
