/**
 * Devnet Daily Metrics Collector (v2 — explorer-api HTTP)
 *
 * Fetches daily metrics from explorer-api
 * (`/api/v1/stats/daily-metrics?date=YYYY-MM-DD`) and writes them to the
 * devnet-metrics DynamoDB table.
 *
 * The endpoint computes DAU / newAddresses / cumulativeAddresses from
 * nasun_points.activity_points (single SQL, ~1s) and dailyTx from
 * sui-indexer checkpoints when available. This replaces the legacy
 * per-address RPC activity-check loop which was scaling linearly with
 * cumulative address count and hitting the 15-min Lambda timeout.
 *
 * Trigger: EventBridge daily at 00:30 UTC, or manual invoke with
 * `{ date: "YYYY-MM-DD", force?: boolean }`.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE_NAME = process.env.DEVNET_METRICS_TABLE || 'devnet-metrics';
const EXPLORER_API_BASE =
  process.env.EXPLORER_API_BASE || 'https://explorer.nasun.io/api/v1';
const FETCH_TIMEOUT_MS = 30_000;

interface CollectEvent {
  date?: string;
  force?: boolean;
}

interface DailyMetricsResponse {
  date: string;
  dau: number;
  newAddresses: number;
  cumulativeAddresses: number;
  dailyTx: number | null;
}

function yesterdayUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchDailyMetrics(date: string): Promise<DailyMetricsResponse> {
  const url = `${EXPLORER_API_BASE}/stats/daily-metrics?date=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`explorer-api ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as DailyMetricsResponse;
}

export const handler = async (event: CollectEvent = {}): Promise<void> => {
  const targetDate = event.date ?? yesterdayUtc();
  const force = event.force === true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(`Invalid date: ${targetDate}`);
  }

  console.log(`Collecting metrics for ${targetDate} (force=${force})`);

  // Idempotency: skip if already collected and not forced
  if (!force) {
    const existing = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `METRICS#${targetDate}`, sk: 'DAILY' },
      }),
    );
    if (existing.Item) {
      console.log(
        `Already collected for ${targetDate} (dau=${existing.Item.dau}). Skipping. Use force=true to override.`,
      );
      return;
    }
  }

  const metrics = await fetchDailyMetrics(targetDate);
  console.log(
    `Fetched: dau=${metrics.dau} new=${metrics.newAddresses} cum=${metrics.cumulativeAddresses} tx=${metrics.dailyTx ?? 'null'}`,
  );

  // UpdateItem preserves any pre-existing attributes we don't overwrite
  // (notably: transactionCount from RPC-based historical backfill for dates
  // the indexer can't cover). Only set transactionCount when the endpoint
  // actually returned a value.
  const exprSet = [
    'dau = :dau',
    'newAddresses = :new',
    'cumulativeAddresses = :cum',
    'collectedAt = :at',
    '#src = :src',
  ];
  const values: Record<string, unknown> = {
    ':dau': metrics.dau,
    ':new': metrics.newAddresses,
    ':cum': metrics.cumulativeAddresses,
    ':at': new Date().toISOString(),
    ':src': 'explorer-api-daily-metrics',
  };
  if (metrics.dailyTx !== null) {
    exprSet.push('transactionCount = :tx');
    values[':tx'] = metrics.dailyTx;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `METRICS#${targetDate}`, sk: 'DAILY' },
      UpdateExpression: 'SET ' + exprSet.join(', '),
      ExpressionAttributeNames: { '#src': 'source' },
      ExpressionAttributeValues: values,
    }),
  );

  console.log(`Saved metrics for ${targetDate}`);
};
