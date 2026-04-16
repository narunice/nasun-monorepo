#!/usr/bin/env tsx
/**
 * NFT Holder Ecosystem Points Airdrop Script
 *
 * Airdrops ecosystem points to:
 *   - Genesis Pass holders: 432 pts each  (category: ecosystem-bonus-genesis-pass-airdrop)
 *   - Alliance NFT holders: 3 pts each    (category: ecosystem-bonus-alliance-airdrop)
 *
 * Steps:
 *   1. INSERT into activity_points (idempotent via ON CONFLICT DO NOTHING)
 *   2. REFRESH MATERIALIZED VIEW ecosystem_daily_scores
 *   3. UPDATE ecosystem_score_snapshots.all_time_score for immediate reflection
 *
 * Usage (on node-3):
 *   POINTS_DATABASE_URL=... npx tsx src/scripts/airdrop-nft-holders.ts --dry-run
 *   POINTS_DATABASE_URL=... npx tsx src/scripts/airdrop-nft-holders.ts
 *
 * Input CSV files (expected in same directory as script or specified via env):
 *   GP_CSV:       gp-holders-registered-YYYY-MM-DD.csv  (eth_address, identity_id, nasun_address)
 *   ALLIANCE_CSV: alliance-airdrop-targets-YYYY-MM-DD.csv (identity_id, nasun_address, social_accounts)
 */

import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

// ========== Config ==========

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');

const GP_POINTS = 432;
const ALLIANCE_POINTS = 3;

const GP_CATEGORY = 'ecosystem-bonus-genesis-pass-airdrop';
const ALLIANCE_CATEGORY = 'ecosystem-bonus-alliance-airdrop';

const AIRDROP_DATE = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL is required');
  process.exit(1);
}

// ========== CSV loading ==========

function findLatestCsv(dir: string, prefix: string): string {
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.csv'))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error(`No ${prefix}*.csv found in ${dir}`);
  return path.join(dir, files[0]);
}

function loadCsv(filePath: string, idCol: number): string[] {
  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').slice(1);
  return lines
    .map((l) => l.split(',')[idCol]?.replace(/^"|"$/g, '').trim())
    .filter(Boolean) as string[];
}

// ========== Main ==========

