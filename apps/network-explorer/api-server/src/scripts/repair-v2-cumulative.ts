/**
 * V2 Snapshot all_time_* Cumulative Repair
 *
 * Companion to repair-v2-ecosystem-score.ts. Recomputes the all_time_*
 * cumulative columns for V2 snapshot rows whose base_score was bumped by
 * rpc-reconcile after the original snapshot was written. Without this fix,
 * the next day's snapshot reads a stale prev anchor and propagates the
 * understated all_time_* forward indefinitely.
 *
 * Recomputes per row from the prior snapshot's anchor:
 *   all_time_base   = prev.all_time_base   + base_score * multiplier
 *   all_time_bonus  = prev.all_time_bonus  + bonus_total
 *   all_time_gov    = prev.all_time_gov    + governance_bonus
 *   all_time_ref    = prev.all_time_ref    + referral_bonus * sf
 *   all_time_stak   (untouched -- delta is correct, only base changed)
 *   all_time_score  = atb + atbo + atg + atr + ats
 *
 * Idempotent: only writes when the recomputed value differs from stored.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   node dist/scripts/repair-v2-cumulative.js --dry-run
 *   node dist/scripts/repair-v2-cumulative.js
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
  console.log(`\n=== V2 all_time_* Cumulative Repair (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // Find V2 rows whose stored all_time_base differs from prev_all_time_base + base*mult.
  // Includes rows where prev anchor doesn't exist (NULL prev means start from 0).
  const drifted = await db`
    WITH prev_anchor AS (
      SELECT s.identity_id, s.snapshot_date,
             COALESCE(s.multiplier_v2, s.multiplier)::numeric AS mult,
             COALESCE((
               SELECT prev.all_time_base
               FROM ecosystem_score_snapshots prev
               WHERE prev.identity_id = s.identity_id
                 AND prev.snapshot_date < s.snapshot_date
                 AND prev.all_time_base IS NOT NULL
               ORDER BY prev.snapshot_date DESC
               LIMIT 1
             ), 0) AS prev_base,
             COALESCE((
               SELECT prev.all_time_bonus
               FROM ecosystem_score_snapshots prev
               WHERE prev.identity_id = s.identity_id
                 AND prev.snapshot_date < s.snapshot_date
                 AND prev.all_time_bonus IS NOT NULL
               ORDER BY prev.snapshot_date DESC
               LIMIT 1
             ), 0) AS prev_bonus,
             COALESCE((
               SELECT prev.all_time_gov
               FROM ecosystem_score_snapshots prev
               WHERE prev.identity_id = s.identity_id
                 AND prev.snapshot_date < s.snapshot_date
                 AND prev.all_time_gov IS NOT NULL
               ORDER BY prev.snapshot_date DESC
               LIMIT 1
             ), 0) AS prev_gov,
             COALESCE((
               SELECT prev.all_time_referral_scaled
               FROM ecosystem_score_snapshots prev
               WHERE prev.identity_id = s.identity_id
                 AND prev.snapshot_date < s.snapshot_date
                 AND prev.all_time_referral_scaled IS NOT NULL
               ORDER BY prev.snapshot_date DESC
               LIMIT 1
             ), 0) AS prev_ref
      FROM ecosystem_score_snapshots s
      WHERE s.multiplier_v2 IS NOT NULL
    )
    SELECT s.identity_id, s.snapshot_date, s.base_score,
           pa.mult, pa.prev_base, pa.prev_bonus, pa.prev_gov, pa.prev_ref,
           s.bonus_total::numeric AS bonus_total,
           s.governance_bonus::numeric AS gov,
           s.referral_bonus::numeric AS ref,
           s.all_time_base::numeric AS old_atb,
           s.all_time_score::numeric AS old_score,
           COALESCE(s.all_time_staking_scaled, 0)::numeric AS ats,
           (pa.prev_base + s.base_score * pa.mult)::numeric AS new_atb,
           (pa.prev_bonus + s.bonus_total)::numeric AS new_atbo,
           (pa.prev_gov + s.governance_bonus)::numeric AS new_atg,
           (pa.prev_ref + s.referral_bonus * ${REFERRAL_SCALING_FACTOR})::numeric AS new_atr
    FROM ecosystem_score_snapshots s
    JOIN prev_anchor pa
      ON pa.identity_id = s.identity_id AND pa.snapshot_date = s.snapshot_date
    WHERE s.multiplier_v2 IS NOT NULL
      AND ABS(
        (pa.prev_base + s.base_score * pa.mult) - COALESCE(s.all_time_base, 0)
      ) > 0.01
    ORDER BY s.snapshot_date ASC, s.identity_id
  `;

  if (drifted.length === 0) {
    console.log('No drifted V2 cumulative rows found. Nothing to repair.');
    await db.end();
    return;
  }

  console.log(`Found ${drifted.length} V2 rows with drifted all_time_base.\n`);

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

  console.log('Sample (up to 5):');
  for (const r of drifted.slice(0, 5)) {
    const d = (r.snapshot_date as Date).toISOString().slice(0, 10);
    console.log(
      `  ${d} ${r.identity_id} base=${r.base_score} mult=${r.mult} ` +
      `all_time_base ${r.old_atb} -> ${r.new_atb} ` +
      `all_time_score ${r.old_score} -> ${(parseFloat(r.new_atb as string) + parseFloat(r.new_atbo as string) + parseFloat(r.new_atg as string) + parseFloat(r.new_atr as string) + parseFloat(r.ats as string)).toFixed(3)}`,
    );
  }
  console.log('');

  if (dryRun) {
    console.log('DRY RUN: no changes written.');
    await db.end();
    return;
  }

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
        const newAtb = parseFloat(row.new_atb as string);
        const newAtbo = parseFloat(row.new_atbo as string);
        const newAtg = parseFloat(row.new_atg as string);
        const newAtr = parseFloat(row.new_atr as string);
        const ats = parseFloat(row.ats as string);
        const newScore = newAtb + newAtbo + newAtg + newAtr + ats;
        await db`
          UPDATE ecosystem_score_snapshots
          SET all_time_base               = ${newAtb.toFixed(3)}::numeric,
              all_time_bonus              = ${newAtbo.toFixed(3)}::numeric,
              all_time_gov                = ${newAtg.toFixed(3)}::numeric,
              all_time_referral_scaled    = ${newAtr.toFixed(3)}::numeric,
              all_time_score              = ${newScore.toFixed(3)}::numeric
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

  console.log(`\nRepair complete. ${totalUpdated} rows updated.\n`);
  await db.end();
}

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
