/**
 * Wallet Transfer Activity Scanner (indexer SQL based)
 *
 * Detects peer token transfers by querying the Sui indexer's
 * `tx_affected_addresses` table directly: any tx whose sender is a
 * registered wallet and whose `affected` set includes at least one address
 * that is NOT the sender. Excludes txs containing MoveCalls into known
 * contract modules (faucet, pado, staking, etc.) — those are contract
 * interactions, not peer transfers, and their embedded TransferObjects is
 * a return-object handback, not a real send.
 *
 * Replaces the legacy RPC-based cursor scanner (`detectWalletTransfers` in
 * daily-nft-check.ts) which had to round-robin all registered wallets at
 * 500/loop. That approach scaled linearly with registered-wallet count and
 * hit 96-min worst-case at 48k wallets, projected 16+ hours at 10x scale.
 * Indexer SQL scans by delta (new tx_sequence_number since last cursor),
 * independent of registered-wallet count — O(today's tx volume).
 *
 * Design mirrors faucet-scanner.ts:
 * - processing_state(scanner_id='wallet-transfer') persistent cursor
 * - Self-seed cursor row on first run
 * - Compute own maxSeq via MAX(tx_sequence_number) on indexer DB
 * - LIMIT 500 per loop, advance cursor to last processed row
 * - Idempotent tx_digest: wt:{identity}:{YYYY-MM-DD} (identity+day unique)
 * - ON CONFLICT DO NOTHING on insert
 *
 * Honors the "1 identity ↔ N linked wallets" design: any linked wallet's
 * transfer credits the identity. App-level filter excludes transfers where
 * sender and recipient belong to the same identity (internal moves).
 */

import { sql, pointsDb } from '../db.js';
import { WALLET_TRANSFER_EXCLUDED_MODULES } from '../config/points.js';
import type { PointsInsert } from './referral-bonus.js';

// Track scanner position (persisted in processing_state)
let lastWalletTransferSeq = 0;

/**
 * Scan for qualifying peer transfers and insert activity_points rows.
 *
 * @param registeredWallets - Map<walletAddress, identityId> (lowercased, 0x-prefixed)
 * @returns Number of points rows inserted
 */
