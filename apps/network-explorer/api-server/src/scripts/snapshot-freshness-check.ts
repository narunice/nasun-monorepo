/**
 * Dead-man-switch: check that yesterday's ecosystem snapshot exists.
 *
 * Run from a node-3 cron a few hours after the daily snapshot window so
 * any transient failure has had time to recover via the 60s scanLoop
 * retry. If the most recent snapshot date is older than yesterday, send
 * a Telegram alert so a human can investigate / manually backfill.
 *
 * The 2026-05-08 lockout sat unnoticed for ~24h because the only signal
 * was stderr. This script closes that gap from the same host the
 * scanner runs on; if node-3 itself is down the alert won't fire, which
 * is acceptable since a host outage gets noticed through other channels.
 *
 * Usage: node dist/scripts/snapshot-freshness-check.js
 *
 * Env vars: POINTS_DATABASE_URL (or DATABASE_URL),
 *           TELEGRAM_BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID.
 */

import postgres from 'postgres';
import { sendTelegramAlert } from '../utils/alert.js';

async function main(): Promise<void> {
  const dbUrl = process.env.POINTS_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[FreshnessCheck] POINTS_DATABASE_URL not set');
    process.exit(2);
  }

  const sql = postgres(dbUrl);
  try {
    const [row] = await sql`
      SELECT MAX(snapshot_date)::text AS last_date,
             COUNT(*)                 AS row_count
      FROM ecosystem_score_snapshots
      WHERE snapshot_date = (CURRENT_DATE - INTERVAL '1 day')::date
    `;
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const expected = yesterday.toISOString().slice(0, 10);
    const lastDate = row?.last_date as string | null;
    const yesterdayCount = Number(row?.row_count ?? 0);

    // We expect at least a meaningful number of rows for yesterday. The
    // exact threshold doesn't matter — any value below a sane floor signals
    // either a system outage or a partial snapshot (both warrant a human
    // look). 1000 is well below the steady-state ~60K and high enough that
    // a dev-environment with very few users won't false-positive.
    const MIN_ROWS = 1000;

    if (!lastDate || lastDate < expected) {
      const msg = `Snapshot freshness: yesterday=${expected} not found (last=${lastDate ?? 'none'}). Manual backfill needed.`;
      console.error(`[FreshnessCheck] ${msg}`);
      await sendTelegramAlert(msg, { dedupKey: `snapshot-freshness-missing-${expected}` });
      process.exit(1);
    }

    if (yesterdayCount < MIN_ROWS) {
      const msg = `Snapshot freshness: yesterday=${expected} has only ${yesterdayCount} rows (expected >= ${MIN_ROWS}). Possible partial snapshot.`;
      console.error(`[FreshnessCheck] ${msg}`);
      await sendTelegramAlert(msg, { dedupKey: `snapshot-freshness-partial-${expected}` });
      process.exit(1);
    }

    console.log(`[FreshnessCheck] OK: ${expected} = ${yesterdayCount} rows`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('[FreshnessCheck] Fatal:', err);
  // Best-effort alert on script failure itself.
  void sendTelegramAlert(
    `Snapshot freshness check crashed: ${(err as Error).message}`,
    { dedupKey: 'snapshot-freshness-check-crash' },
  ).finally(() => process.exit(2));
});
