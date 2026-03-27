/**
 * Devnet NFT Snapshot Collector
 *
 * On-demand snapshot of all NFTs on Nasun devnet.
 * Run before devnet reset to preserve NFT ownership data.
 *
 * Discovery strategy:
 * 1. Query mint events via suix_queryEvents for each NFT type
 * 2. Fetch current object state via sui_multiGetObjects
 * 3. Store ownership records in DynamoDB
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  DevnetCollectorEvent,
  DevnetNftRecord,
  NFTTypeConfig,
  SuiEventPage,
  SuiObjectResponse,
  SnapshotMeta,
} from './types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const OWNERSHIP_TABLE = process.env.OWNERSHIP_TABLE!;
const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

const RPC_TIMEOUT_MS = 15_000;
const MULTI_GET_BATCH_SIZE = 50;
const BATCH_WRITE_SIZE = 25;
const MAX_EVENT_PAGES = 200;

// NFT Type Registry - uses originalPackageId for type queries
const NFT_TYPES: NFTTypeConfig[] = [
  {
    name: 'BetaAccessNFT',
    originalPackageId: '0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6',
    currentPackageId: '0x949af600b619785b66fe7959afb7f814ce8952dad301377de80343b90a8722f9',
    module: 'beta_access',
    structName: 'BetaAccessNFT',
    mintEventType: 'BetaAccessMinted',
    restoreStrategy: 'admin_restore',
  },
  {
    name: 'RequestReceipt',
    originalPackageId: '0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6',
    currentPackageId: '0x949af600b619785b66fe7959afb7f814ce8952dad301377de80343b90a8722f9',
    module: 'baram',
    structName: 'RequestReceipt',
    mintEventType: 'RequestCreated',
    restoreStrategy: 'admin_restore',
  },
  {
    name: 'VoteProofNFT',
    originalPackageId: '0x3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3',
    currentPackageId: '0x17df8431dd61bcdfc0dae120c915150634edecb911bf7368d0af43e2bbd69c5a',
    module: 'proposal',
    structName: 'VoteProofNFT',
    mintEventType: 'VoteRegistered',
    restoreStrategy: 'admin_restore',
  },
  {
    name: 'MultiChoiceVoteProofNFT',
    originalPackageId: '0xa1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a',
    currentPackageId: '0xa1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a',
    module: 'multi_choice_proposal',
    structName: 'MultiChoiceVoteProofNFT',
    mintEventType: 'MultiChoiceVoteRegistered',
    restoreStrategy: 'admin_restore',
  },
  {
    name: 'Ticket',
    originalPackageId: '0xeb79d7421090eccc5f912f20407c67b8052c7fbe1efea39bf9b548ccea46819c',
    currentPackageId: '0xeb79d7421090eccc5f912f20407c67b8052c7fbe1efea39bf9b548ccea46819c',
    module: 'lottery',
    structName: 'Ticket',
    mintEventType: 'TicketPurchased',
    restoreStrategy: 'skip',
  },
  {
    name: 'ScratchCard',
    originalPackageId: '0x2af30b79f00f8cf01cbf5c6a1ca58e20e80be0c7da2e99af0a4f80e23fd7a4f5',
    currentPackageId: '0x2af30b79f00f8cf01cbf5c6a1ca58e20e80be0c7da2e99af0a4f80e23fd7a4f5',
    module: 'scratchcard',
    structName: 'ScratchCard',
    mintEventType: 'ScratchCardPurchased',
    restoreStrategy: 'skip',
  },
  {
    name: 'ExecutionComplianceRecord',
    originalPackageId: '0x601d879d176f5f22f1c3f267bb8895c6b18f1020878ac38a5f88f27ffeed55c3',
    currentPackageId: '0x601d879d176f5f22f1c3f267bb8895c6b18f1020878ac38a5f88f27ffeed55c3',
    module: 'compliance',
    structName: 'ExecutionComplianceRecord',
    mintEventType: 'ComplianceRecordCreated',
    restoreStrategy: 'skip',
  },
  {
    name: 'AllianceNFT',
    originalPackageId: '0x2f2f9e1a1683462af44d3da1b5148f8671d446dbb913d5348efaf2f08819ba5b',
    currentPackageId: '0x2f2f9e1a1683462af44d3da1b5148f8671d446dbb913d5348efaf2f08819ba5b',
    module: 'alliance_nft',
    structName: 'AllianceNFT',
    mintEventType: 'AllianceMinted',
    restoreStrategy: 'admin_restore',
  },
];

let rpcReqId = 0;

export async function handler(event: DevnetCollectorEvent) {
  const startTime = Date.now();
  const today = event.customDate || new Date().toISOString().slice(0, 10);
  console.log(`[devnet-collector] Starting devnet NFT snapshot for ${today}`);

  // Health check
  await rpcHealthCheck();

  const allRecords: DevnetNftRecord[] = [];
  const typeStats: Record<string, number> = {};

  for (const nftType of NFT_TYPES) {
    try {
      const records = await collectNftType(nftType, today);
      allRecords.push(...records);
      typeStats[nftType.name] = records.length;
      console.log(`[devnet-collector] ${nftType.name}: ${records.length} NFTs`);
    } catch (err) {
      console.error(
        `[devnet-collector] Failed to collect ${nftType.name}:`,
        err instanceof Error ? err.message : 'Unknown',
      );
      typeStats[nftType.name] = -1; // Mark as error
    }
  }

  console.log(`[devnet-collector] Total: ${allRecords.length} NFTs across ${NFT_TYPES.length} types`);

  // Write to DynamoDB
  await batchWriteRecords(allRecords, today);

  // Write metadata
  const meta: SnapshotMeta = {
    pk: 'META',
    sk: `DEVNET#${today}`,
    snapshotDate: today,
    totalCount: allRecords.length,
    collectedAt: new Date().toISOString(),
    executionDurationMs: Date.now() - startTime,
    source: 'devnet-collector',
  };
  await client.send(new PutCommand({ TableName: OWNERSHIP_TABLE, Item: meta }));

  console.log(`[devnet-collector] Done in ${meta.executionDurationMs}ms`);
  return { status: 'success', totalNfts: allRecords.length, typeStats };
}

// ========== NFT Collection Logic ==========

async function collectNftType(nftType: NFTTypeConfig, today: string): Promise<DevnetNftRecord[]> {
  // Step 1: Discover object IDs via mint events
  const eventType = `${nftType.currentPackageId}::${nftType.module}::${nftType.mintEventType}`;
  const objectIds = await discoverObjectIdsFromEvents(eventType, nftType);

  if (objectIds.length === 0) return [];

  // Step 2: Fetch current state of all discovered objects
  const records: DevnetNftRecord[] = [];
  const fullType = `${nftType.originalPackageId}::${nftType.module}::${nftType.structName}`;

  for (let i = 0; i < objectIds.length; i += MULTI_GET_BATCH_SIZE) {
    const batch = objectIds.slice(i, i + MULTI_GET_BATCH_SIZE);
    const objects = await multiGetObjects(batch);

    for (const obj of objects) {
      if (!obj.data || !obj.data.owner?.AddressOwner || !obj.data.content) continue;

      records.push({
        pk: `DEVNET#${today}`,
        sk: `NFT#${obj.data.objectId}`,
        objectId: obj.data.objectId,
        owner: obj.data.owner.AddressOwner,
        nftType: nftType.name,
        fullType,
        fields: obj.data.content.fields || {},
        snapshotDate: today,
        version: obj.data.version,
      });
    }
  }

  return records;
}

async function discoverObjectIdsFromEvents(
  eventType: string,
  nftType: NFTTypeConfig,
): Promise<string[]> {
  const objectIds = new Set<string>();
  let cursor: { txDigest: string; eventSeq: string } | null = null;

  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const result = await rpcCall<SuiEventPage>('suix_queryEvents', [
      { MoveEventType: eventType },
      cursor,
      50,
      false, // ascending
    ]);

    for (const event of result.data) {
      // Extract object ID from event data
      // Different events store the NFT ID in different fields
      const json = event.parsedJson;
      const id =
        (json.nft_id as string) ||
        (json.ticket_id as string) ||
        (json.card_id as string) ||
        (json.record_id as string);

      if (id) objectIds.add(id);
    }

    if (!result.hasNextPage) break;
    cursor = result.nextCursor;
  }

  // Fallback: if no IDs found from events, try getOwnedObjects approach
  // Event fields may use different names; query objects by type as backup
  if (objectIds.size === 0) {
    console.log(`[devnet-collector] No IDs from events for ${nftType.name}, trying type query...`);
    return await discoverByTypeQuery(nftType);
  }

  return [...objectIds];
}

/** Fallback discovery: scan all known addresses for objects of this type */
async function discoverByTypeQuery(nftType: NFTTypeConfig): Promise<string[]> {
  // Query all objects of this type using suix_queryEvents with a different filter
  // or use the faucet-based address discovery from devnet-metrics
  // For now, return empty and log a warning
  console.warn(
    `[devnet-collector] Type query fallback not yet implemented for ${nftType.name}`,
  );
  return [];
}

// ========== RPC Helpers ==========

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const id = ++rpcReqId;
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`RPC HTTP error: ${res.status}`);

  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);

  return json.result as T;
}

async function rpcHealthCheck(): Promise<void> {
  const seq = await rpcCall<string>('sui_getLatestCheckpointSequenceNumber');
  if (!seq || Number(seq) <= 0) throw new Error(`RPC health check failed: seq=${seq}`);
  console.log(`[devnet-collector] RPC healthy, checkpoint: ${seq}`);
}

async function multiGetObjects(objectIds: string[]): Promise<SuiObjectResponse[]> {
  return rpcCall<SuiObjectResponse[]>('sui_multiGetObjects', [
    objectIds,
    { showContent: true, showOwner: true, showType: true },
  ]);
}

// ========== DynamoDB Helpers ==========

async function batchWriteRecords(records: DevnetNftRecord[], today: string) {
  // Write dated records + LATEST records
  const allItems = records.flatMap((r) => [r, { ...r, pk: 'DEVNET#LATEST' }]);

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