export async function scanWalletTransfersViaIndexer(
  registeredWallets: Map<string, string>,
): Promise<number> {
  if (!pointsDb || registeredWallets.size === 0) return 0;

  // Initialize position from processing_state on first run
  if (lastWalletTransferSeq === 0) {
    const [row] = await pointsDb`
      SELECT last_tx_sequence FROM processing_state
      WHERE scanner_id = 'wallet-transfer'
    `;
    lastWalletTransferSeq = Number(row?.last_tx_sequence ?? 0);

    // Seed the row if it doesn't exist yet
    if (!row) {
      await pointsDb`
        INSERT INTO processing_state (scanner_id, last_tx_sequence, processed_at)
        VALUES ('wallet-transfer', 0, NOW())
        ON CONFLICT (scanner_id) DO NOTHING
      `;
    }
  }

  // Compute own maxSeq from indexer (independent of event scanner).
  const [maxRow] = await sql`
    SELECT MAX(tx_sequence_number)::bigint AS max_seq
    FROM tx_affected_addresses
  `;
  const maxSeq = Number(maxRow?.max_seq ?? 0);
  if (lastWalletTransferSeq >= maxSeq) return 0;

  // Build bytea array of registered sender addresses for the SQL IN clause.
  // postgres.js doesn't auto-cast `Buffer[]` to `bytea[]` under the
  // `ANY()` operator, so use its `sql()` helper (same pattern faucet-scanner
  // uses at line 90) which materializes a typed array literal.
  const senderBytea = [...registeredWallets.keys()].map(
    (w) => Buffer.from(w.replace(/^0x/, ''), 'hex'),
  );
  const excludedModules = [...WALLET_TRANSFER_EXCLUDED_MODULES];

  // Main query: qualifying (sender, affected, tx) triples.
  // - sender ∈ registered, affected ≠ sender (external address touched)
  // - tx does NOT MoveCall into an excluded module (faucet, Pado, etc.)
  // - LIMIT 500 to bound per-loop work (matches faucet-scanner pattern).
  const rows = await sql`
    SELECT
      ta.tx_sequence_number::bigint AS tx_sequence_number,
      encode(ta.sender, 'hex') AS sender_hex,
      encode(ta.affected, 'hex') AS affected_hex,
      t.timestamp_ms::text AS timestamp_ms
    FROM tx_affected_addresses ta
    JOIN transactions t USING (tx_sequence_number)
    WHERE ta.sender IN ${sql(senderBytea)}
      AND ta.affected != ta.sender
      AND ta.tx_sequence_number > ${lastWalletTransferSeq}
      AND ta.tx_sequence_number <= ${maxSeq}
      AND NOT EXISTS (
        SELECT 1 FROM tx_calls_fun tcf
        WHERE tcf.tx_sequence_number = ta.tx_sequence_number
          AND tcf.module IN ${sql(excludedModules)}
      )
    ORDER BY ta.tx_sequence_number
    LIMIT 500
  `;

  if (rows.length === 0) {
    lastWalletTransferSeq = maxSeq;
    await updateWalletTransferState(maxSeq);
    return 0;
  }

  // App-level filter: self-identity transfers + identity-level dedup.
  // (tx_digest=wt:{identity}:{date} + ON CONFLICT handles cross-loop dedup,
  //  this Set just avoids inserting multiple rows for the same identity in
  //  the same batch — purely a perf optimization.)
  const inserts: PointsInsert[] = [];
  const seenIdentity = new Set<string>();
  let filteredSelf = 0;

  for (const row of rows) {
    const senderWallet = `0x${row.sender_hex}`;
    const affectedWallet = `0x${row.affected_hex}`;
    const senderId = registeredWallets.get(senderWallet.toLowerCase());
    if (!senderId) continue;
    if (seenIdentity.has(senderId)) continue;
    const affectedId = registeredWallets.get(affectedWallet.toLowerCase());
    if (affectedId === senderId) {
      // Same identity, different linked wallet — not a peer transfer.
      filteredSelf++;
      continue;
    }
    seenIdentity.add(senderId);

    const dateStr = new Date(Number(row.timestamp_ms)).toISOString().slice(0, 10);
    inserts.push({
      wallet_address: senderWallet,
      identity_id: senderId,
      tx_digest: `wt:${senderId}:${dateStr}`,
      tx_sequence_number: Number(row.tx_sequence_number),
      category: 'wallet-transfer',
      activity_type: 'transfer',
      base_points: 1,
      volume_tier: 1.0,
      genesis_multiplier: 1.0,
      final_points: '1.00',
      tx_timestamp: new Date(Number(row.timestamp_ms)),
      event_seq: 0,
    });
  }

  if (inserts.length > 0) {
    await pointsDb`
      INSERT INTO activity_points ${pointsDb(inserts,
        'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number',
        'category', 'activity_type', 'base_points', 'volume_tier',
        'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq',
      )}
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
  }

  // Advance cursor only after successful INSERT (ordering matters — if the
  // INSERT above throws, we don't reach this line and the cursor stays put
  // so the next loop retries the same range).
  const newLastSeq = Number(rows[rows.length - 1].tx_sequence_number);
  lastWalletTransferSeq = newLastSeq;
  await updateWalletTransferState(newLastSeq);

  if (inserts.length > 0) {
    console.log(
      `[WalletTransfer] Detected ${inserts.length} wallet-transfers ` +
      `(candidates=${rows.length} filtered_self=${filteredSelf} ` +
      `seq=${rows[0].tx_sequence_number}..${newLastSeq})`,
    );
  }

  return inserts.length;
}

/**
 * Reset scanner position (called on chain reset).
 */
export function resetWalletTransferScanner(): void {
  lastWalletTransferSeq = 0;
}

async function updateWalletTransferState(lastSeq: number): Promise<void> {
  if (!pointsDb) return;
  await pointsDb`
    UPDATE processing_state
    SET last_tx_sequence = ${lastSeq}, processed_at = NOW()
    WHERE scanner_id = 'wallet-transfer'
  `;
}
