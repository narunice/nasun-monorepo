/**
 * Faucet Activity Scanner
 *
 * Detects token faucet claims by querying the indexer's tx_calls_fun table
 * for Move function calls to known faucet packages/modules.
 *
 * Faucet contracts (devnet_tokens::faucet, devnet_tokens_v2::faucet_v2)
 * do NOT emit Move events, so the event-based scanner cannot detect them.
 * This module scans tx_calls_fun directly instead.
 *
 * Design:
 * - Runs once per scanLoop, after event batch processing
 * - Uses the indexer DB (sql) to find faucet calls by registered wallets
 * - Applies dailyCategorySeen cap (shared with main scanner)
 * - Synthetic tx_digest format: faucet:{walletAddress}:{YYYY-MM-DD}
 * - Idempotency: UNIQUE(tx_digest, activity_type, event_seq) + ON CONFLICT DO NOTHING
 */

import { sql, pointsDb } from '../db.js';
import type { PointsInsert } from './referral-bonus.js';

// All known package IDs (hex, no 0x prefix) for faucet contracts.
// tx_calls_fun stores the RUNTIME (upgraded) package ID, not the original.
// Must include all upgrade versions.
const FAUCET_PKG_IDS = [
  '1c93579be99e89ab05a33ac04af2fd7b1a604f9c98fe74d1b6cae6913c8362e7', // tokens V1 current
  '7f8dba64318adb8042b266d52d372b4b876778aa7f27f7e37847cc15611f75b2', // tokens V1 older
  'd3256ab6c7013402f258870188e15e69bd881c534e913c1ee7d991f4f9e6ab0f', // tokens V2 current
  'bf33cac7b8ccb22d398a6dedc3e159ed68bc1804bf0726516360e7e0b9dcb474', // tokens V2 older
  '2e08785948d44afb14f912a6bfd6bca0dc83f0d623b290ed1b7d0f57a7dced5d', // tokens V2 older
  'c2d09b5e026b1d8378e8f70333e8e74ed3b5798715caa284bcb82d22cb60b78e', // tokens V2 older
].map((hex) => Buffer.from(hex, 'hex'));

// Track scanner position (persisted in processing_state)
let lastFaucetSeq = 0;

/**
 * Scan for faucet claims and insert activity points.
 *
 * @param registeredWallets - Map<walletAddress, identityId>
 * @param dailyCategorySeen - Shared daily cap Set from main scanner
 * @returns Number of points rows inserted
 */
export async function scanFaucetClaims(
  registeredWallets: Map<string, string>,
  dailyCategorySeen: Set<string>,
): Promise<number> {
  if (!pointsDb || registeredWallets.size === 0) return 0;

  // Initialize position from processing_state on first run
  if (lastFaucetSeq === 0) {
    const [row] = await pointsDb`
      SELECT last_tx_sequence FROM processing_state WHERE scanner_id = 'faucet'
    `;
    lastFaucetSeq = Number(row?.last_tx_sequence ?? 0);

    // Seed the row if it doesn't exist yet
    if (!row) {
      await pointsDb`
        INSERT INTO processing_state (scanner_id, last_tx_sequence, processed_at)
        VALUES ('faucet', 0, NOW())
        ON CONFLICT (scanner_id) DO NOTHING
      `;
    }
  }

  // Use indexer's latest sequence as upper bound (independent of event scanner)
  const [maxRow] = await sql`
    SELECT MAX(tx_sequence_number)::bigint as max_seq FROM tx_calls_fun
  `;
  const maxSeq = Number(maxRow?.max_seq ?? 0);
  if (lastFaucetSeq >= maxSeq) return 0;

  // Query tx_calls_fun for faucet function calls
  // V1: devnet_tokens::faucet, V2: devnet_tokens_v2::faucet_v2
  const rows = await sql`
    SELECT DISTINCT
      c.tx_sequence_number::bigint as tx_sequence_number,
      encode(c.sender, 'hex') as sender_hex,
      encode(t.transaction_digest, 'hex') as tx_digest_hex,
      t.timestamp_ms::text as timestamp_ms
    FROM tx_calls_fun c
    JOIN transactions t ON c.tx_sequence_number = t.tx_sequence_number
    WHERE c.tx_sequence_number > ${lastFaucetSeq}
      AND c.tx_sequence_number <= ${maxSeq}
      AND c.package IN ${sql(FAUCET_PKG_IDS)}
      AND c.module IN ('faucet', 'faucet_v2')
      AND c.func LIKE 'request_%'
    ORDER BY c.tx_sequence_number
    LIMIT 500
  `;

  if (rows.length === 0) {
    lastFaucetSeq = maxSeq;
    await updateFaucetState(maxSeq);
    return 0;
  }

  const inserts: PointsInsert[] = [];
  const pendingCapKeys: string[] = [];

  for (const row of rows) {
    const walletAddress = `0x${row.sender_hex}`;
    const identityId = registeredWallets.get(walletAddress.toLowerCase());
    if (!identityId) continue;

    // Daily category cap (shared with main scanner). Key MUST match
    // processBatch's 3-part format so the warm-up Set is honored and
    // self-added keys naturally expire on date rollover.
    const txDate = new Date(Number(row.timestamp_ms)).toISOString().slice(0, 10);
    const capKey = `${identityId}::faucet::${txDate}`;
    if (dailyCategorySeen.has(capKey)) continue;

    // Faucet is a base category: existence-only, final_points always 1
    const basePoints = 1;
    const genesisMult = 1.0;
    const finalPoints = '1.00';

    inserts.push({
      wallet_address: walletAddress,
      identity_id: identityId,
      tx_digest: `faucet:0x${row.tx_digest_hex}`,
      tx_sequence_number: row.tx_sequence_number,
      category: 'faucet',
      activity_type: 'claim',
      base_points: basePoints,
      volume_tier: 1.0,
      genesis_multiplier: genesisMult,
      final_points: finalPoints,
      tx_timestamp: new Date(Number(row.timestamp_ms)),
      event_seq: 0,
    });
    pendingCapKeys.push(capKey);
  }

  if (inserts.length > 0) {
    await pointsDb`
      INSERT INTO activity_points ${pointsDb(inserts,
        'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number',
        'category', 'activity_type', 'base_points', 'volume_tier',
        'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq'
      )}
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    // Only mark the cap after the INSERT settles. If the INSERT throws (PG
    // connection drop, statement timeout), the cap stays clear so the next
    // cycle can retry the same rows. lastFaucetSeq below is also unchanged
    // on throw, keeping the cursor on the un-inserted batch.
    for (const k of pendingCapKeys) dailyCategorySeen.add(k);
  }

  const newLastSeq = rows[rows.length - 1].tx_sequence_number;
  lastFaucetSeq = newLastSeq;
  await updateFaucetState(newLastSeq);

  if (inserts.length > 0) {
    console.log(`[Faucet] Detected ${inserts.length} faucet claims`);
  }

  return inserts.length;
}

/**
 * Reset faucet scanner position (called on chain reset).
 */
export function resetFaucetScanner(): void {
  lastFaucetSeq = 0;
}

async function updateFaucetState(lastSeq: number): Promise<void> {
  if (!pointsDb) return;
  await pointsDb`
    UPDATE processing_state
    SET last_tx_sequence = ${lastSeq}, processed_at = NOW()
    WHERE scanner_id = 'faucet'
  `;
}
