// Ship-2 ETH NFT ownership weekly job -- de-Lambda of nft-snapshot/eth-collector-v2 + ownership-verifier.
//
// ONE oneshot process (systemd timer, weekly), two phases run IN-PROCESS:
//   1. collector: fetch each enabled ETH contract's on-chain holder set (Alchemy getOwnersForContract),
//      intersect with the registered metamask wallet set, upsert ETH#LATEST rows via :3211, then (only when
//      the run is clean) cleanup stale ETH#LATEST holders via :3211.
//   2. verifier: scan active genesis-pass/frontiers activations; any whose wallet no longer holds the NFT in
//      the just-refreshed ETH#LATEST snapshot is flipped to INACTIVE (deactivationReason='ownership_lost').
//
// In-process sequencing REPLACES the lambda's META#ETH#today coupling (the lambda ran two separate Lambdas at
// 01:00 / 01:45 and used a META record to confirm the collector ran). Here the verifier runs only after a
// CLEAN collector pass (cleanup actually executed), so a fetch-failure / drop-guard short-circuit suppresses
// the verifier too -- the same mass-deactivation protection, without a META race.
//
// box adaptations vs the two lambdas (behavior-equivalent, infra-only):
//   - DDB COLLECTIONS_TABLE / PROFILES_TABLE / OWNERSHIP_TABLE / ACTIVATIONS_TABLE -> box PG compute_ro reads.
//   - dated ETH#<today> history is DROPPED: the box keeps only ETH#LATEST live state (DDB retains the dated
//     audit until the nft-snapshot-stack teardown). The collector drop-guard baseline is the current box
//     ETH#LATEST holder count (== the lambda countExistingLatestHolders), and the verifier drop-guard baseline
//     is the pre-collector holder count (== the lambda yesterday-META count) -- no dated rows needed.
//   - all WRITES delegate to :3211 (nft_ownership upsert + cleanup-stale + ecosystem deactivate); the job's
//     own PG pool is compute_ro (SELECT-only), identical to handlers-ecosystem.
//
// Run: `node eth-ownership-job.mjs` (timer) or `node eth-ownership-job.mjs --dry-run` (read-only, no writes,
// ignores the enable flag).

import postgres from 'postgres';
import { PG, SCHEMA, ECOSYSTEM, ETH_OWNERSHIP } from './config';
import { fetchHoldersForContract } from './eth-holders';
import { nftOwnershipUpsert, nftOwnershipCleanupStale, ecosystemActivationDeactivate } from './clients';

// Byte-parity constants (eth-collector-v2 LATEST_DROP_GUARD_*, ownership-verifier DROP_THRESHOLD_*).
const COLLECTOR_DROP_GUARD_PERCENT = 50;
const COLLECTOR_DROP_GUARD_MIN_BASELINE = 20;
const VERIFIER_DROP_THRESHOLD_PERCENT = 30;
const VERIFIER_MIN_COUNT_FOR_DROP_CHECK = 20;

interface CollectionRow {
  contract_address: string;
  chain: string;
  collection_name: string | null;
  nft_type_id: string | null;
}
interface Holding {
  contractAddress: string;
  chain: string;
  collectionName: string;
  tokenIds: string[];
  tokenCount: number;
}
interface OwnershipRecord {
  sk: string;
  walletAddress: string;
  holdings: Holding[];
  totalNftCount: number;
}

const dryRun = process.argv.includes('--dry-run');

const sql = postgres({
  host: PG.host, port: PG.port, database: PG.database, username: PG.username, password: PG.password,
  max: 4, idle_timeout: 20, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: 60000 },
});

// ===================== compute_ro reads =====================

async function getEnabledEthCollections(): Promise<CollectionRow[]> {
  return await sql<CollectionRow[]>`
    SELECT contract_address, chain, collection_name, nft_type_id
    FROM ${sql(SCHEMA)}.nft_collections WHERE enabled = true AND chain = 'ethereum'`;
}

// Registered metamask wallets (parity with the lambda getUserEthWallets PROFILES_TABLE scan of
// linkedAccounts.metamask.walletAddress). Lower-cased, 0x-prefixed only.
async function getRegisteredEthWallets(): Promise<Set<string>> {
  const rows = await sql<{ w: string | null }[]>`
    SELECT DISTINCT lower(linked_accounts->'metamask'->>'walletAddress') AS w
    FROM ${sql(SCHEMA)}.user_profiles
    WHERE linked_accounts->'metamask'->>'walletAddress' IS NOT NULL`;
  const out = new Set<string>();
  for (const r of rows) if (r.w && r.w.startsWith('0x')) out.add(r.w);
  return out;
}

