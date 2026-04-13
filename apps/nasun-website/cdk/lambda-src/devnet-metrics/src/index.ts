/**
 * Devnet Daily Metrics Collector
 *
 * Collects daily active addresses (DAU), new addresses, and cumulative
 * address counts from Nasun Devnet via RPC. Stores results in DynamoDB.
 *
 * Trigger: EventBridge (daily at 00:30 UTC) or manual invoke.
 * Supports customDate/force payload for backfill.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { CollectMetricsEvent, CollectorState, MetricsRecord, AddressRecord } from './types';
import {
  healthCheck,
  getCheckpoint,
  discoverAddressesFromFaucet,
  checkBatchActivity,
} from './rpc-client';

// DynamoDB setup
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DEVNET_METRICS_TABLE || 'devnet-metrics';
const FAUCET_ADDRESS = process.env.FAUCET_ADDRESS || '';
const EXCLUDED_ADDRESSES = new Set(
  (process.env.EXCLUDED_ADDRESSES || '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean),
);

// Always exclude system zero address
EXCLUDED_ADDRESSES.add('0x0000000000000000000000000000000000000000000000000000000000000000');

function getYesterdayDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dateToDayBounds(dateStr: string): { startMs: number; endMs: number } {
  const startMs = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  const endMs = startMs + 86_400_000;
  return { startMs, endMs };
}

// -- DynamoDB operations --

async function getState(): Promise<CollectorState | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'STATE', sk: 'COLLECTOR' },
  }));
  return (result.Item as CollectorState) ?? null;
}

async function getMetrics(dateStr: string): Promise<MetricsRecord | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `METRICS#${dateStr}`, sk: 'DAILY' },
  }));
  return (result.Item as MetricsRecord) ?? null;
}

async function getAllKnownAddresses(): Promise<string[]> {
  const addresses: string[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(pk, :prefix)',
      ExpressionAttributeValues: { ':prefix': 'ADDRESS#' },
      ProjectionExpression: 'pk',
      ExclusiveStartKey: lastKey,
    }));

    for (const item of result.Items ?? []) {
      const addr = (item.pk as string).replace('ADDRESS#', '');
      addresses.push(addr);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return addresses;
}

async function saveAddress(address: string, firstSeenDate: string): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: `ADDRESS#${address}`,
      sk: 'META',
      firstSeenDate,
      discoveredAt: new Date().toISOString(),
    } satisfies AddressRecord,
    ConditionExpression: 'attribute_not_exists(pk)',
  })).catch((err) => {
    // Ignore ConditionalCheckFailedException (address already exists)
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  });
}

async function saveMetrics(record: MetricsRecord): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: record,
  }));
}

async function updateState(
  lastCollectedDate: string,
  totalKnownAddresses: number,
  lastFaucetCursor: string | null,
  lastNetworkTotalTx?: number,
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'STATE', sk: 'COLLECTOR' },
    UpdateExpression: 'SET lastCollectedDate = :lcd, totalKnownAddresses = :tka, lastFaucetCursor = :lfc, lastNetworkTotalTx = :lntt',
    ExpressionAttributeValues: {
      ':lcd': lastCollectedDate,
      ':tka': totalKnownAddresses,
      ':lfc': lastFaucetCursor,
      ':lntt': lastNetworkTotalTx ?? null,
    },
  }));
}

// -- TX count via snapshot diff --

function computeTransactionCount(
  state: CollectorState | null,
  currentTotal: number | undefined,
): number | null {
  if (currentTotal == null) return null;
  if (state?.lastNetworkTotalTx == null) return null; // First run
  const diff = currentTotal - state.lastNetworkTotalTx;
  return diff >= 0 ? diff : null; // Guard against network reset
}

// -- Main handler --

export async function handler(event: CollectMetricsEvent): Promise<void> {
  const startTime = Date.now();
  const targetDate = event.customDate || getYesterdayDateString();
  const force = event.force === true;

  console.log(`Collecting metrics for ${targetDate} (force=${force})`);

  // Step 0: Health check + snapshot current network TX total
  let latestSeq: string;
  let currentNetworkTotalTx: number | undefined;
  try {
    latestSeq = await healthCheck();
    console.log(`RPC health check passed (latest checkpoint: ${latestSeq})`);

    const checkpoint = await getCheckpoint(latestSeq);
    currentNetworkTotalTx = Number(checkpoint.networkTotalTransactions);
    console.log(`Network total transactions: ${currentNetworkTotalTx}`);
  } catch (err) {
    console.error('RPC health check failed, aborting:', err instanceof Error ? err.message : err);
    throw new Error('RPC health check failed');
  }

  // Idempotency check
  if (!force) {
    const existing = await getMetrics(targetDate);
    if (existing) {
      console.log(`Metrics for ${targetDate} already exist (dau=${existing.dau}). Skipping. Use force=true to override.`);
      return;
    }

    // Also check STATE for daily auto-runs (skip if already collected today's target)
    if (!event.customDate) {
      const state = await getState();
      if (state?.lastCollectedDate === targetDate) {
        console.log(`Already collected for ${targetDate}. Skipping.`);
        return;
      }
    }
  }

  // Step 1: Address discovery (incremental via faucet TX scan)
  const state = await getState();
  const previousCursor = state?.lastFaucetCursor ?? null;

  console.log(`Discovering addresses from faucet (cursor: ${previousCursor ? previousCursor.slice(0, 16) + '...' : 'null'})`);

  const discovery = await discoverAddressesFromFaucet(
    FAUCET_ADDRESS,
    EXCLUDED_ADDRESSES,
    previousCursor,
  );

  // Save newly discovered addresses with their actual faucet TX date
  let newlySaved = 0;
  for (const addr of discovery.addresses) {
    const firstSeenDate = discovery.addressDates.get(addr) ?? targetDate;
    await saveAddress(addr, firstSeenDate);
    newlySaved++;
  }
  console.log(`Discovery: ${discovery.addresses.length} addresses found, ${newlySaved} save attempts`);

  // Step 2: Get all known addresses
  const allAddresses = await getAllKnownAddresses();
  console.log(`Total known addresses: ${allAddresses.length}`);

  if (allAddresses.length === 0) {
    console.warn('No known addresses found. Writing zero metrics.');
    const txCount = computeTransactionCount(state, currentNetworkTotalTx);
    await saveMetrics({
      pk: `METRICS#${targetDate}`,
      sk: 'DAILY',
      dau: 0,
      newAddresses: 0,
      cumulativeAddresses: 0,
      transactionCount: txCount ?? undefined,
      collectedAt: new Date().toISOString(),
      executionDurationMs: Date.now() - startTime,
    });
    await updateState(targetDate, 0, discovery.lastCursor, currentNetworkTotalTx);
    return;
  }

  // Step 3: Check activity with concurrency + circuit breaker
  const { startMs, endMs } = dateToDayBounds(targetDate);
  const { results, failureCount } = await checkBatchActivity(allAddresses, startMs, endMs, 50);

  const failureRate = failureCount / allAddresses.length;
  if (failureRate > 0.5) {
    console.error(`Circuit breaker: ${failureCount}/${allAddresses.length} activity checks failed (${(failureRate * 100).toFixed(0)}%). Aborting.`);
    throw new Error(`Circuit breaker triggered: ${(failureRate * 100).toFixed(0)}% failure rate`);
  }

  // Step 4: Compute metrics
  const activeSet = new Set(
    results.filter((r) => r.active).map((r) => r.address),
  );
  const dauCount = activeSet.size;

  // Count new addresses by firstActiveDate (first day the address appeared in DAU).
  // For each active address: set firstActiveDate = min(existing ?? targetDate, targetDate).
  // This is forward-only correct and also handles out-of-order backfill runs.
  // Fallback for legacy records without firstActiveDate: use firstSeenDate (faucet drip date).
  let newAddressCount = 0;
  for (const addr of activeSet) {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `ADDRESS#${addr}`, sk: 'META' },
      ProjectionExpression: 'firstActiveDate, firstSeenDate',
    }));
    const item = result.Item as AddressRecord | undefined;
    const existing = item?.firstActiveDate;
    const nextFirstActive = existing && existing < targetDate ? existing : targetDate;

    if (nextFirstActive !== existing) {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `ADDRESS#${addr}`, sk: 'META' },
        UpdateExpression: 'SET firstActiveDate = :d',
        ExpressionAttributeValues: { ':d': nextFirstActive },
      }));
    }

    // "New on targetDate" = targetDate is the earliest known active day.
    // - If firstActiveDate was already tracked: new iff min(existing, targetDate) == targetDate.
    // - Legacy fallback (firstActiveDate unset before this run): use firstSeenDate.
    const isNew = existing !== undefined
      ? nextFirstActive === targetDate
      : (item?.firstSeenDate ?? targetDate) === targetDate;
    if (isNew) {
      newAddressCount++;
    }
  }

  // Step 4: Compute TX count (snapshot diff)
  const transactionCount = computeTransactionCount(state, currentNetworkTotalTx);
  if (transactionCount != null) {
    console.log(`Daily transaction count: ${transactionCount}`);
  } else {
    console.log('Daily transaction count: N/A (first run or unavailable)');
  }

  const metricsRecord: MetricsRecord = {
    pk: `METRICS#${targetDate}`,
    sk: 'DAILY',
    dau: dauCount,
    newAddresses: newAddressCount,
    cumulativeAddresses: allAddresses.length,
    transactionCount: transactionCount ?? undefined,
    collectedAt: new Date().toISOString(),
    executionDurationMs: Date.now() - startTime,
  };

  // Step 5: Save metrics (before updating state)
  await saveMetrics(metricsRecord);
  console.log(`Metrics saved: dau=${metricsRecord.dau}, new=${metricsRecord.newAddresses}, cumulative=${metricsRecord.cumulativeAddresses}, tx=${transactionCount ?? 'N/A'}`);

  // Step 6: Update state (only after metrics saved successfully)
  await updateState(targetDate, allAddresses.length, discovery.lastCursor, currentNetworkTotalTx);
  console.log(`State updated: lastCollectedDate=${targetDate}, cursor=${discovery.lastCursor?.slice(0, 16) ?? 'null'}, networkTotalTx=${currentNetworkTotalTx ?? 'N/A'}`);

  console.log(`Done in ${Date.now() - startTime}ms`);
}
