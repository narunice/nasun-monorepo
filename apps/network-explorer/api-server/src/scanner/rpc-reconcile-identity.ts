/**
 * Per-identity, today-window reconcile.
 *
 * Triggered by:
 *   - POST /api/v1/internal/wallet-registered (registerWallet Lambda webhook)
 *   - POST /api/v1/ecosystem/sync (TODAY BREAKDOWN refresh button)
 *
 * Scope: fills gaps for a single identity's activity in `targetDate` (UTC),
 * across three sources: RPC events, RPC faucet detection, RPC wallet-transfer
 * detection. Uses RPC (Sui fullnode) throughout — the sui-indexer SQL tables
 * (tx_calls_fun, tx_affected_addresses) are unreliable because they are pruned
 * and do not index all user wallet transactions.
 *
 * Daily category cap is preserved by checking `activity_points` for
 * already-recorded (identity, category) pairs first.
 *
 * This is the focused complement to {@link reconcileFromRpc} (which does the
 * full daily safety-net for ALL identities). That function is too expensive
 * to run on every wallet registration; this one is bounded by a single
 * identity's wallet count and runs in seconds.
 */

import { pointsDb } from '../db.js';
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

interface RpcTxBlock {
  digest: string;
  timestampMs?: string;
  transaction?: {
    data?: {
      transaction?: {
        kind: string;
        transactions?: Array<Record<string, unknown>>;
      };
    };
  };
  effects?: { status?: { status: string } };
}

interface RpcTxQueryResult {
  data: RpcTxBlock[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

const PAGE_SIZE = 50;
const MAX_PAGES_PER_WALLET = 20; // bounded; today-window is small

// Faucet module names (upgrade-safe: match by module, not package ID).
const FAUCET_MODULES = new Set(['faucet', 'faucet_v2']);

// Excluded modules for wallet-transfer detection (mirrors faucet-scanner.ts).
const EXCLUDED_TRANSFER_MODULES = new Set(WALLET_TRANSFER_EXCLUDED_MODULES);

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

  // --- Faucet + wallet-transfer sweep (RPC-based; indexer SQL is unreliable) ---
  // The sui-indexer's tx_calls_fun and tx_affected_addresses tables are pruned
  // and do not index all user wallet transactions. Use suix_queryTransactionBlocks
  // (Fullnode RPC) instead, mirroring the frontend's useDailyMissions hook.
  const needFaucet = !existing.has('faucet');
  const needWalletTransfer = !existing.has('wallet-transfer');
  if (needFaucet || needWalletTransfer) {
    const ownSet = new Set(wallets);
    for (const wallet of wallets) {
      if (!needFaucet && !needWalletTransfer) break;
      if (existing.has('faucet') && existing.has('wallet-transfer')) break;
      try {
        let cursor: string | null | undefined = undefined;
        let pages = 0;
        loop: while (pages < MAX_PAGES_PER_WALLET) {
          const result: RpcTxQueryResult = await rpcCall<RpcTxQueryResult>('suix_queryTransactionBlocks', [
            { filter: { FromAddress: wallet } },
            cursor ?? null,
            PAGE_SIZE,
            true, // descending
          ]);

          if (!result || result.data.length === 0) break;

          for (const tx of result.data) {
            const ts = Number(tx.timestampMs ?? 0);
            if (ts >= dayEndMs) continue;
            if (ts < dayStartMs) break loop; // passed today's window

            if (tx.effects?.status?.status === 'failure') continue;

            const txData = tx.transaction?.data?.transaction;
            if (!txData || txData.kind !== 'ProgrammableTransaction') continue;
            const commands = (txData.transactions ?? []) as Array<Record<string, unknown>>;

            const hasFaucetCall = commands.some(
              (cmd) =>
                'MoveCall' in cmd &&
                FAUCET_MODULES.has((cmd.MoveCall as { module: string }).module) &&
                ((cmd.MoveCall as { function: string }).function ?? '').startsWith('request_'),
            );
            const hasTransfer = commands.some((cmd) => 'TransferObjects' in cmd);
            const hasExcludedCall = commands.some(
              (cmd) =>
                'MoveCall' in cmd &&
                EXCLUDED_TRANSFER_MODULES.has(
                  (cmd.MoveCall as { module: string }).module,
                ),
            );

            if (!existing.has('faucet') && hasFaucetCall) {
              let txDigestHex: string;
              try { txDigestHex = base58ToHex(tx.digest); } catch { continue; }
              existing.add('faucet');
              inserts.push({
                wallet_address: wallet,
                identity_id: identityId,
                tx_digest: `faucet:${txDigestHex}`,
                tx_sequence_number: 0,
                category: 'faucet',
                activity_type: 'claim',
                base_points: 1,
                volume_tier: 1.0,
                genesis_multiplier: 1.0,
                final_points: '1.00',
                tx_timestamp: new Date(ts),
                event_seq: 0,
              });
            }

            if (!existing.has('wallet-transfer') && hasTransfer && !hasExcludedCall) {
              const dateStr = new Date(ts).toISOString().slice(0, 10);
              existing.add('wallet-transfer');
              inserts.push({
                wallet_address: wallet,
                identity_id: identityId,
                tx_digest: `wt:${identityId}:${dateStr}`,
                tx_sequence_number: 0,
                category: 'wallet-transfer',
                activity_type: 'transfer',
                base_points: 1,
                volume_tier: 1.0,
                genesis_multiplier: 1.0,
                final_points: '1.00',
                tx_timestamp: new Date(ts),
                event_seq: 0,
              });
            }

            if (existing.has('faucet') && existing.has('wallet-transfer')) break loop;
          }

          if (!result.hasNextPage) break;
          cursor = result.nextCursor;
          pages++;
        }
      } catch (err) {
        console.warn(
          `[ReconcileIdentity] TX sweep error wallet=${wallet}: ${(err as Error).message}`,
        );
      }
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
