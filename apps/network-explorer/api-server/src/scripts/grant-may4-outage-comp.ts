/**
 * May 4 Outage Compensation
 *
 * Awards a one-time compensation bonus to wallets whose May 4 daily-mission
 * credits dipped severely vs their May 3 / May 5 baseline. The bonus is
 * surfaced in my-account via the existing bonus feed (a dedicated celebration
 * slide variant `outage-comp-may4` shows "MAKING IT RIGHT" + an explanatory
 * subline so users understand the source).
 *
 * Selection (severe dip):
 *   c3 = distinct categories on 2026-05-03
 *   c4 = distinct categories on 2026-05-04
 *   c5 = distinct categories on 2026-05-05
 *   c3 >= 4 AND c5 >= 4 AND c4 <= GREATEST(1, LEAST(c3,c5)/3)
 *
 * Forward-only policy: this is a separate `ecosystem-bonus-outage-may4` row,
 * not a retro-credit of the original mission categories.
 *
 * Idempotency: tx_digest = outage-comp:2026-05-04:{identityId}
 *
 * Exclusions:
 *   - cec44e9e reporter wallet (already received 15pt via bug-report Lambda
 *     covering both the report value and the streak loss)
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/grant-may4-outage-comp.ts --dry-run
 *   npx tsx src/scripts/grant-may4-outage-comp.ts --execute
 *
 * Optional: --base-pts <n> --gp-pts <n> (defaults: 8 / 16)
 */

import postgres from 'postgres';
import { fetchGenesisPassHolders } from './_load-gp-holders.js';
import { fetchWithOffload } from '../scanner/fetch-with-offload.js';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_KEY = process.env.WALLET_MAPPINGS_API_KEY;

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const dryRun = !args.includes('--execute');
const basePts = parseInt(getArg('base-pts') || '8', 10);
const gpPts = parseInt(getArg('gp-pts') || '16', 10);

const EVENT_ID = 'outage-may4';
const CATEGORY = 'ecosystem-bonus-outage-may4';
const ACTIVITY_TYPE = 'may4-comp';

// cec44e9e reporter — already compensated 15pt via bug-report Lambda.
const EXCLUDED_WALLETS = new Set<string>([
  '0xcb8676443c2a35be68303102397493f2d5eb4955578cae466d407dff7e8279bf',
]);

async function fetchWalletToIdentity(): Promise<Map<string, string>> {
  if (!WALLET_MAPPINGS_URL) {
    throw new Error('WALLET_MAPPINGS_URL is required to resolve identityIds');
  }
  const data = await fetchWithOffload<{ wallets: Record<string, string> }>({
    url: WALLET_MAPPINGS_URL,
    apiKey: WALLET_MAPPINGS_KEY,
    label: 'OutageComp',
    timeoutMs: 30_000,
  });
  if (!data?.wallets) {
    throw new Error('Failed to fetch wallet mappings');
  }
  const map = new Map<string, string>();
  for (const [addr, id] of Object.entries(data.wallets)) {
    map.set(addr.toLowerCase(), id);
  }
  return map;
}

interface AffectedRow {
  wallet_address: string;
  c3: number;
  c4: number;
  c5: number;
}

async function fetchSevereDipWallets(): Promise<AffectedRow[]> {
  return db<AffectedRow[]>`
    WITH daily AS (
      SELECT wallet_address,
        DATE(tx_timestamp AT TIME ZONE 'UTC') AS d,
        COUNT(DISTINCT category) AS cats
      FROM activity_points
      WHERE NOT flagged
        AND tx_timestamp >= '2026-05-01'
        AND tx_timestamp < '2026-05-07'
      GROUP BY 1, 2
    ),
    piv AS (
      SELECT wallet_address,
        COALESCE(MAX(CASE WHEN d='2026-05-03' THEN cats END),0)::int c3,
        COALESCE(MAX(CASE WHEN d='2026-05-04' THEN cats END),0)::int c4,
        COALESCE(MAX(CASE WHEN d='2026-05-05' THEN cats END),0)::int c5
      FROM daily GROUP BY 1
    )
    SELECT wallet_address, c3, c4, c5
    FROM piv
    WHERE c3 >= 4 AND c5 >= 4
      AND c4 <= GREATEST(1, LEAST(c3, c5) / 3)
    ORDER BY wallet_address
  `;
}

async function main() {
  console.log(`\n=== May 4 Outage Compensation (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`  Base: ${basePts} pts, GP-doubled: ${gpPts} pts`);
  console.log(`  Excluded wallets: ${EXCLUDED_WALLETS.size}\n`);

  const [affected, walletToIdentity, gpHolders] = await Promise.all([
    fetchSevereDipWallets(),
    fetchWalletToIdentity(),
    fetchGenesisPassHolders(),
  ]);

  console.log(`  ${affected.length} severe-dip wallets`);
  console.log(`  ${walletToIdentity.size} wallet→identity mappings`);
  console.log(`  ${gpHolders.size} genesis pass holders\n`);

  let inserted = 0;
  let skippedDup = 0;
  let skippedNoIdentity = 0;
  let skippedExcluded = 0;
  let totalPts = 0;
  let gpCount = 0;

  for (const row of affected) {
    const wallet = row.wallet_address.toLowerCase();

    if (EXCLUDED_WALLETS.has(wallet)) {
      skippedExcluded++;
      continue;
    }

    const identityId = walletToIdentity.get(wallet);
    if (!identityId) {
      skippedNoIdentity++;
      continue;
    }

    const isGP = gpHolders.has(identityId);
    const pts = isGP ? gpPts : basePts;
    if (isGP) gpCount++;

    const digest = `outage-comp:2026-05-04:${identityId}`;

    if (dryRun) {
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
        (${wallet}, ${identityId}, ${digest}, ${CATEGORY}, ${ACTIVITY_TYPE},
         ${pts}, 1.0, 1.0, ${pts.toFixed(2)},
         NOW()::timestamptz, 0, 0)
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    if (result.count > 0) {
      inserted++;
      totalPts += pts;
    } else {
      skippedDup++;
    }
  }

  console.log(`--- Summary ---`);
  console.log(`  Inserted:       ${inserted}`);
  console.log(`    GP holders:   ${gpCount} (x${gpPts}pt = ${gpCount * gpPts}pt)`);
  console.log(`    Standard:     ${inserted - gpCount} (x${basePts}pt = ${(inserted - gpCount) * basePts}pt)`);
  console.log(`  Skipped (dup):  ${skippedDup}`);
  console.log(`  Skipped (no identity): ${skippedNoIdentity}`);
  console.log(`  Skipped (excluded):    ${skippedExcluded}`);
  console.log(`  Total points granted:  ${totalPts.toLocaleString()}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (re-run with --execute to apply)' : 'LIVE'}`);

  await db.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
