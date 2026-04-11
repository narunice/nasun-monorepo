/**
 * ETH NFT Ownership Collector
 *
 * Daily cron job: queries Alchemy API for NFT ownership of registered users,
 * stores results in DynamoDB for future soft staking calculations.
 *
 * Flow:
 * 1. Read enabled collections from nasun-nft-collections
 * 2. Read user wallets from UserProfiles (linkedAccounts.metamask.walletAddress)
 * 3. For each wallet, query Alchemy getNFTsForOwner (with pagination)
 * 4. Write ownership records to nasun-nft-ownership table
 * 5. Clean up stale ETH#LATEST records for wallets no longer holding NFTs
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
  AlchemyNftsResponse,
  SnapshotMeta,
} from './types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const OWNERSHIP_TABLE = process.env.OWNERSHIP_TABLE!;
const COLLECTIONS_TABLE = process.env.COLLECTIONS_TABLE!;
const PROFILES_TABLE = process.env.PROFILES_TABLE!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;
const ALCHEMY_BASE_URL = process.env.ALCHEMY_BASE_URL || 'https://eth-mainnet.g.alchemy.com/v2';

const ALCHEMY_TIMEOUT_MS = 10_000;
const BATCH_WRITE_SIZE = 25;
const MAX_ALCHEMY_PAGES = 10;
const CONCURRENCY = 20;

export async function handler(event: EthCollectorEvent) {
  if (!ALCHEMY_API_KEY) {
    throw new Error('ALCHEMY_API_KEY is required');
  }

  const startTime = Date.now();
  const today = event.customDate || new Date().toISOString().slice(0, 10);
  console.log(`[eth-collector] Starting ETH NFT snapshot for ${today}`);

  // 1. Read enabled collections
  const collections = await getEnabledCollections();
  if (collections.length === 0) {
    console.log('[eth-collector] No enabled collections found, skipping');
    return { status: 'skipped', reason: 'no_collections' };
  }
  console.log(`[eth-collector] Found ${collections.length} enabled collections`);

  const contractAddresses = collections.map((c) => c.contractAddress.toLowerCase());

  // 2. Read user wallets with linked ETH addresses
  const wallets = await getUserEthWallets();
  if (wallets.length === 0) {
    console.log('[eth-collector] No user wallets found, skipping');
    return { status: 'skipped', reason: 'no_wallets' };
  }
  console.log(`[eth-collector] Found ${wallets.length} wallets to check`);

  // 3. Query Alchemy for each wallet (parallel with concurrency limit)
  console.log(`[eth-collector] Processing ${wallets.length} wallets (concurrency: ${CONCURRENCY})`);
  const records: EthOwnershipRecord[] = [];
  let errorCount = 0;

  for (let i = 0; i < wallets.length; i += CONCURRENCY) {
    const batch = wallets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (wallet) => {
        const holdings = await queryAlchemyNfts(wallet, contractAddresses, collections);
        const totalNftCount = holdings.reduce((sum, h) => sum + h.tokenCount, 0);
        if (totalNftCount > 0) {
          return {
            pk: `ETH#${today}`,
            sk: `WALLET#${wallet}`,
            walletAddress: wallet,
            snapshotDate: today,
            holdings,
            totalNftCount,
            source: 'alchemy' as const,
          };
        }
        return null;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        records.push(result.value);
      } else if (result.status === 'rejected') {
        errorCount++;
      }
    }
  }

  console.log(`[eth-collector] Collected ${records.length} wallets with NFTs (${errorCount} errors out of ${wallets.length})`);

  // 4. Write to DynamoDB (dated + LATEST records)
  const todayWalletSks = new Set(records.map((r) => r.sk));
  await batchWriteRecords(records, today);

  // 5. Clean up stale LATEST records for wallets that no longer hold NFTs
  await cleanupStaleLatestRecords(todayWalletSks);

  // 6. Write metadata
  const meta: SnapshotMeta = {
    pk: 'META',
    sk: `ETH#${today}`,
    snapshotDate: today,
    totalCount: records.length,
    collectedAt: new Date().toISOString(),
    executionDurationMs: Date.now() - startTime,
    source: 'eth-collector',
  };
  await client.send(new PutCommand({ TableName: OWNERSHIP_TABLE, Item: meta }));

  console.log(`[eth-collector] Done in ${meta.executionDurationMs}ms`);
  return { status: 'success', walletsWithNfts: records.length, errors: errorCount };
}

// ========== Helpers ==========

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

async function getUserEthWallets(): Promise<string[]> {
  // Scan UserProfiles for users with linked MetaMask wallet
  const wallets: string[] = [];
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
      if (addr && addr.startsWith('0x')) {
        wallets.push(addr.toLowerCase());
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  // Deduplicate
  return [...new Set(wallets)];
}

async function queryAlchemyNfts(
  walletAddress: string,
  contractAddresses: string[],
  collections: NftCollection[],
): Promise<EthNftHolding[]> {
  const byContract = new Map<string, string[]>();
  let pageKey: string | undefined;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({
      owner: walletAddress,
      withMetadata: 'false',
      pageSize: '100',
    });

    for (const addr of contractAddresses) {
      params.append('contractAddresses[]', addr);
    }

    if (pageKey) {
      params.set('pageKey', pageKey);
    }

    const url = `${ALCHEMY_BASE_URL}/${ALCHEMY_API_KEY}/getNFTsForOwner?${params}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(ALCHEMY_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Alchemy HTTP ${res.status}`);
    }

    const data = (await res.json()) as AlchemyNftsResponse;

    for (const nft of data.ownedNfts) {
      const addr = nft.contract.address.toLowerCase();
      if (!byContract.has(addr)) byContract.set(addr, []);
      byContract.get(addr)!.push(nft.id.tokenId);
    }

    pageKey = data.pageKey;
    pageCount++;

    if (pageCount >= MAX_ALCHEMY_PAGES) {
      console.warn(`[eth-collector] Hit max pages (${MAX_ALCHEMY_PAGES}) for ${walletAddress.slice(0, 10)}...`);
      break;
    }
  } while (pageKey);

  // Build holdings with collection names
  const collectionMap = new Map(collections.map((c) => [c.contractAddress.toLowerCase(), c]));
  const holdings: EthNftHolding[] = [];

  for (const [addr, tokenIds] of byContract) {
    const col = collectionMap.get(addr);
    holdings.push({
      contractAddress: addr,
      chain: col?.chain || 'ethereum',
      collectionName: col?.collectionName || 'Unknown',
      tokenIds,
      tokenCount: tokenIds.length,
    });
  }

  return holdings;
}

async function batchWriteRecords(records: EthOwnershipRecord[], today: string) {
  // Write dated records + LATEST records
  const allItems = records.flatMap((r) => [
    r,
    { ...r, pk: 'ETH#LATEST' }, // Overwrite LATEST for quick lookup
  ]);

  for (let i = 0; i < allItems.length; i += BATCH_WRITE_SIZE) {
    const batch = allItems.slice(i, i + BATCH_WRITE_SIZE);
    let unprocessed = batch.map((item) => ({ PutRequest: { Item: item } }));

    for (let retry = 0; retry < 3 && unprocessed.length > 0; retry++) {
      const result = await client.send(
        new BatchWriteCommand({
          RequestItems: { [OWNERSHIP_TABLE]: unprocessed },
        }),
      );
      unprocessed = (result.UnprocessedItems?.[OWNERSHIP_TABLE] ?? []) as typeof unprocessed;
      if (unprocessed.length > 0 && retry < 2) {
        await new Promise((r) => setTimeout(r, 100 * 2 ** retry));
      }
    }
  }
}

/**
 * Remove stale ETH#LATEST records for wallets that no longer hold any tracked NFTs.
 * This prevents the ownership-verifier from seeing phantom holdings.
 */
