/**
 * Backfill pado-dex activity_points for a date range using RPC.
 *
 * Standalone script that queries OrderPlaced / OrderCanceled events directly
 * from the blockchain and fills any gaps in activity_points. Idempotent
 * (ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   cd /home/ubuntu/explorer-api
 *   npx tsx src/scripts/backfill-dex.ts                  # defaults: 2026-04-01 to today
 *   npx tsx src/scripts/backfill-dex.ts 2026-04-11       # single date
 *   npx tsx src/scripts/backfill-dex.ts 2026-04-01 2026-04-12  # range
 */

import postgres from 'postgres';
import {
  getBasePoints,
  SCORE_CATEGORIES,
  GENESIS_PASS_MULTIPLIER,
} from '../config/points.js';
import { fetchWithOffload } from '../scanner/fetch-with-offload.js';

// --- Config ---

const RPC_URL = process.env.SUI_RPC_URL || process.env.VITE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io';
const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_KEY = process.env.WALLET_MAPPINGS_API_KEY;
const PAGE_SIZE = 50;
const MAX_PAGES = 500; // Higher cap for backfill (more events per day than nightly)

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, {
  max: 3,
  idle_timeout: 30,
  connect_timeout: 10,
  connection: { statement_timeout: 60000 },
});

// --- Base58 decode ---

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map<string, bigint>();
for (let i = 0; i < B58_ALPHABET.length; i++) {
  B58_MAP.set(B58_ALPHABET[i], BigInt(i));
}

function base58ToHex(b58: string): string {
  let n = 0n;
  for (const c of b58) {
    const v = B58_MAP.get(c);
    if (v === undefined) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + v;
  }
  return '0x' + n.toString(16).padStart(64, '0');
}

// --- RPC helper ---

let reqId = 0;

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const id = ++reqId;
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  return json.result as T;
}

// --- Types ---

interface RpcEvent {
  id: { txDigest: string; eventSeq: string };
  sender: string;
  timestampMs: string;
}

