/**
 * Pado Leaderboard -> Ecosystem Bonus Points Settlement Script
 *
 * Fetches the Pado points leaderboard, calculates delta from previous snapshot,
 * and distributes bonus points to top performers.
 *
 * Distribution (2-tier, rank 1-300):
 *   Top 100:  50% of pool, equally split
 *   Rest 200: 50% of pool, equally split
 *
 * Default pools:
 *   Weekly:  5,000 pts
 *   Monthly: 10,000 pts
 * Override with --pool flag (e.g. --pool 25000)
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/settle-pado.ts --period weekly
 *   npx tsx src/scripts/settle-pado.ts --period weekly --pool 25000
 *   npx tsx src/scripts/settle-pado.ts --period weekly --dry-run
 */

import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

// --- Config ---

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_KEY = process.env.WALLET_MAPPINGS_API_KEY;

// Pado chat-server points API (accessible from node-3 via localhost or pado.finance)
const PADO_POINTS_URL = process.env.PADO_POINTS_URL || 'https://pado.finance/chat/api/leaderboard/points';

const DEFAULT_POOLS = {
  weekly: { size: 5_000, topN: 100, maxRank: 300, topShare: 0.5 },
  monthly: { size: 10_000, topN: 100, maxRank: 300, topShare: 0.5 },
};

const SNAPSHOT_DIR = path.join(process.cwd(), 'data', 'pado-snapshots');

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, {
  max: 3,
  idle_timeout: 30,
  connect_timeout: 10,
});

// --- Args ---

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const period = getArg('period');
const dryRun = args.includes('--dry-run');
const poolOverride = getArg('pool');

if (!period || (period !== 'weekly' && period !== 'monthly')) {
  console.error('Usage: npx tsx src/scripts/settle-pado.ts --period weekly|monthly [--pool N] [--dry-run]');
  process.exit(1);
}

// --- Helpers ---

interface PadoTrader {
  address: string;
  totalPoints: number;
  rank: number;
}

interface Snapshot {
  date: string;
  period: string;
  traders: Array<{ address: string; points: number }>;
}

async function fetchPadoLeaderboard(): Promise<PadoTrader[]> {
  const res = await fetch(`${PADO_POINTS_URL}?limit=1000`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Pado API error: ${res.status}`);
  const json = await res.json() as { traders: PadoTrader[] };
  return json.traders || [];
}

async function fetchWalletMappings(): Promise<Map<string, string>> {
  if (!WALLET_MAPPINGS_URL) return new Map();
  const headers: Record<string, string> = {};
  if (WALLET_MAPPINGS_KEY) headers['x-api-key'] = WALLET_MAPPINGS_KEY;

  const res = await fetch(WALLET_MAPPINGS_URL, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Wallet mappings error: ${res.status}`);
  const json = await res.json() as { wallets: Record<string, string> };

  // Reverse: walletAddress -> identityId
  const map = new Map<string, string>();
  for (const [addr, id] of Object.entries(json.wallets || {})) {
    map.set(addr.toLowerCase(), id);
  }
  return map;
}

function loadPreviousSnapshot(snapshotPeriod: string): Snapshot | null {
  if (!fs.existsSync(SNAPSHOT_DIR)) return null;
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => f.startsWith(`pado-${snapshotPeriod}-`) && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  const data = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, files[0]), 'utf-8'));
  return data as Snapshot;
}

