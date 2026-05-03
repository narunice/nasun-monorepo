/**
 * ETH NFT Ownership Collector v2 (holder-centric)
 *
 * Replaces the wallet-by-wallet polling in eth-collector.ts. Instead of
 * calling getNFTsForOwner per registered user (480 CU * N users), we call
 * getOwnersForContract once per enabled ETH contract (~150 CU * M contracts)
 * and intersect the holder set with the registered user wallet set.
 *
 * Output schema (ETH#LATEST WALLET#<addr>) is identical to v1 so all
 * downstream consumers (ownership-verifier, ecosystem-api activate,
 * genesis-pass/check, chat-server) work without changes.
 *
 * Safety guards:
 * - Any contract fetch failure aborts cleanup (prevents mass-deactivation
 *   when Alchemy is partially down).
 * - If today's wallet count drops > LATEST_DROP_GUARD_PERCENT vs the existing
 *   LATEST snapshot, cleanup is skipped and a META#GUARD record is written
 *   for human triage.
 * - Phase A negative-cache rows (source='alchemy-ondemand', totalNftCount=0,
 *   lastUpdatedAt within ONDEMAND_NEGATIVE_CACHE_MAX_AGE_MS) are preserved
 *   exactly as v1 does.
 *
 * Polygon and other non-ethereum chains are intentionally skipped: per
 * project decision, all NFTs prior to Nasun mainnet launch are ETH mainnet
 * only. Future polygon support requires per-chain Alchemy base URL handling.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchWriteCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  EthCollectorEvent,
  EthOwnershipRecord,
  EthNftHolding,
  NftCollection,
  SnapshotMeta,
} from './types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const OWNERSHIP_TABLE = process.env.OWNERSHIP_TABLE!;
const COLLECTIONS_TABLE = process.env.COLLECTIONS_TABLE!;
const PROFILES_TABLE = process.env.PROFILES_TABLE!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;
// NFT API v3 base URL. v1's ALCHEMY_BASE_URL points at JSON-RPC v2 and is
// NOT compatible with getOwnersForContract; v2 uses its own base.
const ALCHEMY_NFT_V3_BASE_URL =
  process.env.ALCHEMY_NFT_V3_BASE_URL || 'https://eth-mainnet.g.alchemy.com/nft/v3';

const ALCHEMY_TIMEOUT_MS = 30_000;
const ALCHEMY_MAX_RETRIES = 3;
const BATCH_WRITE_SIZE = 25;
const ONDEMAND_NEGATIVE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// If today's collected wallet count is < (1 - guard%) * existing LATEST count,
// suspect partial Alchemy failure or mass holder-set shift and skip cleanup.
const LATEST_DROP_GUARD_PERCENT = 50;
const LATEST_DROP_GUARD_MIN_BASELINE = 20;

interface AlchemyOwnersResponse {
  owners: Array<{
    ownerAddress: string;
    tokenBalances: Array<{ tokenId: string; balance: string }>;
  }>;
  pageKey?: string;
}

export async function handler(event: EthCollectorEvent) {
  if (!ALCHEMY_API_KEY) {
    throw new Error('ALCHEMY_API_KEY is required');
  }

  const startTime = Date.now();
  const today = event.customDate || new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const dryRun = event.dryRun === true;
  console.log(
    `[eth-collector-v2] Starting holder-centric snapshot for ${today}` +
      (dryRun ? ' (DRY RUN: no DDB writes)' : ''),
  );

  // 1. Enabled collections, ethereum chain only
  const allCollections = await getEnabledCollections();
  const ethCollections = allCollections.filter((c) => c.chain === 'ethereum');
  const skippedNonEth = allCollections.length - ethCollections.length;
  if (skippedNonEth > 0) {
    console.warn(
      `[eth-collector-v2] Skipped ${skippedNonEth} non-ethereum collections (polygon/etc not yet supported)`,
    );
  }
  if (ethCollections.length === 0) {
    console.log('[eth-collector-v2] No enabled ETH collections, skipping');
    return { status: 'skipped', reason: 'no_collections' };
  }
  console.log(`[eth-collector-v2] Processing ${ethCollections.length} ETH collections`);

  // 2. Registered user wallets
  const userWallets = await getUserEthWallets();
  if (userWallets.size === 0) {
    console.log('[eth-collector-v2] No registered ETH wallets, skipping');
    return { status: 'skipped', reason: 'no_wallets' };
  }
  console.log(`[eth-collector-v2] ${userWallets.size} registered ETH wallets`);

  // 3. For each contract: fetch all on-chain holders, intersect with users
  const fetchFailures: string[] = [];
  // wallet -> array of holdings (one entry per contract held)
  const walletHoldings = new Map<string, EthNftHolding[]>();

  for (const col of ethCollections) {
    const contract = col.contractAddress.toLowerCase();
    try {
      const owners = await fetchContractOwners(contract);
      console.log(
        `[eth-collector-v2] ${col.collectionName} (${contract.slice(0, 10)}...): ${owners.size} on-chain holders`,
      );
      let intersected = 0;
      for (const [owner, tokenIds] of owners) {
        if (!userWallets.has(owner)) continue;
        intersected++;
        const holding: EthNftHolding = {
          contractAddress: contract,
          chain: 'ethereum',
          collectionName: col.collectionName || 'Unknown',
          tokenIds,
          tokenCount: tokenIds.length,
        };
        const existing = walletHoldings.get(owner) ?? [];
        existing.push(holding);
        walletHoldings.set(owner, existing);
      }
      console.log(
        `[eth-collector-v2]   ${intersected} of ${owners.size} are registered Nasun users`,
      );
    } catch (err) {
      fetchFailures.push(contract);
      console.error(
        `[eth-collector-v2] FAILED to fetch owners for ${col.collectionName} (${contract}):`,
        err,
      );
    }
  }

  // 4. Build LATEST records (only wallets with totalNftCount > 0)
  const records: EthOwnershipRecord[] = [];
  for (const [wallet, holdings] of walletHoldings) {
    const totalNftCount = holdings.reduce((sum, h) => sum + h.tokenCount, 0);
    if (totalNftCount === 0) continue;
    records.push({
      pk: `ETH#${today}`,
      sk: `WALLET#${wallet}`,
      walletAddress: wallet,
      snapshotDate: today,
      holdings,
      totalNftCount,
      source: 'alchemy-holder',
      lastUpdatedAt: nowIso,
    });
  }

  console.log(
    `[eth-collector-v2] Built ${records.length} wallet records ` +
      `(${fetchFailures.length} contract fetch failures)`,
  );

  // 5. Write dated + LATEST records (skipped in dry-run)
  const todayWalletSks = new Set(records.map((r) => r.sk));
  if (dryRun) {
    const sortedSks = [...todayWalletSks].sort();
    console.log(
      `[eth-collector-v2] DRY RUN done in ${Date.now() - startTime}ms, ` +
        `would write ${records.length} wallets, fetchFailures=${fetchFailures.length}`,
    );
    return {
      status: 'dry_run',
      walletsWithNfts: records.length,
      fetchFailures: fetchFailures.length,
      fetchFailureContracts: fetchFailures,
      sampleSks: sortedSks.slice(0, 50),
      // Full SK set in CloudWatch for operator diff against v1's ETH#<date> rows.
      allSks: sortedSks,
    };
  }
  await batchWriteRecords(records);

  // 6. Cleanup gate: skip if any fetch failed, or if drop guard tripped.
  // existingLatestCount is only needed when no earlier guard short-circuits.
  const existingLatestCount =
    fetchFailures.length === 0 && records.length > 0 ? await countExistingLatestHolders() : 0;
  const cleanupSkipped = shouldSkipCleanup({
    fetchFailureCount: fetchFailures.length,
    recordsCount: records.length,
    existingLatestCount,
  });

  if (cleanupSkipped) {
    console.error(`[eth-collector-v2] CLEANUP SKIPPED reason=${cleanupSkipped}`);
    await client.send(
      new PutCommand({
        TableName: OWNERSHIP_TABLE,
        Item: {
          pk: 'META',
          sk: `GUARD#ETH#${today}#${Date.now()}`,
          snapshotDate: today,
          reason: cleanupSkipped,
          fetchFailures,
          recordsWritten: records.length,
          executedAt: nowIso,
          source: 'eth-collector-v2',
        },
      }),
    );
  } else {
    await cleanupStaleLatestRecords(todayWalletSks);
  }

  // 7. Snapshot metadata (mirrors v1 schema for ownership-verifier compatibility)
  const meta: SnapshotMeta = {
    pk: 'META',
    sk: `ETH#${today}`,
    snapshotDate: today,
    totalCount: records.length,
    collectedAt: nowIso,
    executionDurationMs: Date.now() - startTime,
    source: 'eth-collector',
  };
  await client.send(new PutCommand({ TableName: OWNERSHIP_TABLE, Item: meta }));

  console.log(
    `[eth-collector-v2] Done in ${meta.executionDurationMs}ms, ` +
      `wallets=${records.length}, fetchFailures=${fetchFailures.length}, ` +
      `cleanup=${cleanupSkipped ? 'SKIPPED' : 'OK'}`,
  );
  return {
    status: 'success',
    walletsWithNfts: records.length,
    fetchFailures: fetchFailures.length,
    cleanupSkipped,
  };
}

// ========== Alchemy ==========

async function fetchContractOwners(contract: string): Promise<Map<string, string[]>> {
  const owners = new Map<string, string[]>();
  let pageKey: string | undefined;
  let page = 0;

  do {
    const params = new URLSearchParams({
      contractAddress: contract,
      withTokenBalances: 'true',
    });
    if (pageKey) params.set('pageKey', pageKey);
    const url = `${ALCHEMY_NFT_V3_BASE_URL}/${ALCHEMY_API_KEY}/getOwnersForContract?${params}`;

    const data = await fetchWithRetry(url);
    page++;

    for (const o of data.owners) {
      const addr = o.ownerAddress.toLowerCase();
      const tokenIds = o.tokenBalances.map((tb) => tb.tokenId);
      const existing = owners.get(addr);
      if (existing) {
        for (const id of tokenIds) existing.push(id);
      } else {
        owners.set(addr, tokenIds);
      }
    }

    pageKey = data.pageKey;
  } while (pageKey);

  if (page > 1) {
    console.log(`[eth-collector-v2]   ${contract.slice(0, 10)}... paginated ${page} pages`);
  }
  return owners;
}

async function fetchWithRetry(url: string): Promise<AlchemyOwnersResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < ALCHEMY_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(ALCHEMY_TIMEOUT_MS) });
      if (!res.ok) {
        // Retry only on 5xx/429; 4xx is a hard failure.
        if (res.status >= 500 || res.status === 429) {
          throw new Error(`Alchemy HTTP ${res.status}`);
        }
        throw new Error(`Alchemy HTTP ${res.status} (non-retryable)`);
      }
      return (await res.json()) as AlchemyOwnersResponse;
    } catch (err) {
      lastErr = err;
      if (attempt < ALCHEMY_MAX_RETRIES - 1) {
        const delay = 200 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ========== DynamoDB ==========

async function getEnabledCollections(): Promise<NftCollection[]> {
  const result = await client.send(
    new ScanCommand({
      TableName: COLLECTIONS_TABLE,
      FilterExpression: 'enabled = :enabled',
      ExpressionAttributeValues: { ':enabled': true },
    }),
  );
  return (result.Items || []) as NftCollection[];
}

async function getUserEthWallets(): Promise<Set<string>> {
  const wallets = new Set<string>();
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: PROFILES_TABLE,
        FilterExpression: 'attribute_exists(#la.#mm.#wa)',
        ProjectionExpression: '#la.#mm.#wa',
        ExpressionAttributeNames: {
          '#la': 'linkedAccounts',
          '#mm': 'metamask',
          '#wa': 'walletAddress',
        },
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of result.Items || []) {
      const la = item.linkedAccounts as Record<string, unknown> | undefined;
      const mm = la?.metamask as Record<string, unknown> | undefined;
      const addr = mm?.walletAddress as string | undefined;
      if (addr && addr.startsWith('0x')) wallets.add(addr.toLowerCase());
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return wallets;
}

async function batchWriteRecords(records: EthOwnershipRecord[]) {
  // Dual-write: dated (ETH#<today>) + LATEST. Mirrors v1.
  const allItems = records.flatMap((r) => [r, { ...r, pk: 'ETH#LATEST' }]);

  for (const batch of chunk(allItems, BATCH_WRITE_SIZE)) {
    let unprocessed = batch.map((item) => ({ PutRequest: { Item: item } }));

    for (let retry = 0; retry < 3 && unprocessed.length > 0; retry++) {
      const result = await client.send(
        new BatchWriteCommand({ RequestItems: { [OWNERSHIP_TABLE]: unprocessed } }),
      );
      unprocessed = (result.UnprocessedItems?.[OWNERSHIP_TABLE] ?? []) as typeof unprocessed;
      if (unprocessed.length > 0 && retry < 2) {
        await new Promise((r) => setTimeout(r, 100 * 2 ** retry));
      }
    }
  }
}

async function countExistingLatestHolders(): Promise<number> {
  // Counts ETH#LATEST WALLET# records with totalNftCount > 0 (excludes ondemand
  // negative cache rows). Used solely as a sanity baseline for the drop guard.
  let lastKey: Record<string, unknown> | undefined;
  let count = 0;
  do {
    const result = await client.send(
      new QueryCommand({
        TableName: OWNERSHIP_TABLE,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': 'ETH#LATEST', ':prefix': 'WALLET#' },
        ProjectionExpression: 'sk, totalNftCount',
        ExclusiveStartKey: lastKey,
      }),
    );
    for (const item of result.Items || []) {
      if ((item.totalNftCount ?? 0) > 0) count++;
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  return count;
}

/**
 * Mirrors v1's cleanup. Preserves Phase A negative-cache rows
 * (source='alchemy-ondemand', totalNftCount=0, lastUpdatedAt within 24h).
 */