async function cleanupStaleLatestRecords(currentWalletSks: Set<string>) {
  // Query all existing ETH#LATEST WALLET# records
  let lastKey: Record<string, unknown> | undefined;
  const staleKeys: Array<{ pk: string; sk: string }> = [];

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: OWNERSHIP_TABLE,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': 'ETH#LATEST',
          ':prefix': 'WALLET#',
        },
        ProjectionExpression: 'pk, sk',
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of result.Items || []) {
      const sk = item.sk as string;
      if (!currentWalletSks.has(sk)) {
        staleKeys.push({ pk: 'ETH#LATEST', sk });
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (staleKeys.length === 0) return;

  console.log(`[eth-collector] Cleaning up ${staleKeys.length} stale LATEST records`);

  for (let i = 0; i < staleKeys.length; i += BATCH_WRITE_SIZE) {
    const batch = staleKeys.slice(i, i + BATCH_WRITE_SIZE);
    let unprocessed = batch.map((key) => ({ DeleteRequest: { Key: key } }));

    for (let retry = 0; retry < 3 && unprocessed.length > 0; retry++) {
      const result = await client.send(
        new BatchWriteCommand({
          RequestItems: { [OWNERSHIP_TABLE]: unprocessed },
        }),
      );
      unprocessed = (result.UnprocessedItems?.[OWNERSHIP_TABLE] ?? []) as typeof unprocessed;
      if (unprocessed.length > 0 && retry < 2) {
        await new Promise((r) => setTimeout(r, 100 * 2 ** retry));
      }
    }
  }
}
