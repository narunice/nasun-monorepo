/**
 * Materialized view refresh scheduler.
 *
 * Three matviews back the leaderboard / transparency / risk dashboard endpoints:
 *   - gostop.player_stats:        per-player lifetime aggregates
 *   - gostop.game_daily:          per-game-per-day RTP + volume
 *   - gostop.bankroll_daily_pnl:  per-day bankroll net PnL (Risk Dashboard, Tier 1.3)
 *
 * Refresh cadence (env-tunable, conservative defaults):
 *   - Inside the off-peak window (UTC 03:00–04:00 by default): every tick
 *     until all have been refreshed once that day. This catches up after
 *     downtime cheaply.
 *   - Outside the off-peak window: every MATVIEW_REFRESH_INTERVAL_MIN minutes,
 *     starting after the indexer has been running long enough for the first
 *     interval to elapse. Keeps the dashboards approximately fresh during
 *     traffic peaks without colliding with explorer's settle-pado /
 *     settle-ecosystem cron jobs (00:00–00:30 UTC).
 *
 * Uses REFRESH MATERIALIZED VIEW CONCURRENTLY so readers see a consistent old
 * snapshot during the refresh. The UNIQUE indexes on each matview satisfy the
 * CONCURRENTLY precondition.
 *
 * Advisory lock guards against duplicate refresh attempts in case two indexer
 * processes briefly overlap (deploy bounce). The lock is *try*-acquired so
 * lock contention does not block the tick.
 *
 * W5 reservation: keys 91_003-91_009 reserved for Risk Dashboard matviews.
 * 91_003 is bankroll_daily_pnl; 91_004-91_009 remain available for future
 * Tier 1.3+ matviews.
 */

import { env } from '../env.js';
import { writer } from '../db/client.js';

const LOCK_KEY_PLAYER_STATS       = 91_001;
const LOCK_KEY_GAME_DAILY         = 91_002;
const LOCK_KEY_BANKROLL_DAILY_PNL = 91_003;

type MatviewName = 'player_stats' | 'game_daily' | 'bankroll_daily_pnl';

interface RefreshState {
  lastRefreshMs: number;
}

// Initialize to boot time so the first refresh fires after MATVIEW_REFRESH_
// INTERVAL_MIN rather than on the very first tick. Avoids restart-storm of
// REFRESH CONCURRENTLY when a crash-loop happens.
const bootMs = Date.now();
const state: Record<MatviewName, RefreshState> = {
  player_stats:       { lastRefreshMs: bootMs },
  game_daily:         { lastRefreshMs: bootMs },
  bankroll_daily_pnl: { lastRefreshMs: bootMs },
};

function isOffPeak(now: Date): boolean {
  const h = now.getUTCHours();
  return h >= env.matview.offPeakStartHour && h < env.matview.offPeakEndHour;
}

async function refresh(name: MatviewName, lockKey: number): Promise<boolean> {
  const sql = writer();
  // Advisory lock is session-scoped, so it MUST be acquired and released on
  // the same physical connection — otherwise the lock survives on an orphan
  // session in the pool and concurrent CONCURRENTLY refreshes race. Pin a
  // single connection via sql.reserve() and run the full triad on it.
  const conn = await sql.reserve();
  try {
    const got = await conn<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${lockKey}) AS ok`;
    if (!got[0]?.ok) return false;
    try {
      const start = Date.now();
      // Switch on matview name to issue the exact REFRESH statement. SQL identifiers
      // cannot be parameterized, so each branch hard-codes the FQ name.
      switch (name) {
        case 'player_stats':
          await conn`REFRESH MATERIALIZED VIEW CONCURRENTLY gostop.player_stats`;
          break;
        case 'game_daily':
          await conn`REFRESH MATERIALIZED VIEW CONCURRENTLY gostop.game_daily`;
          break;
        case 'bankroll_daily_pnl':
          await conn`REFRESH MATERIALIZED VIEW CONCURRENTLY gostop.bankroll_daily_pnl`;
          break;
      }
      state[name].lastRefreshMs = Date.now();
      const took = Date.now() - start;
      console.log(`[matview] refreshed ${name} in ${took}ms`);
      return true;
    } finally {
      await conn`SELECT pg_advisory_unlock(${lockKey})`;
    }
  } finally {
    conn.release();
  }
}

/**
 * Call from the indexer tick. Decides whether to refresh any matview based
 * on the cadence policy. Returns true if a refresh ran (for log breadcrumbs).
 */
export async function maybeRefreshMatviews(): Promise<boolean> {
  const now = new Date();
  const intervalMs = env.matview.intervalMin * 60_000;
  const off = isOffPeak(now);

  let ran = false;
  const matviews: Array<[MatviewName, number]> = [
    ['player_stats',       LOCK_KEY_PLAYER_STATS],
    ['game_daily',         LOCK_KEY_GAME_DAILY],
    ['bankroll_daily_pnl', LOCK_KEY_BANKROLL_DAILY_PNL],
  ];
  for (const [name, key] of matviews) {
    const sinceMs = now.getTime() - state[name].lastRefreshMs;
    const due = off
      ? sinceMs >= 10 * 60_000     // off-peak: tighter 10m floor to refill any gap
      : sinceMs >= intervalMs;     // normal: env-controlled cadence

    if (due) {
      try {
        const did = await refresh(name, key);
        ran = ran || did;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[matview] ${name} refresh failed: ${msg}`);
      }
    }
  }
  return ran;
}
