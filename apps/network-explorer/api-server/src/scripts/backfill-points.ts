/**
 * RPC-based backfill script for on-chain activity points.
 *
 * Fills gaps where the indexer does not cover older checkpoints.
 * Uses suix_queryEvents to fetch all point-eligible events directly from RPC,
 * then inserts them into activity_points with ON CONFLICT DO NOTHING (idempotent).
 *
 * Usage: cd /home/ubuntu/explorer-api && npx tsx src/scripts/backfill-points.ts
 */

import postgres from 'postgres';
import {
  getBasePoints,
  GENESIS_PASS_MULTIPLIER,
} from '../config/points.js';

// --- Config ---

const RPC_URL = process.env.VITE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io';
const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_KEY = process.env.WALLET_MAPPINGS_API_KEY;
const PAGE_SIZE = 50; // RPC max per page

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

// --- Base58 decode (no external dependency) ---

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
  let hex = n.toString(16);
  // Pad to 64 chars (32 bytes)
  while (hex.length < 64) hex = '0' + hex;
  return '0x' + hex;
}

// --- Event type definitions ---

interface EventQuery {
  moveEventType: string;
  category: string;
  activityType: string;
  // Extract user wallet from event. Returns lowercase 0x-prefixed address.
  extractWallet: (event: RpcEvent) => string | null;
}

interface RpcEvent {
  id: { txDigest: string; eventSeq: string };
  sender: string;
  type: string;
  parsedJson: Record<string, unknown>;
  timestampMs: string;
}

// Package IDs (original, for event type queries)
const PKG = {
  governance: '0x3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3',
  governanceMultiChoice: '0xa1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a',
  deepbook: '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134',
  sui: '0x0000000000000000000000000000000000000000000000000000000000000003',
};

const fromParsedVoter = (e: RpcEvent) => {
  const v = e.parsedJson?.voter;
  return typeof v === 'string' ? v.toLowerCase() : null;
};
const fromParsedStaker = (e: RpcEvent) => {
  const v = e.parsedJson?.staker_address;
  return typeof v === 'string' ? v.toLowerCase() : null;
};
const fromSender = (e: RpcEvent) => {
  const s = e.sender;
  return s && s !== '0x0000000000000000000000000000000000000000000000000000000000000000'
    ? s.toLowerCase()
    : null;
};

