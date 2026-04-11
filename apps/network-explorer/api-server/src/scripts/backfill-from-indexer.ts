/**
 * Indexer-based backfill script for ecosystem activity points.
 *
 * Recovers missing activity_points records from the indexer DB (event_struct_name
 * + tx_calls_fun tables) and corrects ecosystem_score_snapshots.
 *
 * Why: Scanner outages (PM2 restarts, DB ECONNRESET) caused the scanner cursor
 * to advance past events without inserting them into activity_points. The on-chain
 * data is still in the indexer DB and can be replayed.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/backfill-from-indexer.ts --start 2026-04-01 --end 2026-04-10 --dry-run
 *   npx tsx src/scripts/backfill-from-indexer.ts --start 2026-04-01 --end 2026-04-10
 *
 * Safety:
 *   - All inserts use ON CONFLICT DO NOTHING (idempotent)
 *   - Snapshot updates use UPDATE only (no DELETE), matching repair-snapshots.ts pattern
 *   - --dry-run rolls back all changes after reporting counts
 *   - Stop the scanner (pm2 stop explorer-api) before running
 */

import postgres from 'postgres'; // eslint-disable-line
import {
  getEventMapping,
  getBasePoints,
  SCORE_CATEGORIES,
  GENESIS_PASS_MULTIPLIER,
} from '../config/points.js';
import { fetchWithOffload } from '../scanner/fetch-with-offload.js';

// --- CLI args ---

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const startDate = args.find((_, i) => args[i - 1] === '--start') ?? '';
const endDate = args.find((_, i) => args[i - 1] === '--end') ?? '';

if (!startDate || !endDate) {
  console.error('Usage: npx tsx backfill-from-indexer.ts --start YYYY-MM-DD --end YYYY-MM-DD [--dry-run]');
  process.exit(1);
}

// Validate date format
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
  console.error('Invalid date format. Use YYYY-MM-DD.');
  process.exit(1);
}

// --- Config ---

const INDEXER_DB_URL = process.env.DATABASE_URL;
const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_KEY = process.env.WALLET_MAPPINGS_API_KEY;
const REFERRAL_SF = 0.5;
const PAGE_SIZE = 1000;

if (!INDEXER_DB_URL || !POINTS_DB_URL) {
  console.error('DATABASE_URL and POINTS_DATABASE_URL must be set');
  process.exit(1);
}

const indexerDb = postgres(INDEXER_DB_URL, {
  max: 3, idle_timeout: 30, connect_timeout: 10,
  connection: { statement_timeout: 120000 },
});
const pointsDb = postgres(POINTS_DB_URL, {
  max: 3, idle_timeout: 30, connect_timeout: 10,
  connection: { statement_timeout: 120000 },
});

// Faucet package IDs (hex strings for Buffer conversion)
const FAUCET_PKG_HEX = [
  '1c93579be99e89ab05a33ac04af2fd7b1a604f9c98fe74d1b6cae6913c8362e7',
  '7f8dba64318adb8042b266d52d372b4b876778aa7f27f7e37847cc15611f75b2',
  'd3256ab6c7013402f258870188e15e69bd881c534e913c1ee7d991f4f9e6ab0f',
  'bf33cac7b8ccb22d398a6dedc3e159ed68bc1804bf0726516360e7e0b9dcb474',
  '2e08785948d44afb14f912a6bfd6bca0dc83f0d623b290ed1b7d0f57a7dced5d',
  'c2d09b5e026b1d8378e8f70333e8e74ed3b5798715caa284bcb82d22cb60b78e',
];
const FAUCET_PKG_BUFS = FAUCET_PKG_HEX.map(h => Buffer.from(h, 'hex'));

// --- Wallet mappings ---

async function fetchWalletMappings(): Promise<{
  walletMap: Map<string, string>;
  genesisPassSet: Set<string>;
}> {
  const walletMap = new Map<string, string>();
  const genesisPassSet = new Set<string>();

  if (!WALLET_MAPPINGS_URL) {
    console.warn('WALLET_MAPPINGS_URL not set, all wallets will be skipped');
    return { walletMap, genesisPassSet };
  }

  // Use fetchWithOffload to handle S3 presigned URL + gzip (same as live scanner)
  const data = await fetchWithOffload<{
    wallets: Record<string, string>;
    genesisPass: string[];
  }>({
    url: WALLET_MAPPINGS_URL,
    apiKey: WALLET_MAPPINGS_KEY,
    label: 'Backfill',
  });

  if (!data) throw new Error('Failed to fetch wallet mappings');

  if (data.wallets && typeof data.wallets === 'object') {
    for (const [addr, id] of Object.entries(data.wallets)) {
      if (typeof addr === 'string' && typeof id === 'string') {
        walletMap.set(addr.toLowerCase(), id);
      }
    }
  }
  if (Array.isArray(data.genesisPass)) {
    for (const id of data.genesisPass) {
      if (typeof id === 'string') genesisPassSet.add(id);
    }
  }

  return { walletMap, genesisPassSet };
}

