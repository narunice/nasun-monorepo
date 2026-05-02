/**
 * Per-identity, today-window reconcile.
 *
 * Triggered by:
 *   - POST /api/v1/internal/wallet-registered (registerWallet Lambda webhook)
 *   - POST /api/v1/ecosystem/sync (TODAY BREAKDOWN refresh button)
 *
 * Scope: fills gaps for a single identity's activity in `targetDate` (UTC),
 * across the three sources the live scanner skips when a wallet wasn't yet
 * in the wallet-cache: RPC events, faucet (tx_calls_fun), wallet-transfer
 * (tx_affected_addresses). Daily category cap is preserved by checking
 * `activity_points` for already-recorded (identity, category) pairs first.
 *
 * This is the focused complement to {@link reconcileFromRpc} (which does the
 * full daily safety-net for ALL identities). That function is too expensive
 * to run on every wallet registration; this one is bounded by a single
 * identity's wallet count and runs in seconds.
 */

import { sql, pointsDb } from '../db.js';
import { rpcCall } from '../rpc.js';
import {
  getBasePoints,
  getEventMapping,
  IGNORED_EVENT_KEYS,
  SCORE_CATEGORIES,
  GENESIS_PASS_MULTIPLIER,
  WALLET_TRANSFER_EXCLUDED_MODULES,
} from '../config/points.js';
import {
  hasGenesisPass,
  getActivationsCacheSize,
} from './ecosystem-cache.js';

interface RpcEvent {
  id: { txDigest: string; eventSeq: string };
  packageId: string;
  transactionModule: string;
  type: string; // e.g. 0xpkg::module::Type
  sender: string;
  timestampMs: string;
}

