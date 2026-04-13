/**
 * Backfill missing ecosystem snapshot days.
 *
 * Pre-PR-2 of Phase 4 (cumulative ledger). The daily snapshot cron in
 * points-scanner.ts fires once per UTC day; if the scanner is down at the
 * 00:05 UTC window the day is skipped. The cumulative anchor chain
 * (`prev + today's delta`) silently absorbs the gap by re-anchoring two
 * days later, but the missing day's row is never created -- that breaks
 * the chain invariant ("every day = previous total + delta") and leaves
 * the verify-anchor-vs-live.ts cron blind to the gap.
 *
 * Reuses `takeDailySnapshot` from the daily-snapshot module (same code
 * path the cron runs). Processes missing dates in ascending order so
 * each day has the correct prev row to chain from.
 *
 * Lookback is intentionally narrow (3 days). Older "missing" dates are
 * archaeological gaps from before the snapshot system stabilized --
 * backfilling them creates rows whose all_time_* values can't chain
 * back further, which then makes the latest anchor disagree with the
 * snapshot SUM of all dates. This was caught during a 14-day-lookback
 * smoke test that broke 51 users' anchor exact-match by 1 point each.
 *
 * activationsCache is empty when this runs as a CLI -- takeDailySnapshot
 * has lastMultiplierMap fallback that queries DB for each cache-miss
 * user's most recent multiplier, so backfilled rows preserve historical
 * multipliers.
 *
 * The pg_advisory_lock is held on a reserved connection (postgres.js
 * pool would otherwise route lock_acquire and lock_release to different
 * pooled connections, leaking the lock -- same bug pattern that broke
 * matview refresh advisory locks earlier).
 *
 * Usage:
 *   tsx src/scripts/backfill-snapshot-day.ts --date 2026-04-10
 *   tsx src/scripts/backfill-snapshot-day.ts --auto      # detect + process recent missing
 */

import { pointsDb } from '../db.js';
import { takeDailySnapshot } from '../scanner/daily-snapshot.js';

// Arbitrary unique key, distinct from any other advisory lock used in the codebase.
const ADVISORY_LOCK_KEY = 4824671923n;
// Conservative lookback. Wider windows backfill archaeological gaps from
// before the cumulative ledger existed and corrupt anchor chain integrity.
const LOOKBACK_DAYS = 3;

async function findMissingDates(): Promise<string[]> {
  // Any date in [today - LOOKBACK_DAYS, today - 1] where ecosystem_daily_scores
  // has rows but ecosystem_score_snapshots has none.
  const rows = await pointsDb!`
    WITH active_dates AS (
      SELECT DISTINCT day::text AS d
      FROM ecosystem_daily_scores
      WHERE day >= CURRENT_DATE - ${LOOKBACK_DAYS}::int AND day < CURRENT_DATE
    ),
    snapshotted AS (
      SELECT DISTINCT snapshot_date::text AS d
      FROM ecosystem_score_snapshots
      WHERE snapshot_date >= CURRENT_DATE - ${LOOKBACK_DAYS}::int AND snapshot_date < CURRENT_DATE
    )
    SELECT d FROM active_dates
    WHERE d NOT IN (SELECT d FROM snapshotted)
    ORDER BY d ASC
  `;
  return rows.map((r) => r.d as string);
}

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  // Reserve a dedicated connection so pg_try_advisory_lock and
  // pg_advisory_unlock land on the same session. postgres.js pool would
  // otherwise pick a different connection for the unlock, which fails
  // with WARNING "you don't own a lock of type ExclusiveLock" and leaks
  // the lock until session end.
  const conn = await pointsDb!.reserve();
  try {
    const [r] = await conn`SELECT pg_try_advisory_lock(${String(ADVISORY_LOCK_KEY)}::bigint) AS ok`;
    if (!r?.ok) {
      console.log('[Backfill] Another instance holds the lock; skipping');
      return null;
    }
    try {
      return await fn();
    } finally {
      await conn`SELECT pg_advisory_unlock(${String(ADVISORY_LOCK_KEY)}::bigint)`;
    }
  } finally {
    conn.release();
  }
}

function parseArgs(): { date?: string; auto: boolean } {
  const args = process.argv.slice(2);
  let date: string | undefined;
  let auto = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--auto') auto = true;
    else if (a === '--date' && args[i + 1]) date = args[++i];
    else if (a.startsWith('--date=')) date = a.slice(7);
  }
  return { date, auto };
}

async function main() {
  if (!pointsDb) {
    console.error('POINTS_DATABASE_URL not set');
    process.exit(1);
  }

  const { date, auto } = parseArgs();
  if (!date && !auto) {
    console.error('Usage: backfill-snapshot-day.ts --date YYYY-MM-DD | --auto');
    process.exit(1);
  }

  const result = await withLock(async () => {
    const dates = date ? [date] : await findMissingDates();
    if (dates.length === 0) {
      console.log(`[Backfill] No missing dates in the last ${LOOKBACK_DAYS} days`);
      return { processed: 0 };
    }
    console.log(`[Backfill] Processing ${dates.length} date(s) in ASC order: ${dates.join(', ')}`);

    let processed = 0;
    for (const d of dates) {
      console.log(`[Backfill] === ${d} ===`);
      // Empty activationsCache -- takeDailySnapshot has lastMultiplierMap
      // fallback (DB query for prior multiplier per cache-miss user).
      await takeDailySnapshot(d, new Map());
      processed++;
    }
    return { processed };
  });

  await pointsDb.end();

  if (result === null) {
    process.exit(0); // skipped (lock held), not a failure
  }
}

main().catch((err) => {
  console.error('[Backfill] failed:', err);
  process.exit(1);
});