async function cleanupStaleLatestRecords(currentWalletSks: Set<string>) {
  let lastKey: Record<string, unknown> | undefined;
  const staleKeys: Array<{ pk: string; sk: string }> = [];
  const nowMs = Date.now();

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: OWNERSHIP_TABLE,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': 'ETH#LATEST', ':prefix': 'WALLET#' },
        ProjectionExpression: 'pk, sk, #src, totalNftCount, lastUpdatedAt',
        ExpressionAttributeNames: { '#src': 'source' },
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of result.Items || []) {
      const sk = item.sk as string;
      if (currentWalletSks.has(sk)) continue;
      if (
        isPreservedNegativeCache(
          {
            source: item.source as string | undefined,
            totalNftCount: item.totalNftCount as number | undefined,
            lastUpdatedAt: item.lastUpdatedAt as string | undefined,
          },
          nowMs,
        )
      ) {
        continue;
      }
      staleKeys.push({ pk: 'ETH#LATEST', sk });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (staleKeys.length === 0) return;

  console.log(`[eth-collector-v2] Cleaning up ${staleKeys.length} stale LATEST records`);

  for (const batch of chunk(staleKeys, BATCH_WRITE_SIZE)) {
    let unprocessed = batch.map((key) => ({ DeleteRequest: { Key: key } }));

    for (let retry = 0; retry < 3 && unprocessed.length > 0; retry++) {
      const result = await client.send(
        new BatchWriteCommand({ RequestItems: { [OWNERSHIP_TABLE]: unprocessed } }),
      );
      unprocessed = (result.UnprocessedItems?.[OWNERSHIP_TABLE] ?? []) as typeof unprocessed;
      if (unprocessed.length > 0 && retry < 2) {
        await new Promise((r) => setTimeout(r, 100 * 2 ** retry));
      }
    }
  }
}