interface RpcQueryResult {
  data: RpcEvent[];
  nextCursor: { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

const PAGE_SIZE = 50;
const MAX_PAGES_PER_WALLET = 20; // bounded; today-window is small

// Faucet packages duplicated from faucet-scanner. Kept inline to avoid an
// export from a module whose internal hex/bytea conversion is private.
const FAUCET_PKG_HEX = [
  '1c93579be99e89ab05a33ac04af2fd7b1a604f9c98fe74d1b6cae6913c8362e7',
  '7f8dba64318adb8042b266d52d372b4b876778aa7f27f7e37847cc15611f75b2',
  'd3256ab6c7013402f258870188e15e69bd881c534e913c1ee7d991f4f9e6ab0f',
  'bf33cac7b8ccb22d398a6dedc3e159ed68bc1804bf0726516360e7e0b9dcb474',
  '2e08785948d44afb14f912a6bfd6bca0dc83f0d623b290ed1b7d0f57a7dced5d',
  'c2d09b5e026b1d8378e8f70333e8e74ed3b5798715caa284bcb82d22cb60b78e',
];

// Base58 decode for txDigest (mirrors rpc-reconcile.ts).
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map<string, bigint>();
for (let i = 0; i < B58_ALPHABET.length; i++) B58_MAP.set(B58_ALPHABET[i], BigInt(i));
function base58ToHex(b58: string): string {
  let n = 0n;
  for (const c of b58) {
    const v = B58_MAP.get(c);
    if (v === undefined) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + v;
  }
  return `0x${n.toString(16).padStart(64, '0')}`;
}

interface InsertRow {
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

/**
 * Fill today's gaps for a single identity. Idempotent (ON CONFLICT DO NOTHING).
 * Returns the number of activity_points rows inserted.
 */
export async function reconcileTodayForIdentity(
  targetDate: string,
  identityId: string,
  walletAddresses: string[],
): Promise<number> {
  if (!pointsDb || walletAddresses.length === 0) return 0;

  const wallets = walletAddresses.map((w) => w.toLowerCase());
  const dayStartMs = new Date(`${targetDate}T00:00:00Z`).getTime();
  const dayEndMs = dayStartMs + 86_400_000;

  // Existing categories already recorded today for this identity. Live scanner
  // enforces a 1-row-per-(identity,category)-per-day cap; we honor it here.
  const existingRows = await pointsDb`
    SELECT DISTINCT category
    FROM activity_points
    WHERE identity_id = ${identityId}
      AND tx_timestamp >= ${targetDate}::date
      AND tx_timestamp < (${targetDate}::date + interval '1 day')
      AND base_points > 0 AND NOT flagged
  `;
  const existing = new Set<string>(existingRows.map((r) => r.category as string));

  const inserts: InsertRow[] = [];

  // --- RPC events (per-wallet Sender filter) ---
  for (const wallet of wallets) {
    let cursor: { txDigest: string; eventSeq: string } | null = null;
    for (let page = 0; page < MAX_PAGES_PER_WALLET; page++) {
      let result: RpcQueryResult;
      try {
        result = await rpcCall<RpcQueryResult>('suix_queryEvents', [
          { Sender: wallet },
          cursor,
          PAGE_SIZE,
          true, // descending
        ]);
      } catch (err) {
        console.warn(
          `[ReconcileIdentity] RPC error wallet=${wallet}: ${(err as Error).message}`,
        );
        break;
      }
      if (!result || result.data.length === 0) break;

      let pastDay = false;
      for (const ev of result.data) {
        const ts = Number(ev.timestampMs);
        if (ts >= dayEndMs) continue;
        if (ts < dayStartMs) { pastDay = true; break; }

        // ev.type is "0xpkg::module::Type". Strip 0x for EVENT_MAPPING lookup.
        const typeParts = ev.type.split('::');
        if (typeParts.length !== 3) continue;
        const pkgHex = typeParts[0].replace(/^0x/, '');
        const module = typeParts[1];
        const typeName = typeParts[2];
        const eventKey = `${pkgHex}::${module}::${typeName}`;
        if (IGNORED_EVENT_KEYS.has(eventKey)) continue;

        const mapping = getEventMapping(pkgHex, module, typeName);
        if (!mapping) continue;
        if (existing.has(mapping.category)) continue;

        const basePoints = getBasePoints(mapping.category, mapping.activityType);
        if (basePoints === 0) continue;

        const isScoreCat = SCORE_CATEGORIES.has(mapping.category);
        if (isScoreCat && getActivationsCacheSize() === 0) continue;
        const genesisMult = isScoreCat && hasGenesisPass(identityId)
          ? GENESIS_PASS_MULTIPLIER : 1.0;
        const finalPoints = isScoreCat
          ? (basePoints * genesisMult).toFixed(2)
          : '1.00';

        let txDigest: string;
        try {
          txDigest = base58ToHex(ev.id.txDigest);
        } catch { continue; }

        existing.add(mapping.category); // local cap
        inserts.push({
          wallet_address: `0x${wallet.replace(/^0x/, '')}`,
          identity_id: identityId,
          tx_digest: txDigest,
          tx_sequence_number: 0,
          category: mapping.category,
          activity_type: mapping.activityType,
          base_points: basePoints,
          volume_tier: 1.0,
          genesis_multiplier: genesisMult,
          final_points: finalPoints,
          tx_timestamp: new Date(ts),
          event_seq: Number(ev.id.eventSeq),
        });
      }

      if (pastDay || !result.hasNextPage) break;
      cursor = result.nextCursor;
    }
  }

  // --- Faucet sweep (indexer-side; bypasses faucet-scanner cursor) ---
  if (!existing.has('faucet')) {
    try {
      const senderHex = wallets.map((w) => w.replace(/^0x/, ''));
      const dayStartIso = new Date(dayStartMs).toISOString();
      const dayEndIso = new Date(dayEndMs).toISOString();
      const faucetRows = await sql`
        SELECT DISTINCT
          encode(c.sender, 'hex') AS sender_hex,
          encode(t.transaction_digest, 'hex') AS tx_digest_hex,
          t.timestamp_ms::text AS timestamp_ms,
          c.tx_sequence_number::bigint AS tx_sequence_number
        FROM tx_calls_fun c
        JOIN transactions t USING (tx_sequence_number)
        WHERE c.sender = ANY(ARRAY(
            SELECT decode(x, 'hex') FROM unnest(${senderHex}::text[]) x
          ))
          AND c.package = ANY(ARRAY(
            SELECT decode(x, 'hex') FROM unnest(${FAUCET_PKG_HEX}::text[]) x
          ))
          AND c.module IN ('faucet', 'faucet_v2')
          AND c.func LIKE 'request_%'
          AND t.timestamp_ms >= ${dayStartIso}::timestamptz
          AND t.timestamp_ms <  ${dayEndIso}::timestamptz
        ORDER BY c.tx_sequence_number
        LIMIT 1
      `;
      if (faucetRows.length > 0) {
        const r = faucetRows[0];
        existing.add('faucet');
        inserts.push({
          wallet_address: `0x${r.sender_hex}`,
          identity_id: identityId,
          tx_digest: `faucet:0x${r.tx_digest_hex}`,
          tx_sequence_number: Number(r.tx_sequence_number),
          category: 'faucet',
          activity_type: 'claim',
          base_points: 1,
          volume_tier: 1.0,
          genesis_multiplier: 1.0,
          final_points: '1.00',
          tx_timestamp: new Date(Number(r.timestamp_ms)),
          event_seq: 0,
        });
      }
    } catch (err) {
      console.warn(`[ReconcileIdentity] Faucet sweep error: ${(err as Error).message}`);
    }
  }

  // --- Wallet-transfer sweep (peer transfer to non-self address) ---
  if (!existing.has('wallet-transfer')) {
    try {
      const senderHex = wallets.map((w) => w.replace(/^0x/, ''));
      const excludedModules = [...WALLET_TRANSFER_EXCLUDED_MODULES];
      const dayStartIso = new Date(dayStartMs).toISOString();
      const dayEndIso = new Date(dayEndMs).toISOString();
      const wtRows = await sql`
        SELECT
          encode(ta.sender, 'hex') AS sender_hex,
          encode(ta.affected, 'hex') AS affected_hex,
          ta.tx_sequence_number::bigint AS tx_sequence_number,
          t.timestamp_ms::text AS timestamp_ms
        FROM tx_affected_addresses ta
        JOIN transactions t USING (tx_sequence_number)
        WHERE ta.sender = ANY(ARRAY(
            SELECT decode(x, 'hex') FROM unnest(${senderHex}::text[]) x
          ))
          AND ta.affected != ta.sender
          AND t.timestamp_ms >= ${dayStartIso}::timestamptz
          AND t.timestamp_ms <  ${dayEndIso}::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM tx_calls_fun tcf
            WHERE tcf.tx_sequence_number = ta.tx_sequence_number
              AND tcf.module = ANY(${excludedModules}::text[])
          )
        ORDER BY ta.tx_sequence_number
        LIMIT 50
      `;
      // Exclude transfers between identity's own wallets (peer recipient must
      // not also be one of this identity's registered wallets).
      const ownSet = new Set(wallets.map((w) => w.replace(/^0x/, '')));
      for (const r of wtRows) {
        if (ownSet.has(r.affected_hex)) continue;
        const dateStr = new Date(Number(r.timestamp_ms)).toISOString().slice(0, 10);
        existing.add('wallet-transfer');
        inserts.push({
          wallet_address: `0x${r.sender_hex}`,
          identity_id: identityId,
          tx_digest: `wt:${identityId}:${dateStr}`,
          tx_sequence_number: Number(r.tx_sequence_number),
          category: 'wallet-transfer',
          activity_type: 'transfer',
          base_points: 1,
          volume_tier: 1.0,
          genesis_multiplier: 1.0,
          final_points: '1.00',
          tx_timestamp: new Date(Number(r.timestamp_ms)),
          event_seq: 0,
        });
        break; // one wallet-transfer per identity per day
      }
    } catch (err) {
      console.warn(`[ReconcileIdentity] Wallet-transfer sweep error: ${(err as Error).message}`);
    }
  }

  if (inserts.length === 0) return 0;

  const result = await pointsDb`
    INSERT INTO activity_points ${pointsDb(inserts,
      'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number',
      'category', 'activity_type', 'base_points', 'volume_tier',
      'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq',
    )}
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;
  return result.count;
}