async function main() {
  const csvDir = process.env.CSV_DIR || path.join(__dirname, '..', '..', '..', '..', '..', '..', 'docs');

  const gpCsvPath = findLatestCsv(csvDir, 'gp-holders-registered-');
  const allianceCsvPath = findLatestCsv(csvDir, 'alliance-airdrop-targets-');

  console.log(`[airdrop] GP CSV:       ${path.basename(gpCsvPath)}`);
  console.log(`[airdrop] Alliance CSV: ${path.basename(allianceCsvPath)}`);
  console.log(`[airdrop] Airdrop date: ${AIRDROP_DATE}`);
  if (DRY_RUN) console.log('[airdrop] DRY RUN - no DB writes');
  console.log('');

  // identity_id is col 1 in GP CSV, col 0 in Alliance CSV
  const gpIdentityIds = loadCsv(gpCsvPath, 1);
  const allianceIdentityIds = loadCsv(allianceCsvPath, 0);

  console.log(`[airdrop] GP targets:       ${gpIdentityIds.length}`);
  console.log(`[airdrop] Alliance targets: ${allianceIdentityIds.length}`);
  console.log(`[airdrop] Total pts to mint: ${gpIdentityIds.length * GP_POINTS + allianceIdentityIds.length * ALLIANCE_POINTS}`);
  console.log('');

  if (DRY_RUN) {
    console.log('[airdrop] DRY RUN complete.');
    return;
  }

  const db = postgres(POINTS_DB_URL!, {
    max: 3,
    idle_timeout: 30,
    connect_timeout: 10,
    connection: { statement_timeout: 120_000 },
  });

  try {
    // ---- Step 1: INSERT activity_points ----
    console.log('[airdrop] Step 1: Inserting activity_points...');

    const now = new Date().toISOString();

    // Build GP rows
    const gpRows = gpIdentityIds.map((identityId, i) => ({
      wallet_address: identityId, // no sui wallet needed; identity_id used as identifier
      identity_id: identityId,
      tx_digest: `airdrop::${GP_CATEGORY}::${AIRDROP_DATE}::${i}`,
      tx_sequence_number: 0,
      category: GP_CATEGORY,
      activity_type: 'airdrop',
      base_points: GP_POINTS,
      volume_tier: 1.0,
      genesis_multiplier: 1.0,
      final_points: GP_POINTS,
      tx_timestamp: now,
      event_seq: 0,
    }));

    // Build Alliance rows
    const allianceRows = allianceIdentityIds.map((identityId, i) => ({
      wallet_address: identityId,
      identity_id: identityId,
      tx_digest: `airdrop::${ALLIANCE_CATEGORY}::${AIRDROP_DATE}::${i}`,
      tx_sequence_number: 0,
      category: ALLIANCE_CATEGORY,
      activity_type: 'airdrop',
      base_points: ALLIANCE_POINTS,
      volume_tier: 1.0,
      genesis_multiplier: 1.0,
      final_points: ALLIANCE_POINTS,
      tx_timestamp: now,
      event_seq: 0,
    }));

    const allRows = [...gpRows, ...allianceRows];
    const BATCH = 500;
    let inserted = 0;

    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      const result = await db`
        INSERT INTO activity_points
        ${db(batch, 'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number',
          'category', 'activity_type', 'base_points', 'volume_tier', 'genesis_multiplier',
          'final_points', 'tx_timestamp', 'event_seq')}
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      inserted += result.count;
      process.stdout.write(`\r[airdrop]   Inserted: ${i + batch.length}/${allRows.length} rows (${inserted} new)`);
    }
    console.log('');
    console.log(`[airdrop] Step 1 done: ${inserted} rows inserted (${allRows.length - inserted} already existed)`);

    // ---- Step 2: REFRESH MATERIALIZED VIEW ----
    console.log('[airdrop] Step 2: Refreshing ecosystem_daily_scores matview...');
    await db`REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores`;
    console.log('[airdrop] Step 2 done.');

    // ---- Step 3: UPDATE all_time_score in ecosystem_score_snapshots ----
    console.log('[airdrop] Step 3: Updating all_time_score in ecosystem_score_snapshots...');

    // For each identity_id, find their latest snapshot and add the airdrop points.
    // Using a single UPDATE per category for efficiency.
    const gpIdArr = gpIdentityIds;
    const allianceIdArr = allianceIdentityIds;

    // GP: update latest snapshot rows
    const gpUpdate = await db`
      UPDATE ecosystem_score_snapshots s
      SET all_time_score = all_time_score + ${GP_POINTS}
      WHERE s.ctid IN (
        SELECT DISTINCT ON (identity_id) ctid
        FROM ecosystem_score_snapshots
        WHERE identity_id = ANY(${gpIdArr})
          AND all_time_score IS NOT NULL
        ORDER BY identity_id, snapshot_date DESC
      )
    `;
    console.log(`[airdrop]   GP snapshots updated: ${gpUpdate.count}`);

    // Alliance: update latest snapshot rows
    const allianceUpdate = await db`
      UPDATE ecosystem_score_snapshots s
      SET all_time_score = all_time_score + ${ALLIANCE_POINTS}
      WHERE s.ctid IN (
        SELECT DISTINCT ON (identity_id) ctid
        FROM ecosystem_score_snapshots
        WHERE identity_id = ANY(${allianceIdArr})
          AND all_time_score IS NOT NULL
        ORDER BY identity_id, snapshot_date DESC
      )
    `;
    console.log(`[airdrop]   Alliance snapshots updated: ${allianceUpdate.count}`);

    // Users with no prior snapshot: nothing to update (they'll get the bonus tomorrow via daily-snapshot)
    const gpNoSnapshot = gpIdArr.length - (gpUpdate.count ?? 0);
    const allianceNoSnapshot = allianceIdArr.length - (allianceUpdate.count ?? 0);
    if (gpNoSnapshot > 0 || allianceNoSnapshot > 0) {
      console.log(`[airdrop]   No snapshot yet (will reflect tomorrow): GP=${gpNoSnapshot}, Alliance=${allianceNoSnapshot}`);
    }

    console.log('[airdrop] Step 3 done.');
    console.log('');
    console.log('[airdrop] === Airdrop Complete ===');
    console.log(`[airdrop] GP:       ${gpIdentityIds.length} users x ${GP_POINTS} pts`);
    console.log(`[airdrop] Alliance: ${allianceIdentityIds.length} users x ${ALLIANCE_POINTS} pts`);
    console.log(`[airdrop] Total pts distributed: ${gpIdentityIds.length * GP_POINTS + allianceIdentityIds.length * ALLIANCE_POINTS}`);

  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('[airdrop] Fatal error:', err);
  process.exit(1);
});