// ========== Pure helpers (exported for unit tests) ==========

/**
 * Decides whether cleanupStaleLatestRecords should be skipped, based on the
 * three guard conditions documented at the top of this file. Pure: takes only
 * primitives so it can be unit-tested without DDB/Alchemy fixtures.
 */
export function shouldSkipCleanup(args: {
  fetchFailureCount: number;
  recordsCount: number;
  existingLatestCount: number;
}): string | null {
  if (args.fetchFailureCount > 0) return `fetch_failures:${args.fetchFailureCount}`;
  if (args.recordsCount === 0) return 'zero_records';
  if (
    args.existingLatestCount >= LATEST_DROP_GUARD_MIN_BASELINE &&
    args.recordsCount < (args.existingLatestCount * (100 - LATEST_DROP_GUARD_PERCENT)) / 100
  ) {
    return `drop_guard:${args.existingLatestCount}->${args.recordsCount}`;
  }
  return null;
}

/**
 * Predicate matching a Phase A negative-cache row that must be preserved by
 * cleanup. Mirrors the inline logic in cleanupStaleLatestRecords so both
 * stay testable in isolation.
 */
export function isPreservedNegativeCache(
  item: { source?: string; totalNftCount?: number; lastUpdatedAt?: string },
  nowMs: number,
): boolean {
  if (item.source !== 'alchemy-ondemand') return false;
  if ((item.totalNftCount ?? 0) !== 0) return false;
  const updatedAt = item.lastUpdatedAt ? new Date(item.lastUpdatedAt).getTime() : 0;
  if (!Number.isFinite(updatedAt)) return false;
  return updatedAt > nowMs - ONDEMAND_NEGATIVE_CACHE_MAX_AGE_MS;
}

/**
 * Splits an array into fixed-size chunks. Used by BatchWriteCommand wrappers
 * (DynamoDB hard cap = 25 items per batch). Exported so the chunking
 * arithmetic is independently verifiable.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be > 0');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const __test__ = {
  LATEST_DROP_GUARD_PERCENT,
  LATEST_DROP_GUARD_MIN_BASELINE,
  ONDEMAND_NEGATIVE_CACHE_MAX_AGE_MS,
  BATCH_WRITE_SIZE,
};
