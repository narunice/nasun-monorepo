/**
 * V2 Snapshot ecosystem_score_v2 Repair
 *
 * Backfills ecosystem_score_v2 for snapshot rows where rpc-reconcile bumped
 * base_score after the snapshot was taken but only refreshed the legacy V1
 * ecosystem_score column. Symptom: tooltip shows base=7, mult=1.0 but
 * total=1 because the V2 score column still holds the pre-reconcile value.
 *
 * Formula mirrors daily-snapshot.ts:
 *   ecosystem_score_v2 = base_score * multiplier_v2
 *                      + bonus_total + governance_bonus
 *                      + referral_bonus * REFERRAL_SCALING_FACTOR
 *                      + day_staking_scaled
 *
 * day_staking_scaled is derived from the cumulative all_time_staking_scaled
 * column (today minus prev day, clamped at zero) so it matches what the
 * /snapshot/history endpoint returns to the dashboard.
 *
 * Idempotent: only touches rows whose recomputed score differs from the
 * stored value, so re-runs are safe.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   node dist/scripts/repair-v2-ecosystem-score.js --dry-run
 *   node dist/scripts/repair-v2-ecosystem-score.js
 */

import postgres from 'postgres';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const dryRun = process.argv.includes('--dry-run');
const REFERRAL_SCALING_FACTOR = 0.5;

async function main() {
  console.log(`\n=== V2 ecosystem_score_v2 Repair (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Find V2 rows where the recomputed score differs from the stored value.
  //    drift > 0.01 filters out floating-point noise.
  const drifted = await db`
    WITH staking_today AS (
      SELECT s.identity_id, s.snapshot_date,
             GREATEST(
               COALESCE(s.all_time_staking_scaled, 0)
               - COALESCE((
                   SELECT prev.all_time_staking_scaled
                   FROM ecosystem_score_snapshots prev
                   WHERE prev.identity_id = s.identity_id
                     AND prev.snapshot_date < s.snapshot_date
                   ORDER BY prev.snapshot_date DESC
                   LIMIT 1
                 ), 0),
               0
             ) AS day_staking_scaled
      FROM ecosystem_score_snapshots s
      WHERE s.multiplier_v2 IS NOT NULL
    )
    SELECT s.identity_id, s.snapshot_date, s.base_score,
           s.multiplier_v2::numeric AS mult,
           s.bonus_total::numeric AS bonus_total,
           s.governance_bonus::numeric AS gov,
           s.referral_bonus::numeric AS ref,
           st.day_staking_scaled::numeric AS day_staking,
           s.ecosystem_score_v2::numeric AS old_score,
           (s.base_score * s.multiplier_v2
            + s.bonus_total + s.governance_bonus
            + s.referral_bonus * ${REFERRAL_SCALING_FACTOR}
            + st.day_staking_scaled)::numeric(14,3) AS new_score
    FROM ecosystem_score_snapshots s
    JOIN staking_today st
      ON st.identity_id = s.identity_id
     AND st.snapshot_date = s.snapshot_date
    WHERE s.multiplier_v2 IS NOT NULL
      AND ABS(
        (s.base_score * s.multiplier_v2
         + s.bonus_total + s.governance_bonus
         + s.referral_bonus * ${REFERRAL_SCALING_FACTOR}
         + st.day_staking_scaled)
        - COALESCE(s.ecosystem_score_v2, 0)
      ) > 0.01
    ORDER BY s.snapshot_date DESC, s.identity_id
  `;

  if (drifted.length === 0) {
    console.log('No drifted V2 rows found. Nothing to repair.');
    await db.end();
    return;
  }

  console.log(`Found ${drifted.length} V2 rows with drifted ecosystem_score_v2.\n`);

  // Group by date for a readable summary
  const byDate = new Map<string, number>();
  for (const r of drifted) {
    const d = (r.snapshot_date as Date).toISOString().slice(0, 10);
    byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  console.log('Distribution by date:');
  for (const [d, n] of [...byDate.entries()].sort()) {
    console.log(`  ${d}: ${n} rows`);
  }
  console.log('');

  // Show a sample
  console.log('Sample (up to 5):');
  for (const r of drifted.slice(0, 5)) {
    const d = (r.snapshot_date as Date).toISOString().slice(0, 10);
    console.log(
      `  ${d} ${r.identity_id} base=${r.base_score} mult=${r.mult} ` +
      `staking=${r.day_staking} :: ${r.old_score} -> ${r.new_score}`,
    );
  }
  console.log('');

  if (dryRun) {
    console.log('DRY RUN: no changes written. Re-run without --dry-run to apply.');
    await db.end();
    return;
  }

  // 2. Apply repairs in batches per date
  let totalUpdated = 0;
  for (const [targetDate, _count] of [...byDate.entries()].sort()) {
    const dateRows = drifted.filter(
      (r) => (r.snapshot_date as Date).toISOString().slice(0, 10) === targetDate,
    );
    console.log(`Repairing ${targetDate} (${dateRows.length} rows)...`);
    const BATCH_SIZE = 200;
    for (let i = 0; i < dateRows.length; i += BATCH_SIZE) {
      const batch = dateRows.slice(i, i + BATCH_SIZE);
      for (const row of batch) {
        await db`
          UPDATE ecosystem_score_snapshots
          SET ecosystem_score_v2 = ${(row.new_score as string)}::numeric(14,3)
          WHERE identity_id = ${row.identity_id as string}
            AND snapshot_date = ${targetDate}::date
            AND multiplier_v2 IS NOT NULL
        `;
      }
      totalUpdated += batch.length;
      process.stdout.write(`  ${Math.min(i + BATCH_SIZE, dateRows.length)}/${dateRows.length}\r`);
    }
    console.log(`  ${targetDate} done.`);
  }

  console.log(`\nRepair complete. ${totalUpdated} V2 snapshot scores updated.\n`);
  await db.end();
}

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