const EVENT_QUERIES: EventQuery[] = [
  // Governance
  {
    moveEventType: `${PKG.governance}::proposal::VoteRegistered`,
    category: 'governance',
    activityType: 'vote',
    extractWallet: fromParsedVoter,
  },
  {
    moveEventType: `${PKG.governanceMultiChoice}::multi_choice_proposal::MultiChoiceVoteRegistered`,
    category: 'governance',
    activityType: 'vote',
    extractWallet: fromParsedVoter,
  },
  {
    moveEventType: `${PKG.governance}::delegation::DelegationCreated`,
    category: 'governance',
    activityType: 'delegate',
    extractWallet: fromSender,
  },
  // Staking
  {
    moveEventType: `${PKG.sui}::validator::StakingRequestEvent`,
    category: 'staking',
    activityType: 'delegate',
    extractWallet: fromParsedStaker,
  },
  {
    moveEventType: `${PKG.sui}::validator::UnstakingRequestEvent`,
    category: 'staking',
    activityType: 'unstake',
    extractWallet: fromParsedStaker,
  },
  // DEX
  {
    moveEventType: `${PKG.deepbook}::order_info::OrderPlaced`,
    category: 'pado-dex',
    activityType: 'limit-order',
    extractWallet: fromSender,
  },
  {
    moveEventType: `${PKG.deepbook}::order::OrderCanceled`,
    category: 'pado-dex',
    activityType: 'cancel-order',
    extractWallet: fromSender,
  },
];

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

  const headers: Record<string, string> = {};
  if (WALLET_MAPPINGS_KEY) headers['x-api-key'] = WALLET_MAPPINGS_KEY;

  const res = await fetch(WALLET_MAPPINGS_URL, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Wallet mappings fetch failed: ${res.status}`);

  const data = await res.json();
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

// --- RPC query ---

interface RpcQueryResult {
  data: RpcEvent[];
  nextCursor: { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

async function queryEvents(
  moveEventType: string,
  cursor: { txDigest: string; eventSeq: string } | null,
): Promise<RpcQueryResult> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_queryEvents',
      params: [{ MoveEventType: moveEventType }, cursor, PAGE_SIZE, false],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`RPC request failed: ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// --- Main ---

async function main() {
  console.log('=== Backfill Points from RPC ===\n');

  // 1. Fetch wallet mappings
  console.log('Fetching wallet mappings...');
  const { walletMap, genesisPassSet } = await fetchWalletMappings();
  console.log(`  ${walletMap.size} wallets, ${genesisPassSet.size} genesis pass holders\n`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalDuplicate = 0;

  // 2. Process each event type
  for (const eq of EVENT_QUERIES) {
    const basePoints = getBasePoints(eq.category, eq.activityType);
    if (basePoints === 0) {
      console.log(`[${eq.category}/${eq.activityType}] Skipping (0 points)`);
      continue;
    }

    const shortType = eq.moveEventType.split('::').slice(-2).join('::');
    console.log(`[${shortType}] Querying RPC... (${basePoints} base pts)`);

    let cursor: { txDigest: string; eventSeq: string } | null = null;
    let pageCount = 0;
    let typeInserted = 0;
    let typeSkipped = 0;

    while (true) {
      const result = await queryEvents(eq.moveEventType, cursor);
      pageCount++;

      if (result.data.length === 0) break;

      const inserts: {
        wallet_address: string;
        identity_id: string | null;
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
      }[] = [];

      for (const event of result.data) {
        const wallet = eq.extractWallet(event);
        if (!wallet) {
          typeSkipped++;
          continue;
        }

        const identityId = walletMap.get(wallet);
        if (!identityId) {
          typeSkipped++;
          continue;
        }

        const genesisMult = genesisPassSet.has(identityId)
          ? GENESIS_PASS_MULTIPLIER
          : 1.0;
        const finalPoints = (basePoints * genesisMult).toFixed(2);

        let txDigest: string;
        try {
          txDigest = base58ToHex(event.id.txDigest);
        } catch {
          console.warn(`  Invalid digest: ${event.id.txDigest}`);
          typeSkipped++;
          continue;
        }

        inserts.push({
          wallet_address: wallet,
          identity_id: identityId,
          tx_digest: txDigest,
          tx_sequence_number: 0, // Not available from RPC queryEvents
          category: eq.category,
          activity_type: eq.activityType,
          base_points: basePoints,
          volume_tier: 1.0,
          genesis_multiplier: genesisMult,
          final_points: finalPoints,
          tx_timestamp: new Date(Number(event.timestampMs)),
          event_seq: Number(event.id.eventSeq),
        });
      }

      if (inserts.length > 0) {
        const dbResult = await db`
          INSERT INTO activity_points ${db(
            inserts,
            'wallet_address',
            'identity_id',
            'tx_digest',
            'tx_sequence_number',
            'category',
            'activity_type',
            'base_points',
            'volume_tier',
            'genesis_multiplier',
            'final_points',
            'tx_timestamp',
            'event_seq',
          )}
          ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
        `;
        typeInserted += dbResult.count;
        totalDuplicate += inserts.length - dbResult.count;
      }

      if (!result.hasNextPage) break;
      cursor = result.nextCursor;
    }

    totalInserted += typeInserted;
    totalSkipped += typeSkipped;
    console.log(
      `  ${pageCount} pages, ${typeInserted} inserted, ${typeSkipped} skipped (unregistered)\n`,
    );
  }

  // 3. Update tx_count in processing_state
  if (totalInserted > 0) {
    await db`
      UPDATE processing_state
      SET tx_count = tx_count + ${totalInserted},
          processed_at = NOW()
      WHERE scanner_id = 'main'
    `;
  }

  // 4. Summary
  console.log('=== Summary ===');
  console.log(`  Inserted: ${totalInserted}`);
  console.log(`  Duplicates (skipped): ${totalDuplicate}`);
  console.log(`  Unregistered wallets (skipped): ${totalSkipped}`);

  // 5. Category breakdown
  const cats = await db`
    SELECT category, COUNT(*)::int as count, SUM(final_points)::text as total
    FROM activity_points
    WHERE NOT flagged
    GROUP BY category
    ORDER BY SUM(final_points) DESC
  `;
  console.log('\n=== Activity Points by Category ===');
  for (const c of cats) {
    console.log(`  ${c.category}: ${c.count} records, ${c.total} pts`);
  }

  await db.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
