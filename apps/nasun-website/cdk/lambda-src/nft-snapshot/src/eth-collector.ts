/**
 * ETH NFT Ownership Collector
 *
 * Daily cron job: queries Alchemy API for NFT ownership of registered users,
 * stores results in DynamoDB for future soft staking calculations.
 *
 * Flow:
 * 1. Read enabled collections from nasun-nft-collections
 * 2. Read user wallets from UserProfiles (ETH addresses only)
 * 3. For each wallet, query Alchemy getNFTsForOwner
 * 4. Write ownership records to nasun-nft-ownership table
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
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

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const OWNERSHIP_TABLE = process.env.OWNERSHIP_TABLE!;
const COLLECTIONS_TABLE = process.env.COLLECTIONS_TABLE!;
const PROFILES_TABLE = process.env.PROFILES_TABLE!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;
const ALCHEMY_BASE_URL = process.env.ALCHEMY_BASE_URL || 'https://eth-mainnet.g.alchemy.com/v2';

const ALCHEMY_TIMEOUT_MS = 10_000;
const MAX_WALLETS_PER_RUN = 500;
const BATCH_WRITE_SIZE = 25;

export async function handler(event: EthCollectorEvent) {
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

  // 3. Query Alchemy for each wallet
  const records: EthOwnershipRecord[] = [];
  let errorCount = 0;

  for (const wallet of wallets.slice(0, MAX_WALLETS_PER_RUN)) {
    try {
      const holdings = await queryAlchemyNfts(wallet, contractAddresses, collections);
      const totalNftCount = holdings.reduce((sum, h) => sum + h.tokenCount, 0);

      // Only record wallets that hold at least one tracked NFT
      if (totalNftCount > 0) {
        records.push({
          pk: `ETH#${today}`,
          sk: `WALLET#${wallet}`,
          walletAddress: wallet,
          snapshotDate: today,
          holdings,
          totalNftCount,
          source: 'alchemy',
        });
      }
    } catch (err) {
      errorCount++;
      console.warn(
        `[eth-collector] Failed for ${wallet.slice(0, 10)}...:`,
        err instanceof Error ? err.message : 'Unknown',
      );
    }
  }

  console.log(`[eth-collector] Collected ${records.length} wallets with NFTs (${errorCount} errors)`);

  // 4. Write to DynamoDB
  await batchWriteRecords(records, today);

  // 5. Write metadata
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
  // Scan UserProfiles for users with ethWalletAddress field
  const wallets: string[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: PROFILES_TABLE,
        FilterExpression: 'attribute_exists(ethWalletAddress)',
        ProjectionExpression: 'ethWalletAddress',
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of result.Items || []) {
      const addr = item.ethWalletAddress as string;
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
  const params = new URLSearchParams({
    owner: walletAddress,
    withMetadata: 'false',
    pageSize: '100',
  });

  // Add contract filter
  for (const addr of contractAddresses) {
    params.append('contractAddresses[]', addr);
  }

  const url = `${ALCHEMY_BASE_URL}/${ALCHEMY_API_KEY}/getNFTsForOwner?${params}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ALCHEMY_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Alchemy HTTP ${res.status}`);
  }

  const data = (await res.json()) as AlchemyNftsResponse;

  // Group by contract address
  const byContract = new Map<string, string[]>();
  for (const nft of data.ownedNfts) {
    const addr = nft.contract.address.toLowerCase();
    if (!byContract.has(addr)) byContract.set(addr, []);
    byContract.get(addr)!.push(nft.tokenId);
  }

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
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [OWNERSHIP_TABLE]: batch.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      }),
    );
  }
}