// --- Insert record type ---

interface PointsInsert {
  wallet_address: string;
  identity_id: string;
  tx_digest: string;
  tx_sequence_number: number;
  category: string;
  activity_type: string;
  base_points: number;
  volume_tier: number;
  genesis_multiplier: number;
  final_points: string;
  tx_timestamp: Date;
  event_seq: number;
}

// --- Main ---

async function main() {
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${endDate}T23:59:59.999Z`).getTime();

  console.log(`\n=== Backfill from Indexer (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`  Date range: ${startDate} to ${endDate}`);
  console.log(`  Start ms: ${startMs}, End ms: ${endMs}\n`);

  // 1. Fetch wallet mappings
  console.log('Fetching wallet mappings...');
  const { walletMap, genesisPassSet } = await fetchWalletMappings();
  console.log(`  ${walletMap.size} wallets, ${genesisPassSet.size} genesis pass holders\n`);

  // Build existing activity_points set to enforce daily category cap
  console.log('Loading existing daily category caps...');
  const existingCaps = new Set<string>();
  const existingRows = await pointsDb`
    SELECT DISTINCT identity_id, category, date_trunc('day', tx_timestamp)::date as day
    FROM activity_points
    WHERE tx_timestamp >= ${startDate}::date
      AND tx_timestamp < (${endDate}::date + interval '1 day')
      AND base_points > 0
      AND NOT flagged
  `;
  for (const row of existingRows) {
    const dayStr = (row.day as Date).toISOString().slice(0, 10);
    existingCaps.add(`${row.identity_id}::${row.category}::${dayStr}`);
  }
  console.log(`  ${existingCaps.size} existing (identity, category, day) entries\n`);

  // Daily category cap tracker (includes existing + newly inserted)
  const dailyCap = new Set(existingCaps);
  const stats = { inserted: 0, skipped: 0, duplicate: 0, byCat: new Map<string, number>() };

  // ---------- 1-A. Event-based backfill ----------
  console.log('--- Phase 1A: Event-based backfill from event_struct_name ---\n');

  // Find tx_sequence_number range for the date window
  const [seqRange] = await indexerDb`
    SELECT MIN(tx_sequence_number)::bigint as min_seq,
           MAX(tx_sequence_number)::bigint as max_seq
    FROM events
    WHERE timestamp_ms >= ${startMs} AND timestamp_ms <= ${endMs}
  `;
  const minSeq = Number(seqRange?.min_seq ?? 0);
  const maxSeq = Number(seqRange?.max_seq ?? 0);
  console.log(`  Sequence range: ${minSeq} to ${maxSeq} (${maxSeq - minSeq} span)\n`);

  let cursor = minSeq - 1;
  let pageCount = 0;

  while (cursor < maxSeq) {
    const rows = await indexerDb`
      SELECT
        esn.tx_sequence_number::bigint as tx_sequence_number,
        esn.event_sequence_number::int as event_sequence_number,
        encode(esn.package, 'hex') as package_hex,
        esn.module,
        esn.type_name,
        encode(esn.sender, 'hex') as sender_hex,
        e.timestamp_ms::text as timestamp_ms,
        encode(e.transaction_digest, 'hex') as tx_digest_hex
      FROM event_struct_name esn
      JOIN events e
        ON esn.tx_sequence_number = e.tx_sequence_number
       AND esn.event_sequence_number = e.event_sequence_number
      WHERE esn.tx_sequence_number > ${cursor}
        AND esn.tx_sequence_number <= ${maxSeq}
        AND e.timestamp_ms >= ${startMs}
        AND e.timestamp_ms <= ${endMs}
      ORDER BY esn.tx_sequence_number, esn.event_sequence_number
      LIMIT ${PAGE_SIZE}
    `;

    if (rows.length === 0) break;
    pageCount++;

    const inserts: PointsInsert[] = [];

    for (const row of rows) {
      const mapping = getEventMapping(
        row.package_hex as string,
        row.module as string,
        row.type_name as string,
      );
      if (!mapping) continue;

      const basePoints = getBasePoints(mapping.category, mapping.activityType);
      if (basePoints === 0) continue;

      const walletAddress = `0x${row.sender_hex}`;
      const identityId = walletMap.get(walletAddress.toLowerCase());
      if (!identityId) { stats.skipped++; continue; }

      // Daily category cap
      const ts = new Date(Number(row.timestamp_ms));
      const dayStr = ts.toISOString().slice(0, 10);
      const capKey = `${identityId}::${mapping.category}::${dayStr}`;
      if (dailyCap.has(capKey)) continue;

      const isScoreCat = SCORE_CATEGORIES.has(mapping.category);
      const genesisMult = isScoreCat && genesisPassSet.has(identityId)
        ? GENESIS_PASS_MULTIPLIER : 1.0;
      const finalPoints = isScoreCat
        ? (basePoints * genesisMult).toFixed(2)
        : '1.00';

      inserts.push({
        wallet_address: walletAddress,
        identity_id: identityId,
        tx_digest: `0x${row.tx_digest_hex}`,
        tx_sequence_number: Number(row.tx_sequence_number),
        category: mapping.category,
        activity_type: mapping.activityType,
        base_points: basePoints,
        volume_tier: 1.0,
        genesis_multiplier: genesisMult,
        final_points: finalPoints,
        tx_timestamp: ts,
        event_seq: Number(row.event_sequence_number),
      });

      dailyCap.add(capKey);
    }

    if (inserts.length > 0 && !dryRun) {
      const result = await pointsDb`
        INSERT INTO activity_points ${pointsDb(inserts,
          'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number',
          'category', 'activity_type', 'base_points', 'volume_tier',
          'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq'
        )}
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      stats.inserted += result.count;
      stats.duplicate += inserts.length - result.count;
    } else if (inserts.length > 0 && dryRun) {
      stats.inserted += inserts.length;
    }

    // Track per-category counts
    for (const ins of inserts) {
      stats.byCat.set(ins.category, (stats.byCat.get(ins.category) ?? 0) + 1);
    }

    cursor = Number(rows[rows.length - 1].tx_sequence_number);
    if (pageCount % 100 === 0) {
      process.stdout.write(`  Page ${pageCount}, cursor at ${cursor}, ${stats.inserted} inserted so far\r`);
    }
  }

  console.log(`\n  Events: ${pageCount} pages, ${stats.inserted} inserted, ${stats.duplicate} duplicates, ${stats.skipped} unregistered\n`);

  // ---------- 1-B. Faucet backfill ----------
  console.log('--- Phase 1B: Faucet backfill from tx_calls_fun ---\n');

  const faucetRows = await indexerDb`
    SELECT DISTINCT ON (encode(c.sender, 'hex'), date_trunc('day', to_timestamp(t.timestamp_ms::bigint / 1000.0)))
      c.tx_sequence_number::bigint as tx_sequence_number,
      encode(c.sender, 'hex') as sender_hex,
      encode(t.transaction_digest, 'hex') as tx_digest_hex,
      t.timestamp_ms::text as timestamp_ms
    FROM tx_calls_fun c
    JOIN transactions t ON c.tx_sequence_number = t.tx_sequence_number
    WHERE c.package IN ${indexerDb(FAUCET_PKG_BUFS)}
      AND c.module IN ('faucet', 'faucet_v2')
      AND c.func LIKE 'request_%'
      AND t.timestamp_ms >= ${startMs}
      AND t.timestamp_ms <= ${endMs}
    ORDER BY encode(c.sender, 'hex'), date_trunc('day', to_timestamp(t.timestamp_ms::bigint / 1000.0)), c.tx_sequence_number
  `;

  let faucetInserted = 0;
  const faucetInserts: PointsInsert[] = [];

  for (const row of faucetRows) {
    const walletAddress = `0x${row.sender_hex}`;
    const identityId = walletMap.get(walletAddress.toLowerCase());
    if (!identityId) continue;

    const ts = new Date(Number(row.timestamp_ms));
    const dayStr = ts.toISOString().slice(0, 10);
    const capKey = `${identityId}::faucet::${dayStr}`;
    if (dailyCap.has(capKey)) continue;

    faucetInserts.push({
      wallet_address: walletAddress,
      identity_id: identityId,
      tx_digest: `faucet:0x${row.tx_digest_hex}`,
      tx_sequence_number: Number(row.tx_sequence_number),
      category: 'faucet',
      activity_type: 'claim',
      base_points: 1,
      volume_tier: 1.0,
      genesis_multiplier: 1.0,
      final_points: '1.00',
      tx_timestamp: ts,
      event_seq: 0,
    });

    dailyCap.add(capKey);
  }

  if (faucetInserts.length > 0 && !dryRun) {
    const result = await pointsDb`
      INSERT INTO activity_points ${pointsDb(faucetInserts,
        'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number',
        'category', 'activity_type', 'base_points', 'volume_tier',
        'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq'
      )}
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    faucetInserted = result.count;
  } else if (faucetInserts.length > 0 && dryRun) {
    faucetInserted = faucetInserts.length;
  }

  stats.byCat.set('faucet', (stats.byCat.get('faucet') ?? 0) + faucetInserted);
  console.log(`  Faucet: ${faucetInserts.length} candidates, ${faucetInserted} inserted\n`);

  // ---------- Summary ----------
  console.log('=== Backfill Summary ===');
  console.log(`  Total inserted: ${stats.inserted + faucetInserted}`);
  console.log(`  Duplicates (ON CONFLICT): ${stats.duplicate}`);
  console.log(`  Unregistered wallets: ${stats.skipped}`);
  console.log('\n  By category:');
  for (const [cat, count] of Array.from(stats.byCat.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${count}`);
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No data was modified.\n');
    await indexerDb.end();
    await pointsDb.end();
    return;
  }

  // ---------- 2. Refresh matview ----------
  console.log('\n--- Phase 2: Refreshing materialized view ---\n');
  await pointsDb`REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores`;
  console.log('  Matview refreshed.\n');

  // ---------- 3. Snapshot correction ----------
  console.log('--- Phase 3: Correcting snapshots ---\n');

  // Generate date list
  const dates: string[] = [];
  const cur = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  let totalSnapshotUpdates = 0;

  for (const date of dates) {
    // Compare matview base_score with existing snapshot base_score
    const changed = await pointsDb`
      SELECT d.identity_id, d.base_score::int as new_base
      FROM ecosystem_daily_scores d
      JOIN ecosystem_score_snapshots s
        ON d.identity_id = s.identity_id AND s.snapshot_date = ${date}::date
      WHERE d.day = ${date}::date
        AND d.base_score::int != s.base_score
    `;

    if (changed.length === 0) {
      console.log(`  ${date}: no changes`);
      continue;
    }

    // UPDATE snapshots with corrected base_score and recalculated ecosystem_score
    let dateUpdated = 0;
    for (const row of changed) {
      const result = await pointsDb`
        UPDATE ecosystem_score_snapshots
        SET base_score = ${row.new_base as number},
            ecosystem_score = (
              ${row.new_base as number} * multiplier
              + bonus_total + governance_bonus
              + referral_bonus * ${REFERRAL_SF}
            )::numeric(10,2),
            is_backfilled = TRUE
        WHERE identity_id = ${row.identity_id as string}
          AND snapshot_date = ${date}::date
          AND base_score != ${row.new_base as number}
      `;
      dateUpdated += result.count;
    }

    // Re-rank this date
    if (dateUpdated > 0) {
      await pointsDb`
        WITH ranked AS (
          SELECT identity_id,
            ROW_NUMBER() OVER (ORDER BY ecosystem_score DESC) as new_rank
          FROM ecosystem_score_snapshots
          WHERE snapshot_date = ${date}::date AND multiplier > 0
        )
        UPDATE ecosystem_score_snapshots s
        SET rank = r.new_rank
        FROM ranked r
        WHERE s.identity_id = r.identity_id
          AND s.snapshot_date = ${date}::date
      `;
    }

    totalSnapshotUpdates += dateUpdated;
    console.log(`  ${date}: ${dateUpdated} snapshots corrected (of ${changed.length} changed)`);
  }

  console.log(`\n  Total snapshot corrections: ${totalSnapshotUpdates}`);

  // Update processing_state tx_count (do NOT touch last_tx_sequence)
  const totalNew = stats.inserted + faucetInserted;
  if (totalNew > 0) {
    await pointsDb`
      UPDATE processing_state
      SET tx_count = tx_count + ${totalNew}, processed_at = NOW()
      WHERE scanner_id = 'main'
    `;
  }

  console.log(`\n=== Backfill complete ===\n`);

  await indexerDb.end();
  await pointsDb.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
