/**
 * Early Bird Retroactive Bonus Script
 *
 * Awards retroactive bonus points to early adopters based on their historical activity.
 * Formula: (active_days x 10) + min(tx_count, 500)
 * Multiplier NOT applied (directly added as bonus).
 *
 * One-time script. Idempotent via tx_digest.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/early-bird-bonus.ts
 *   npx tsx src/scripts/early-bird-bonus.ts --dry-run
 */

import postgres from 'postgres';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const TX_PER_DAY_CAP = 20;

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n=== Early Bird Retroactive Bonus (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // Calculate active_days and tx_count per user from activity_points
  // Exclude synthetic records (unified with daily-nft-check.ts EXCLUDED_CATEGORIES)
  const stats = await db`
    SELECT
      identity_id,
      MIN(wallet_address) as wallet_address,
      COUNT(DISTINCT date_trunc('day', tx_timestamp)::date) as active_days,
      COUNT(*) as tx_count
    FROM activity_points
    WHERE identity_id IS NOT NULL
      AND NOT flagged
      AND category NOT IN (
        'referral-bonus', 'daily-mission',
        'ecosystem-passive', 'staking-daily'
      )
      AND category NOT LIKE 'ecosystem-bonus-%'
    GROUP BY identity_id
    HAVING COUNT(DISTINCT date_trunc('day', tx_timestamp)::date) > 0
    ORDER BY COUNT(DISTINCT date_trunc('day', tx_timestamp)::date) DESC
  `;

  console.log(`  ${stats.length} users with activity history\n`);

  let inserted = 0;
  let skipped = 0;
  let totalPts = 0;

  for (const row of stats) {
    const identityId = row.identity_id as string;
    const wallet = row.wallet_address as string;
    const activeDays = Number(row.active_days);
    const txCount = Number(row.tx_count);

    const avgTxPerDay = Math.min(txCount / activeDays, TX_PER_DAY_CAP);
    const pts = Math.floor(activeDays * avgTxPerDay);
    if (pts <= 0) continue;

    const digest = `bonus-earlybird:${identityId}`;

    if (dryRun) {
      console.log(`  ${identityId.slice(-8)} days=${activeDays} txs=${txCount} -> ${pts} pts`);
      inserted++;
      totalPts += pts;
      continue;
    }

    const result = await db`
      INSERT INTO activity_points
        (wallet_address, identity_id, tx_digest, category, activity_type,
         base_points, volume_tier, genesis_multiplier, final_points,
         tx_timestamp, event_seq, tx_sequence_number)
      VALUES
        (${wallet}, ${identityId}, ${digest}, 'ecosystem-bonus-earlybird', 'early-bird',
         ${pts}, 1.0, 1.0, ${pts.toFixed(2)},
         NOW()::timestamptz, 0, 0)
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    if (result.count > 0) {
      inserted++;
      totalPts += pts;
    } else {
      skipped++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Inserted: ${inserted}, Skipped (duplicate): ${skipped}`);
  console.log(`  Total points: ${totalPts.toLocaleString()}`);

  await db.end();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
