/**
 * Ecosystem Points Airdrop Script
 *
 * Awards bonus points to all registered users as an airdrop event.
 * Default: 100 pts per user, 200 pts for Genesis Pass holders.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/airdrop-bonus.ts --event-id launch-v1
 *   npx tsx src/scripts/airdrop-bonus.ts --event-id launch-v1 --dry-run
 *   npx tsx src/scripts/airdrop-bonus.ts --event-id launch-v1 --amount 100 --genesis-amount 200
 */

import postgres from 'postgres';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_KEY = process.env.WALLET_MAPPINGS_API_KEY;
const ECOSYSTEM_ACTIVATIONS_URL = process.env.ECOSYSTEM_ACTIVATIONS_URL;
const ECOSYSTEM_ACTIVATIONS_API_KEY = process.env.ECOSYSTEM_ACTIVATIONS_API_KEY;

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });

// --- Args ---
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const eventId = getArg('event-id');
const amount = parseInt(getArg('amount') || '100', 10);
const genesisAmount = parseInt(getArg('genesis-amount') || '200', 10);
const dryRun = args.includes('--dry-run');

if (!eventId) {
  console.error('Usage: npx tsx src/scripts/airdrop-bonus.ts --event-id <id> [--amount N] [--genesis-amount N] [--dry-run]');
  process.exit(1);
}

async function fetchWalletMappings(): Promise<Map<string, string>> {
  if (!WALLET_MAPPINGS_URL) return new Map();
  const headers: Record<string, string> = {};
  if (WALLET_MAPPINGS_KEY) headers['x-api-key'] = WALLET_MAPPINGS_KEY;

  const res = await fetch(WALLET_MAPPINGS_URL, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Wallet mappings error: ${res.status}`);
  const json = await res.json() as { wallets: Record<string, string> };
  // walletAddress -> identityId
  const map = new Map<string, string>();
  for (const [addr, id] of Object.entries(json.wallets || {})) {
    map.set(id, addr.toLowerCase()); // reverse: identityId -> walletAddress
  }
  return map;
}

async function fetchGenesisHolders(): Promise<Set<string>> {
  if (!ECOSYSTEM_ACTIVATIONS_URL || !ECOSYSTEM_ACTIVATIONS_API_KEY) return new Set();
  const headers: Record<string, string> = { 'x-api-key': ECOSYSTEM_ACTIVATIONS_API_KEY };
  const res = await fetch(ECOSYSTEM_ACTIVATIONS_URL, { headers, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return new Set();
  const json = await res.json() as {
    activations: Record<string, Array<{ nftType: string }>>;
  };
  const genesisIds = new Set<string>();
  for (const [id, acts] of Object.entries(json.activations || {})) {
    if (acts.some(a => a.nftType === 'genesis-pass')) {
      genesisIds.add(id);
    }
  }
  return genesisIds;
}

async function main() {
  console.log(`\n=== Ecosystem Points Airdrop (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`  Event: ${eventId}`);
  console.log(`  Amount: ${amount} pts (Genesis: ${genesisAmount} pts)\n`);

  const identityToWallet = await fetchWalletMappings();
  console.log(`  ${identityToWallet.size} registered users`);

  const genesisHolders = await fetchGenesisHolders();
  console.log(`  ${genesisHolders.size} genesis pass holders\n`);

  let inserted = 0;
  let skipped = 0;
  let totalPts = 0;

  for (const [identityId, wallet] of identityToWallet) {
    const isGenesis = genesisHolders.has(identityId);
    const pts = isGenesis ? genesisAmount : amount;
    const digest = `bonus-airdrop:${eventId}:${identityId}`;

    if (dryRun) {
      console.log(`  ${identityId.slice(-8)} -> ${pts} pts${isGenesis ? ' (Genesis)' : ''}`);
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
        (${wallet}, ${identityId}, ${digest}, 'ecosystem-bonus-airdrop', ${eventId!},
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