interface RpcQueryResult {
  data: RpcEvent[];
  nextCursor: { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

interface DexQuery {
  moveEventType: string;
  category: string;
  activityType: string;
}

const PKG_DEEPBOOK = '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134';

const DEX_QUERIES: DexQuery[] = [
  { moveEventType: `${PKG_DEEPBOOK}::order_info::OrderPlaced`, category: 'pado-dex', activityType: 'limit-order' },
  { moveEventType: `${PKG_DEEPBOOK}::order::OrderCanceled`, category: 'pado-dex', activityType: 'cancel-order' },
];

const REFERRAL_SF = 0.5;

// --- Wallet mappings ---

async function loadWallets(): Promise<{
  walletMap: Map<string, string>;
  genesisPassSet: Set<string>;
}> {
  if (!WALLET_MAPPINGS_URL) {
    console.error('WALLET_MAPPINGS_URL not set');
    process.exit(1);
  }

  const data = await fetchWithOffload<{
    wallets: Record<string, string>;
    genesisPass: string[];
  }>({
    url: WALLET_MAPPINGS_URL,
    apiKey: WALLET_MAPPINGS_KEY,
    label: 'BackfillDex',
  });

  if (!data) {
    console.error('Failed to fetch wallet mappings');
    process.exit(1);
  }

  const walletMap = new Map<string, string>();
  for (const [addr, id] of Object.entries(data.wallets)) {
    walletMap.set(addr.toLowerCase(), id);
  }

  const genesisPassSet = new Set(
    data.genesisPass.filter((v: unknown) => typeof v === 'string'),
  );

  console.log(`Loaded ${walletMap.size} wallets, ${genesisPassSet.size} genesis pass holders`);
  return { walletMap, genesisPassSet };
}

// --- Reconcile one date ---

async function reconcileDate(
  targetDate: string,
  walletMap: Map<string, string>,
  genesisPassSet: Set<string>,
): Promise<number> {
  const dayStartMs = new Date(`${targetDate}T00:00:00Z`).getTime();
  const dayEndMs = dayStartMs + 86_400_000;

  // Load existing (identity, category) pairs for this date
  const existingRows = await db`
    SELECT DISTINCT identity_id, category
    FROM activity_points
    WHERE tx_timestamp >= ${targetDate}::date
      AND tx_timestamp < (${targetDate}::date + interval '1 day')
      AND category = 'pado-dex'
      AND base_points > 0 AND NOT flagged
  `;
  const existing = new Set<string>();
  for (const r of existingRows) {
    existing.add(`${r.identity_id}::${r.category}`);
  }

  let totalFilled = 0;

  for (const eq of DEX_QUERIES) {
    const basePoints = getBasePoints(eq.category, eq.activityType);
    if (basePoints === 0) continue;

    let cursor: { txDigest: string; eventSeq: string } | null = null;
    let pages = 0;
    let filled = 0;

    try {
      // Descending order: most recent first, page back to target date
      while (pages < MAX_PAGES) {
        const result = await rpcCall<RpcQueryResult>('suix_queryEvents', [
          { MoveEventType: eq.moveEventType },
          cursor,
          PAGE_SIZE,
          true, // descending
        ]);
        pages++;

        if (!result || result.data.length === 0) break;

        let pastTargetDate = false;

        for (const event of result.data) {
          const ts = Number(event.timestampMs);

          if (ts >= dayEndMs) continue;
          if (ts < dayStartMs) {
            pastTargetDate = true;
            break;
          }

          const wallet = event.sender?.toLowerCase();
          if (!wallet || wallet === '0x0000000000000000000000000000000000000000000000000000000000000000') continue;

          const identityId = walletMap.get(wallet);
          if (!identityId) continue;

          // Daily category cap
          const capKey = `${identityId}::${eq.category}`;
          if (existing.has(capKey)) continue;

          const isScoreCat = SCORE_CATEGORIES.has(eq.category);
          const genesisMult = isScoreCat && genesisPassSet.has(identityId)
            ? GENESIS_PASS_MULTIPLIER : 1.0;
          const finalPoints = isScoreCat
            ? (basePoints * genesisMult).toFixed(2)
            : '1.00';

          let txDigest: string;
          try {
            txDigest = base58ToHex(event.id.txDigest);
          } catch {
            continue;
          }

          await db`
            INSERT INTO activity_points
              (wallet_address, identity_id, tx_digest, tx_sequence_number,
               category, activity_type, base_points, volume_tier,
               genesis_multiplier, final_points, tx_timestamp, event_seq)
            VALUES
              (${wallet}, ${identityId}, ${txDigest}, 0,
               ${eq.category}, ${eq.activityType}, ${basePoints}, 1.0,
               ${genesisMult}, ${finalPoints},
               ${new Date(ts)}::timestamptz, ${Number(event.id.eventSeq)})
            ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
          `;

          existing.add(capKey);
          filled++;
        }

        if (pastTargetDate || !result.hasNextPage) break;
        cursor = result.nextCursor;
      }
    } catch (err) {
      console.warn(`  ${eq.activityType} error: ${(err as Error).message}`);
    }

    if (filled > 0) {
      console.log(`  ${eq.activityType}: ${filled} gaps filled (${pages} pages)`);
    }

    totalFilled += filled;
  }

  // Correct snapshot if gaps were found
  if (totalFilled > 0) {
    // Refresh matview: recalculate ecosystem_daily_scores
    await db`REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores`;

    // Update snapshot where matview > snapshot
    const updated = await db`
      WITH new_scores AS (
        SELECT identity_id, base_score::int as new_base
        FROM ecosystem_daily_scores
        WHERE day = ${targetDate}::date
      )
      UPDATE ecosystem_score_snapshots s
      SET base_score = ns.new_base,
          ecosystem_score = (ns.new_base * s.multiplier + s.bonus_total + s.governance_bonus + s.referral_bonus * ${REFERRAL_SF})::numeric(10,2),
          is_backfilled = TRUE
      FROM new_scores ns
      WHERE s.identity_id = ns.identity_id
        AND s.snapshot_date = ${targetDate}::date
        AND s.base_score < ns.new_base
    `;
    if (updated.count > 0) {
      console.log(`  Snapshot: ${updated.count} rows updated`);
    }

    // Insert missing snapshot rows
    const inserted = await db`
      INSERT INTO ecosystem_score_snapshots
        (identity_id, snapshot_date, base_score, multiplier, bonus_total,
         referral_bonus, governance_bonus, ecosystem_score, is_penalized, rank, is_backfilled)
      SELECT
        d.identity_id, ${targetDate}::date, d.base_score::int,
        COALESCE(
          (SELECT s2.multiplier FROM ecosystem_score_snapshots s2
           WHERE s2.identity_id = d.identity_id AND s2.multiplier > 0
           ORDER BY ABS(s2.snapshot_date - ${targetDate}::date) LIMIT 1),
          0
        ),
        0, 0, 0, 0, FALSE, NULL, TRUE
      FROM ecosystem_daily_scores d
      LEFT JOIN ecosystem_score_snapshots s
        ON d.identity_id = s.identity_id AND s.snapshot_date = ${targetDate}::date
      WHERE d.day = ${targetDate}::date AND s.identity_id IS NULL
    `;
    if (inserted.count > 0) {
      console.log(`  Snapshot: ${inserted.count} new rows inserted`);
    }

    // Recalculate ecosystem_score for newly inserted rows
    await db`
      UPDATE ecosystem_score_snapshots
      SET ecosystem_score = (base_score * multiplier + bonus_total + governance_bonus + referral_bonus * ${REFERRAL_SF})::numeric(10,2)
      WHERE snapshot_date = ${targetDate}::date AND is_backfilled = TRUE AND ecosystem_score = 0 AND base_score > 0
    `;

    // Re-rank
    await db`
      WITH ranked AS (
        SELECT identity_id, ROW_NUMBER() OVER (ORDER BY ecosystem_score DESC) as new_rank
        FROM ecosystem_score_snapshots
        WHERE snapshot_date = ${targetDate}::date AND multiplier > 0
      )
      UPDATE ecosystem_score_snapshots s
      SET rank = r.new_rank
      FROM ranked r
      WHERE s.identity_id = r.identity_id AND s.snapshot_date = ${targetDate}::date
    `;
  }

  return totalFilled;
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  let startDate: string;
  let endDate: string;

  if (args.length === 0) {
    startDate = '2026-04-01';
    endDate = new Date().toISOString().slice(0, 10);
  } else if (args.length === 1) {
    startDate = args[0];
    endDate = args[0];
  } else {
    startDate = args[0];
    endDate = args[1];
  }

  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    console.error(`Invalid date format. Expected YYYY-MM-DD, got: ${startDate} / ${endDate}`);
    process.exit(1);
  }

  if (Number.isNaN(new Date(`${startDate}T00:00:00Z`).getTime()) ||
      Number.isNaN(new Date(`${endDate}T00:00:00Z`).getTime())) {
    console.error(`Invalid date value: ${startDate} / ${endDate}`);
    process.exit(1);
  }

  console.log(`=== Pado DEX Backfill: ${startDate} to ${endDate} ===\n`);

  const { walletMap, genesisPassSet } = await loadWallets();

  // Generate date range
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  let grandTotal = 0;

  for (const date of dates) {
    process.stdout.write(`${date}: `);
    const filled = await reconcileDate(date, walletMap, genesisPassSet);
    if (filled === 0) {
      console.log('no gaps');
    } else {
      console.log(`${filled} total gaps filled`);
    }
    grandTotal += filled;
  }

  console.log(`\n=== Done. ${grandTotal} total gaps filled across ${dates.length} days ===`);
  await db.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
