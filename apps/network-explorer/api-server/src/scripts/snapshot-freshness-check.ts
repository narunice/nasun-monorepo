/**
 * Dead-man-switch for the two daily-freshness invariants in nasun_points:
 * yesterday's ecosystem snapshot, and the hourly NSI (Nasun Standing) compute.
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
 * The NSI half exists because nsi-compute failed on every cycle from
 * 2026-07-06 to 2026-08-24 and nobody noticed for seven weeks. It did alert --
 * but from inside the worker, with a restart-scoped counter and an identical
 * message each time, so the signal was indistinguishable from noise. A check
 * that reads the *data* rather than the process is the shape that actually
 * escalates: this runs as a fresh one-shot process once a day, so it re-alerts
 * every morning until someone fixes it. (sendTelegramAlert's dedup is
 * in-process and therefore inert here -- the per-day keys below only matter if
 * this is ever moved onto a sub-5-minute schedule.)
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
  // Collected rather than thrown one at a time: an early exit on a missing
  // snapshot would have hidden the NSI freeze for as long as both were broken.
  const problems: string[] = [];
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
      problems.push('snapshot-missing');
    } else if (yesterdayCount < MIN_ROWS) {
      const msg = `Snapshot freshness: yesterday=${expected} has only ${yesterdayCount} rows (expected >= ${MIN_ROWS}). Possible partial snapshot.`;
      console.error(`[FreshnessCheck] ${msg}`);
      await sendTelegramAlert(msg, { dedupKey: `snapshot-freshness-partial-${expected}` });
      problems.push('snapshot-partial');
    } else {
      console.log(`[FreshnessCheck] OK: snapshot ${expected} = ${yesterdayCount} rows`);
    }

    // nsi-compute runs hourly, so anything past a few hours means the worker is
    // failing, wedged, or gated off. The threshold is deliberately loose: this
    // check is for outages, and a tighter bound would page on ordinary restarts.
    const NSI_MAX_AGE_HOURS = 6;
    // Scoped catch: a missing table or a permission gap here must not throw
    // past `problems` into main().catch, which would swap the precise snapshot
    // verdict above for a generic crash and exit 2. Isolation has to cover the
    // query, not just the alerting decision.
    let nsiRow: { latest: Date | null; row_count: number } | undefined;
    try {
      [nsiRow] = await sql<Array<{ latest: Date | null; row_count: number }>>`
        SELECT MAX(computed_at) AS latest, COUNT(*)::int AS row_count FROM user_nsi
      `;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const msg = `NSI freshness: user_nsi query failed (${detail}).`;
      console.error(`[FreshnessCheck] ${msg}`);
      await sendTelegramAlert(msg, { dedupKey: `nsi-freshness-error-${expected}` });
      problems.push('nsi-query-failed');
    }

    if (!nsiRow) {
      // already reported above
    } else if (!nsiRow.latest) {
      const msg = 'NSI freshness: user_nsi is empty. Nasun Standing has never been computed.';
      console.error(`[FreshnessCheck] ${msg}`);
      await sendTelegramAlert(msg, { dedupKey: `nsi-freshness-empty-${expected}` });
      problems.push('nsi-empty');
    } else {
      const ageHours = (Date.now() - nsiRow.latest.getTime()) / 3_600_000;
      if (ageHours > NSI_MAX_AGE_HOURS) {
        const age =
          ageHours < 48 ? `${ageHours.toFixed(1)}h` : `${(ageHours / 24).toFixed(1)} days`;
        const msg = `NSI freshness: user_nsi last computed ${age} ago (expected hourly). Nasun Standing tiers are frozen, check tier-worker.`;
        console.error(`[FreshnessCheck] ${msg}`);
        await sendTelegramAlert(msg, { dedupKey: `nsi-freshness-stale-${expected}` });
        problems.push('nsi-stale');
      } else {
        console.log(
          `[FreshnessCheck] OK: user_nsi ${nsiRow.row_count} rows, ${ageHours.toFixed(1)}h old`,
        );
      }
    }

    if (problems.length > 0) {
      console.error(`[FreshnessCheck] failing: ${problems.join(', ')}`);
      process.exit(1);
    }
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
