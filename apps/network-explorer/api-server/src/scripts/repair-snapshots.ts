/**
 * Snapshot Repair Script
 *
 * Fixes ecosystem_score_snapshots where multiplier was incorrectly recorded as 0
 * due to activation cache being empty during 2026-04-01 ~ 2026-04-05.
 *
 * Strategy:
 *   For each affected snapshot (multiplier=0, base_score>0), use the user's
 *   latest known positive multiplier from a later snapshot to recalculate
 *   the ecosystem_score and re-rank.
 *
 * Idempotent: only updates rows where multiplier = 0 AND base_score > 0.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/repair-snapshots.ts --dry-run
 *   npx tsx src/scripts/repair-snapshots.ts
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

// Dates affected by the activation cache outage
const AFFECTED_DATES = ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'];

async function main() {
  console.log(`\n=== Snapshot Repair (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Find all affected snapshots and their correct multiplier
  const affected = await db`
    WITH latest_mult AS (
      SELECT DISTINCT ON (identity_id) identity_id, multiplier
      FROM ecosystem_score_snapshots
      WHERE multiplier > 0
      ORDER BY identity_id, snapshot_date DESC
    )
    SELECT s.identity_id, s.snapshot_date, s.base_score,
      s.bonus_total, s.referral_bonus, s.governance_bonus,
      s.ecosystem_score as old_score,
      lm.multiplier as correct_multiplier
    FROM ecosystem_score_snapshots s
    JOIN latest_mult lm ON s.identity_id = lm.identity_id
    WHERE s.multiplier = 0
      AND s.base_score > 0
      AND s.snapshot_date = ANY(${AFFECTED_DATES}::date[])
    ORDER BY s.snapshot_date, s.identity_id
  `;

  console.log(`Found ${affected.length} snapshots to repair across ${AFFECTED_DATES.length} dates\n`);

  if (affected.length === 0) {
    console.log('Nothing to repair.');
    await db.end();
    return;
  }

  // 2. Group by date for reporting
  const byDate = new Map<string, number>();
  for (const row of affected) {
    const d = (row.snapshot_date as Date).toISOString().slice(0, 10);
    byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  for (const [date, count] of byDate) {
    console.log(`  ${date}: ${count} snapshots to fix`);
  }
  console.log();

  if (dryRun) {
    // Show sample repairs
    console.log('Sample repairs (first 10):');
    for (const row of affected.slice(0, 10)) {
      const correctedScore = parseFloat(
        (
          (row.base_score as number) * (row.correct_multiplier as number) +
          parseFloat(row.bonus_total as string) +
          parseFloat(row.governance_bonus as string) +
          parseFloat(row.referral_bonus as string) * REFERRAL_SCALING_FACTOR
        ).toFixed(2),
      );
      console.log(
        `  ${(row.snapshot_date as Date).toISOString().slice(0, 10)} | ` +
          `base=${row.base_score} | mult 0 -> ${row.correct_multiplier} | ` +
          `score ${row.old_score} -> ${correctedScore}`,
      );
    }
    console.log('\nDry run complete. Re-run without --dry-run to apply.\n');
    await db.end();
    return;
  }

  // 3. Apply repairs in batches per date
  let totalUpdated = 0;

  for (const targetDate of AFFECTED_DATES) {
    const dateRows = affected.filter(
      (r) => (r.snapshot_date as Date).toISOString().slice(0, 10) === targetDate,
    );
    if (dateRows.length === 0) continue;

    console.log(`Repairing ${targetDate} (${dateRows.length} rows)...`);

    // Update in batches of 200
    const BATCH_SIZE = 200;
    for (let i = 0; i < dateRows.length; i += BATCH_SIZE) {
      const batch = dateRows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        const mult = parseFloat(row.correct_multiplier as string);
        const correctedScore = parseFloat(
          (
            (row.base_score as number) * mult +
            parseFloat(row.bonus_total as string) +
            parseFloat(row.governance_bonus as string) +
            parseFloat(row.referral_bonus as string) * REFERRAL_SCALING_FACTOR
          ).toFixed(2),
        );

        await db`
          UPDATE ecosystem_score_snapshots
          SET multiplier = ${mult.toFixed(2)},
              ecosystem_score = ${correctedScore.toFixed(2)}
          WHERE identity_id = ${row.identity_id as string}
            AND snapshot_date = ${targetDate}::date
            AND multiplier = 0
        `;
      }

      totalUpdated += batch.length;
      process.stdout.write(`  ${Math.min(i + BATCH_SIZE, dateRows.length)}/${dateRows.length}\r`);
    }

    // Re-rank this date
    console.log(`  Re-ranking ${targetDate}...`);
    await db`
      WITH ranked AS (
        SELECT identity_id,
          ROW_NUMBER() OVER (ORDER BY ecosystem_score DESC) as new_rank
        FROM ecosystem_score_snapshots
        WHERE snapshot_date = ${targetDate}::date
          AND multiplier > 0
      )
      UPDATE ecosystem_score_snapshots s
      SET rank = r.new_rank
      FROM ranked r
      WHERE s.identity_id = r.identity_id
        AND s.snapshot_date = ${targetDate}::date
    `;

    // Set rank to NULL for multiplier=0 users
    await db`
      UPDATE ecosystem_score_snapshots
      SET rank = NULL
      WHERE snapshot_date = ${targetDate}::date
        AND multiplier = 0
    `;

    console.log(`  ${targetDate} done.`);
  }

  console.log(`\nRepair complete. ${totalUpdated} snapshots updated.\n`);
  await db.end();
}

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