// Count of current ETH#LATEST holders with totalNftCount > 0 (parity with the lambda countExistingLatestHolders;
// excludes on-demand negative-cache zero rows). Used as the drop-guard baseline.
async function countExistingLatestHolders(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${sql(SCHEMA)}.nft_ownership
    WHERE pk = 'ETH#LATEST' AND sk LIKE 'WALLET#%'
      AND COALESCE((attributes->>'totalNftCount')::numeric, 0) > 0`;
  return n;
}

// Pure drop-guard (eth-collector-v2 shouldSkipCleanup parity): fetch failure, zero records, or today's count
// below (100 - guard%) of the existing baseline => skip cleanup (suspected partial Alchemy failure).
function shouldSkipCleanup(args: { fetchFailureCount: number; recordsCount: number; existingLatestCount: number }): string | null {
  if (args.fetchFailureCount > 0) return `fetch_failures:${args.fetchFailureCount}`;
  if (args.recordsCount === 0) return 'zero_records';
  if (
    args.existingLatestCount >= COLLECTOR_DROP_GUARD_MIN_BASELINE &&
    args.recordsCount < (args.existingLatestCount * (100 - COLLECTOR_DROP_GUARD_PERCENT)) / 100
  ) {
    return `drop_guard:${args.existingLatestCount}->${args.recordsCount}`;
  }
  return null;
}

// ===================== collector phase =====================

// Returns the keep-set + whether cleanup actually ran (verifier only runs on a clean cleanup pass), or null
// when there is nothing to do (no collections / no wallets / dry-run).
async function runCollector(): Promise<{ keepSks: string[]; cleanupRan: boolean; recordCount: number } | null> {
  const collections = await getEnabledEthCollections();
  if (collections.length === 0) {
    console.log('[eth-ownership] collector: no enabled ETH collections, skipping');
    return null;
  }
  const wallets = await getRegisteredEthWallets();
  if (wallets.size === 0) {
    console.log('[eth-ownership] collector: no registered ETH wallets, skipping');
    return null;
  }
  console.log(`[eth-ownership] collector: ${collections.length} ETH collection(s), ${wallets.size} registered wallet(s)`);

  const fetchFailures: string[] = [];
  const walletHoldings = new Map<string, Holding[]>();
  for (const col of collections) {
    const contract = col.contract_address.toLowerCase();
    try {
      const holders = await fetchHoldersForContract(contract);
      let intersected = 0;
      for (const [owner, tokenIds] of Object.entries(holders)) {
        if (!wallets.has(owner)) continue;
        intersected++;
        const arr = walletHoldings.get(owner) ?? [];
        arr.push({
          contractAddress: contract,
          chain: 'ethereum',
          collectionName: col.collection_name || 'Unknown',
          tokenIds,
          tokenCount: tokenIds.length,
        });
        walletHoldings.set(owner, arr);
      }
      console.log(`[eth-ownership]   ${contract.slice(0, 10)}...: ${Object.keys(holders).length} on-chain holders, ${intersected} registered`);
    } catch (err) {
      fetchFailures.push(contract);
      console.error(`[eth-ownership]   FAILED to fetch owners for ${contract}:`, err instanceof Error ? err.message : err);
    }
  }

  // Build ETH#LATEST records (wallets with totalNftCount > 0 only).
  const records: OwnershipRecord[] = [];
  for (const [wallet, holdings] of walletHoldings) {
    const totalNftCount = holdings.reduce((s, h) => s + h.tokenCount, 0);
    if (totalNftCount === 0) continue;
    records.push({ sk: `WALLET#${wallet}`, walletAddress: wallet, holdings, totalNftCount });
  }
  console.log(`[eth-ownership] collector built ${records.length} wallet record(s) (${fetchFailures.length} fetch failure(s))`);

  if (dryRun) {
    console.log(`[eth-ownership] DRY RUN: would upsert ${records.length} record(s), fetchFailures=${fetchFailures.length}, no writes`);
    return null;
  }

  // Upsert ETH#LATEST rows (source 'alchemy-holder', parity with the v2 collector).
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  for (const r of records) {
    await nftOwnershipUpsert({
      pk: 'ETH#LATEST', sk: r.sk, walletAddress: r.walletAddress, snapshotDate: today,
      holdings: r.holdings, totalNftCount: r.totalNftCount, source: 'alchemy-holder', lastUpdatedAt: now,
    });
  }

  // Cleanup gate (count AFTER upsert == the lambda: stale rows still present, so the baseline is not
  // inflated away by the fresh upserts -- a partial-failure run is still caught).
  const existingLatestCount =
    fetchFailures.length === 0 && records.length > 0 ? await countExistingLatestHolders() : 0;
  const skipReason = shouldSkipCleanup({
    fetchFailureCount: fetchFailures.length, recordsCount: records.length, existingLatestCount,
  });
  const keepSks = records.map((r) => r.sk);
  if (skipReason) {
    console.error(`[eth-ownership] collector cleanup SKIPPED reason=${skipReason}`);
    return { keepSks, cleanupRan: false, recordCount: records.length };
  }
  const { deleted } = await nftOwnershipCleanupStale(keepSks);
  console.log(`[eth-ownership] collector cleanup deleted ${deleted} stale ETH#LATEST row(s)`);
  return { keepSks, cleanupRan: true, recordCount: records.length };
}

// ===================== verifier phase =====================