function saveSnapshot(snapshotPeriod: string, traders: PadoTrader[]): void {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
  const date = new Date().toISOString().slice(0, 10);
  const snapshot: Snapshot = {
    date,
    period: snapshotPeriod,
    traders: traders.map(t => ({ address: t.address, points: t.totalPoints })),
  };
  const filename = `pado-${snapshotPeriod}-${date}.json`;
  fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot saved: ${filename}`);
}

// --- Main ---

async function main() {
  console.log(`\n=== Pado Leaderboard Settlement (${period}, ${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Fetch current Pado leaderboard
  console.log('Fetching Pado points leaderboard...');
  const traders = await fetchPadoLeaderboard();
  console.log(`  ${traders.length} traders found`);

  if (traders.length === 0) {
    console.log('No traders found. Exiting.');
    process.exit(0);
  }

  // 2. Load previous snapshot and compute deltas
  const prev = loadPreviousSnapshot(period!);
  let deltas: Map<string, number>;

  if (prev) {
    console.log(`Previous snapshot: ${prev.date} (${prev.traders.length} traders)`);
    const prevMap = new Map(prev.traders.map(t => [t.address.toLowerCase(), t.points]));
    deltas = new Map();
    for (const t of traders) {
      const prevPts = prevMap.get(t.address.toLowerCase()) ?? 0;
      const delta = t.totalPoints - prevPts;
      if (delta > 0) deltas.set(t.address.toLowerCase(), delta);
    }
    console.log(`  ${deltas.size} traders with positive delta`);
  } else {
    console.log('No previous snapshot found. Using absolute points for first settlement.');
    deltas = new Map(traders.map(t => [t.address.toLowerCase(), t.totalPoints]));
  }

  // 3. Rank by delta and distribute
  const allRanked = [...deltas.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, d]) => d > 0);

  if (allRanked.length === 0) {
    console.log('No positive deltas. Saving snapshot and exiting.');
    if (!dryRun) saveSnapshot(period!, traders);
    process.exit(0);
  }

  const pool = DEFAULT_POOLS[period as keyof typeof DEFAULT_POOLS];
  const poolSize = poolOverride ? parseInt(poolOverride, 10) : pool.size;

  // Cap eligible traders at maxRank
  const ranked = allRanked.slice(0, pool.maxRank);
  const topN = Math.min(pool.topN, ranked.length);
  const restCount = Math.max(ranked.length - topN, 0);

  // If everyone fits in top tier, use full pool for them
  const topPool = restCount > 0 ? poolSize * pool.topShare : poolSize;
  const restPool = restCount > 0 ? poolSize * (1 - pool.topShare) : 0;
  const topPerTrader = topN > 0 ? Math.round(topPool / topN) : 0;
  const restPerTrader = restCount > 0 ? Math.round(restPool / restCount) : 0;

  console.log(`\nDistribution (pool: ${poolSize.toLocaleString()} pts, eligible: ${ranked.length}/${allRanked.length}):`);
  console.log(`  Top ${topN}: ${topPerTrader.toLocaleString()} pts each (${topPool.toLocaleString()} total)`);
  console.log(`  Rest ${restCount}: ${restPerTrader.toLocaleString()} pts each (${restPool.toLocaleString()} total)`);

  // 4. Map wallet -> identityId
  console.log('\nFetching wallet mappings...');
  const walletMap = await fetchWalletMappings();
  console.log(`  ${walletMap.size} registered wallets`);

  // 5. Build inserts
  const dateStr = new Date().toISOString().slice(0, 10);
  const periodLabel = `${period}-${dateStr}`;
  let inserted = 0;
  let skipped = 0;

  console.log(`\n--- Settlement Results ---\n`);

  for (let i = 0; i < ranked.length; i++) {
    const [addr, delta] = ranked[i];
    const identityId = walletMap.get(addr);
    const pts = i < topN ? topPerTrader : restPerTrader;
    const rank = i + 1;

    if (!identityId) {
      skipped++;
      continue;
    }

    const digest = `bonus-pado:${identityId}:${periodLabel}`;
    const tag = rank <= topN ? `[TOP ${topN}]` : '';

    if (dryRun) {
      console.log(`  #${rank} ${addr.slice(0, 10)}... -> ${pts} pts ${tag} (delta: ${delta})`);
      inserted++;
      continue;
    }

    const result = await db`
      INSERT INTO activity_points
        (wallet_address, identity_id, tx_digest, category, activity_type,
         base_points, volume_tier, genesis_multiplier, final_points,
         tx_timestamp, event_seq, tx_sequence_number)
      VALUES
        (${addr}, ${identityId}, ${digest}, 'ecosystem-bonus-pado', ${period!},
         ${pts}, 1.0, 1.0, ${pts.toFixed(2)},
         NOW()::timestamptz, 0, 0)
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    if (result.count > 0) {
      inserted++;
      console.log(`  #${rank} ${addr.slice(0, 10)}... -> ${pts} pts ${tag}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`  Inserted: ${inserted}, Skipped (unregistered): ${skipped}`);

  // 6. Save snapshot
  if (!dryRun) {
    saveSnapshot(period!, traders);
  }

  await db.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
