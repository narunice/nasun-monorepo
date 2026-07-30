/**
 * Backfill network_daily_stats from whatever the indexer still retains.
 *
 * Run this once when the rollup is introduced, and again after any long scanner outage.
 * The window matters: the indexer keeps 400 epochs (~32 days), so every day that is not
 * captured before the pruner reaches it is gone for good -- the chain is pruned too.
 * Running with a lookback wider than the retained window is harmless; days that cannot be
 * computed in full are skipped rather than written short.
 *
 * Usage:
 *   node dist/scripts/backfill-network-daily-stats.js [--days 40]
 *
 * Env: DATABASE_URL (sui_indexer), POINTS_DATABASE_URL (nasun_points).
 *
 * Idempotent: ON CONFLICT DO NOTHING, so an existing day is never rewritten from a
 * partially-pruned source.
 */
import { rollUpNetworkDailyStats, readNetworkDailyStats } from '../scanner/network-daily-rollup.js';
import { sql, pointsDb } from '../db.js';

async function main(): Promise<void> {
  if (!pointsDb) {
    console.error('[Backfill] POINTS_DATABASE_URL not set');
    process.exit(2);
  }

  const argIdx = process.argv.indexOf('--days');
  const days = argIdx >= 0 ? Number(process.argv[argIdx + 1]) : 40;
  if (!Number.isInteger(days) || days < 1 || days > 400) {
    console.error('[Backfill] --days must be an integer between 1 and 400');
    process.exit(2);
  }

  const [{ oldest }] = await sql<{ oldest: string | null }[]>`
    SELECT to_char(to_timestamp(MIN(timestamp_ms) / 1000.0), 'YYYY-MM-DD') AS oldest
    FROM checkpoints
  `;
  console.log(`[Backfill] indexer retains from ${oldest ?? 'unknown'}; requesting ${days} days`);

  const written = await rollUpNetworkDailyStats(days);
  const rows = await readNetworkDailyStats(days);
  console.log(`[Backfill] wrote ${written} day(s); table now covers ${rows.length} day(s) in window`);
  if (rows.length > 0) {
    console.log(`[Backfill] range ${rows[0].day} .. ${rows[rows.length - 1].day}`);
  }

  await sql.end({ timeout: 5 });
  await pointsDb.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('[Backfill] Fatal:', err);
  process.exit(1);
});