// todayCount = the just-collected holder count; baselineCount = the pre-collector ETH#LATEST holder count.
// This drop-guard is the box adaptation of the lambda's yesterday-vs-today META compare. NOTE (asymmetry,
// accepted): baselineCount counts ALL ETH#LATEST holders including on-demand-activated rows, while todayCount
// is the collector intersection only, so heavy on-demand churn can inflate the apparent drop and SKIP the
// verifier for a cycle. That fails SAFE (no mass-deactivation; stale activations just linger one more week) --
// the conservative direction; a precise symmetric compare would need a separate alchemy-holder-only baseline
// (deferred: closed GP set, low churn). jobStartIso is the lost-update guard threaded into deactivate so a
// fresh user activate landing mid-run (last_verified_at bumped to now()) is not clobbered to INACTIVE.
async function runVerifier(todayCount: number, baselineCount: number, jobStartIso: string): Promise<void> {
  if (baselineCount >= VERIFIER_MIN_COUNT_FOR_DROP_CHECK) {
    const dropPercent = ((baselineCount - todayCount) / baselineCount) * 100;
    if (dropPercent > VERIFIER_DROP_THRESHOLD_PERCENT) {
      console.error(`[eth-ownership] verifier SKIPPED: holder count dropped ${dropPercent.toFixed(1)}% (${baselineCount} -> ${todayCount})`);
      return;
    }
  }

  // nftType -> contract map (prefer nft_type_id; fall back to a slugified collectionName for legacy rows).
  const collections = await getEnabledEthCollections();
  const nftTypeToContract = new Map<string, string>();
  for (const col of collections) {
    const nftType = col.nft_type_id || (col.collection_name ? col.collection_name.toLowerCase().replace(/\s+/g, '-') : '');
    if (!nftType) continue;
    nftTypeToContract.set(nftType, col.contract_address.toLowerCase());
  }

  // Active ETH-based activations (genesis-pass#, frontiers#) -- alliance# is exempt (Nasun devnet, not ETH).
  const activations = await sql<{ identity_id: string; sk: string }[]>`
    SELECT identity_id, sk FROM ${sql(SCHEMA)}.ecosystem_activations
    WHERE status = 'ACTIVE' AND (sk LIKE 'genesis-pass#%' OR sk LIKE 'frontiers#%')`;
  if (activations.length === 0) {
    console.log('[eth-ownership] verifier: no active ETH activations');
    return;
  }

  let checked = 0, deactivated = 0, skipped = 0;
  for (const a of activations) {
    checked++;
    const hashIdx = a.sk.indexOf('#');
    if (hashIdx < 0) { skipped++; continue; }
    const nftType = a.sk.slice(0, hashIdx);
    const walletAddress = a.sk.slice(hashIdx + 1).toLowerCase();
    const contractAddress = nftTypeToContract.get(nftType);
    if (!contractAddress) { skipped++; continue; }

    const rows = await sql<{ attributes: Record<string, unknown> | null }[]>`
      SELECT attributes FROM ${sql(SCHEMA)}.nft_ownership
      WHERE pk = 'ETH#LATEST' AND sk = ${'WALLET#' + walletAddress}`;
    const attrs = rows[0]?.attributes;
    const holdings = (attrs && typeof attrs === 'object' ? (attrs as { holdings?: Holding[] }).holdings : undefined) ?? [];
    const hasNft = holdings.some((h) => h.contractAddress.toLowerCase() === contractAddress && h.tokenCount > 0);

    if (!hasNft) {
      await ecosystemActivationDeactivate({ identityId: a.identity_id, sk: a.sk, reason: 'ownership_lost', notAfter: jobStartIso });
      deactivated++;
      console.log(`[eth-ownership] verifier deactivated ${nftType} for ${a.identity_id.slice(0, 20)}...`);
    }
  }
  console.log(`[eth-ownership] verifier done: checked=${checked} deactivated=${deactivated} skipped=${skipped}`);
}

// ===================== main =====================

async function main(): Promise<void> {
  if (!dryRun && !ETH_OWNERSHIP.enabled) {
    console.log('[eth-ownership] DISABLED (COMPUTE_ETH_OWNERSHIP_ENABLED != 1, or identity-write-bearer / Alchemy key absent) -- inert, exiting 0');
    return;
  }
  const startedAt = Date.now();
  const jobStartIso = new Date(startedAt).toISOString();
  // Pre-collector baseline for the verifier drop-guard (== the lambda's yesterday holder count).
  const baselineCount = dryRun ? 0 : await countExistingLatestHolders();

  const result = await runCollector();
  if (dryRun) { console.log('[eth-ownership] dry-run complete'); return; }
  if (!result) { console.log('[eth-ownership] collector produced no run; verifier not run'); return; }
  if (!result.cleanupRan) {
    console.log('[eth-ownership] collector cleanup was skipped (unsafe run); verifier NOT run to avoid mass-deactivation');
    return;
  }
  await runVerifier(result.recordCount, baselineCount, jobStartIso);
  console.log(`[eth-ownership] done in ${Date.now() - startedAt}ms`);
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[eth-ownership] FATAL:', err instanceof Error ? (err.stack || err.message) : err);
    sql.end({ timeout: 5 }).finally(() => process.exit(1));
  });
