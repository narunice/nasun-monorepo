/**
 * Materialized view refresh scheduler.
 *
 * Two matviews back the leaderboard / transparency endpoints:
 *   - gostop.player_stats: per-player lifetime aggregates
 *   - gostop.game_daily:   per-game-per-day RTP + volume
 *
 * Refresh cadence (env-tunable, conservative defaults):
 *   - Inside the off-peak window (UTC 03:00–04:00 by default): every tick
 *     until both have been refreshed once that day. This catches up after
 *     downtime cheaply.
 *   - Outside the off-peak window: every MATVIEW_REFRESH_INTERVAL_MIN minutes,
 *     starting after the indexer has been running long enough for the first
 *     interval to elapse. Keeps the dashboards approximately fresh during
 *     traffic peaks without colliding with explorer's settle-pado /
 *     settle-ecosystem cron jobs (00:00–00:30 UTC).
 *
 * Uses REFRESH MATERIALIZED VIEW CONCURRENTLY so readers see a consistent old
 * snapshot during the refresh. The UNIQUE indexes on both matviews satisfy the
 * CONCURRENTLY precondition.
 *
 * Advisory lock guards against duplicate refresh attempts in case two indexer
 * processes briefly overlap (deploy bounce). The lock is *try*-acquired so
 * lock contention does not block the tick.
 */

import { env } from '../env.js';
import { writer } from '../db/client.js';

const LOCK_KEY_PLAYER_STATS = 91_001;
const LOCK_KEY_GAME_DAILY   = 91_002;

interface RefreshState {
  lastRefreshMs: number;
}

// Initialize to boot time so the first refresh fires after MATVIEW_REFRESH_
// INTERVAL_MIN rather than on the very first tick. Avoids restart-storm of
// REFRESH CONCURRENTLY when a crash-loop happens.
const bootMs = Date.now();
const state: Record<string, RefreshState> = {
  player_stats: { lastRefreshMs: bootMs },
  game_daily:   { lastRefreshMs: bootMs },
};

function isOffPeak(now: Date): boolean {
  const h = now.getUTCHours();
  return h >= env.matview.offPeakStartHour && h < env.matview.offPeakEndHour;
}

async function refresh(name: 'player_stats' | 'game_daily', lockKey: number): Promise<boolean> {
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
      if (name === 'player_stats') {
        await conn`REFRESH MATERIALIZED VIEW CONCURRENTLY gostop.player_stats`;
      } else {
        await conn`REFRESH MATERIALIZED VIEW CONCURRENTLY gostop.game_daily`;
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
 * Call from the indexer tick. Decides whether to refresh either matview based
 * on the cadence policy. Returns true if a refresh ran (for log breadcrumbs).
 */
export async function maybeRefreshMatviews(): Promise<boolean> {
  const now = new Date();
  const intervalMs = env.matview.intervalMin * 60_000;
  const off = isOffPeak(now);

  let ran = false;
  for (const [name, key] of [
    ['player_stats', LOCK_KEY_PLAYER_STATS],
    ['game_daily',   LOCK_KEY_GAME_DAILY],
  ] as const) {
    const sinceMs = now.getTime() - state[name].lastRefreshMs;
    const due = off
      ? sinceMs >= 10 * 60_000     // off-peak: tighter 10m floor to refill any gap
      : sinceMs >= intervalMs;     // normal: env-controlled cadence

    if (due) {
      try {
        const did = await refresh(name as 'player_stats' | 'game_daily', key);
        ran = ran || did;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[matview] ${name} refresh failed: ${msg}`);
      }
    }
  }
  return ran;
}
