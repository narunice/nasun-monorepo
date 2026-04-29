/**
 * ETH NFT Ownership Verifier
 *
 * Daily cron (01:45 UTC, after eth-collector at 01:00):
 * Compares ETH#LATEST snapshot against ecosystem-activations,
 * auto-deactivates users who no longer hold the NFT.
 *
 * Safety guards:
 * - Checks META record to confirm eth-collector ran today
 * - Skips if ETH#LATEST has zero records
 * - Skips if wallet count drops >30% vs yesterday (partial failure detection)
 * - Alliance activations are exempt (Nasun devnet, not ETH)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type { NftCollection, EthOwnershipRecord, SnapshotMeta } from './types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const OWNERSHIP_TABLE = process.env.OWNERSHIP_TABLE!;
const ACTIVATIONS_TABLE = process.env.ACTIVATIONS_TABLE!;
const COLLECTIONS_TABLE = process.env.COLLECTIONS_TABLE!;

const DROP_THRESHOLD_PERCENT = 30;
const MIN_COUNT_FOR_DROP_CHECK = 20;

export async function handler() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[ownership-verifier] Starting verification for ${today}`);

  // Safety: confirm eth-collector ran today
  const metaResult = await client.send(
    new GetCommand({
      TableName: OWNERSHIP_TABLE,
      Key: { pk: 'META', sk: `ETH#${today}` },
    }),
  );

  const meta = metaResult.Item as SnapshotMeta | undefined;
  if (!meta || meta.snapshotDate !== today) {
    console.error(`[ownership-verifier] No META record for today (${today}), skipping`);
    return { status: 'skipped', reason: 'no_meta_today' };
  }

  const todayCount = meta.totalCount;

  // Safety: skip if zero wallets in snapshot
  if (todayCount === 0) {
    console.error('[ownership-verifier] Zero wallets in today snapshot, skipping');
    return { status: 'skipped', reason: 'zero_wallets' };
  }

  // Safety: check for abnormal drop vs yesterday
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const yesterdayMeta = await client.send(
    new GetCommand({
      TableName: OWNERSHIP_TABLE,
      Key: { pk: 'META', sk: `ETH#${yesterdayStr}` },
    }),
  );

  if (yesterdayMeta.Item) {
    const yesterdayCount = (yesterdayMeta.Item as SnapshotMeta).totalCount;
    if (yesterdayCount >= MIN_COUNT_FOR_DROP_CHECK) {
      const dropPercent = ((yesterdayCount - todayCount) / yesterdayCount) * 100;
      if (dropPercent > DROP_THRESHOLD_PERCENT) {
        console.error(
          `[ownership-verifier] Wallet count dropped ${dropPercent.toFixed(1)}% (${yesterdayCount} -> ${todayCount}), skipping`,
        );
        return { status: 'skipped', reason: 'abnormal_drop', yesterdayCount, todayCount };
      }
    }
  }

  // Load enabled ETH collections: map activation SK prefix -> contract address.
  // Prefer the explicit nftTypeId field; fall back to a slugified collectionName
  // for legacy rows that pre-date the nftTypeId migration.
  const collections = await getEnabledCollections();
  const nftTypeToContract = new Map<string, string>();
  for (const col of collections) {
    const nftType =
      col.nftTypeId ||
      (col.collectionName ? col.collectionName.toLowerCase().replace(/\s+/g, '-') : '');
    if (!nftType) {
      console.warn(
        `[ownership-verifier] Skipping collection ${col.contractAddress}: missing nftTypeId and collectionName`,
      );
      continue;
    }
    if (!col.nftTypeId) {
      console.warn(
        `[ownership-verifier] Collection ${col.contractAddress} has no nftTypeId, derived "${nftType}" from collectionName`,
      );
    }
    nftTypeToContract.set(nftType, col.contractAddress.toLowerCase());
  }

  // Scan active ETH-based activations (genesis-pass#, frontiers#)
  const activations = await getActiveEthActivations();
  if (activations.length === 0) {
    console.log('[ownership-verifier] No active ETH activations found');
    return { status: 'success', checked: 0, deactivated: 0 };
  }

  let checked = 0;
  let deactivated = 0;
  let skipped = 0;

  for (const activation of activations) {
    checked++;
    const { identityId, sk } = activation;

    // Parse nftType and walletAddress from SK: "genesis-pass#0xabc..."
    const hashIdx = sk.indexOf('#');
    if (hashIdx < 0) { skipped++; continue; }
    const nftType = sk.slice(0, hashIdx);
    const walletAddress = sk.slice(hashIdx + 1).toLowerCase();

    const contractAddress = nftTypeToContract.get(nftType);
    if (!contractAddress) { skipped++; continue; }

    // Check ETH#LATEST for this wallet
    const ownershipResult = await client.send(
      new GetCommand({
        TableName: OWNERSHIP_TABLE,
        Key: { pk: 'ETH#LATEST', sk: `WALLET#${walletAddress}` },
      }),
    );

    const record = ownershipResult.Item as EthOwnershipRecord | undefined;
    const hasNft = record?.holdings?.some(
      (h) => h.contractAddress.toLowerCase() === contractAddress!.toLowerCase() && h.tokenCount > 0,
    ) ?? false;

    if (!hasNft) {
      // Deactivate
      const now = new Date().toISOString();
      await client.send(
        new UpdateCommand({
          TableName: ACTIVATIONS_TABLE,
          Key: { identityId, sk },
          UpdateExpression: 'SET #status = :inactive, deactivatedAt = :now, deactivationReason = :reason',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':inactive': 'INACTIVE',
            ':now': now,
            ':reason': 'ownership_lost',
          },
        }),
      );
      deactivated++;
      console.log(`[ownership-verifier] Deactivated ${nftType} for ${identityId.slice(0, 20)}...`);
    }
  }

  // Write audit record
  await client.send(
    new PutCommand({
      TableName: OWNERSHIP_TABLE,
      Item: {
        pk: 'META',
        sk: `VERIFICATION#${today}`,
        snapshotDate: today,
        checked,
        deactivated,
        skipped,
        executedAt: new Date().toISOString(),
      },
    }),
  );

  console.log(`[ownership-verifier] Done: checked=${checked}, deactivated=${deactivated}, skipped=${skipped}`);
  return { status: 'success', checked, deactivated, skipped };
}

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

interface Activation {
  identityId: string;
  sk: string;
}

async function getActiveEthActivations(): Promise<Activation[]> {
  const activations: Activation[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: ACTIVATIONS_TABLE,
        FilterExpression: '#status = :active AND (begins_with(sk, :gp) OR begins_with(sk, :fr))',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':active': 'ACTIVE',
          ':gp': 'genesis-pass#',
          ':fr': 'frontiers#',
        },
        ProjectionExpression: 'identityId, sk',
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of result.Items || []) {
      activations.push({
        identityId: item.identityId as string,
        sk: item.sk as string,
      });
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return activations;
}
