/**
 * ResultStore - DynamoDB service for storing AI execution result text.
 * Results are stored with a 7-day TTL for cost-efficient temporary retention.
 * The on-chain AER always retains the result hash for permanent verification.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { ResultRecord } from '../types';

let docClient: DynamoDBDocumentClient | null = null;
let tableName = '';

const TTL_DAYS = 7;

export function initResultStore(config: { tableName: string }): void {
  const client = new DynamoDBClient({});
  docClient = DynamoDBDocumentClient.from(client);
  tableName = config.tableName;
  console.log(`[ResultStore] Initialized, table: ${tableName}, TTL: ${TTL_DAYS}d`);
}

export function isResultStoreInitialized(): boolean {
  return docClient !== null;
}

export async function saveResult(params: {
  requestId: number;
  requesterAddress: string;
  result: string;
  resultHash: string;
  model: string;
  purpose: string;
}): Promise<void> {
  if (!docClient) return;

  const now = Date.now();
  const ttl = Math.floor(now / 1000) + TTL_DAYS * 86400;

  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: {
      requestId: params.requestId,
      requesterAddress: params.requesterAddress,
      result: params.result,
      resultHash: params.resultHash,
      model: params.model,
      purpose: params.purpose,
      createdAt: now,
      ttl,
    },
  }));

  console.log(`[ResultStore] Saved requestId=${params.requestId}`);
}

export async function getResult(requestId: number): Promise<ResultRecord | null> {
  if (!docClient) {
    console.warn('[ResultStore] Not initialized — RESULT_TABLE_NAME may not be set');
    return null;
  }

  const res = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { requestId },
  }));

  const item = res.Item as ResultRecord | undefined;
  if (!item) return null;

  // TTL deletion is eventually consistent (up to 48h lag).
  // Filter out expired items that haven't been physically deleted yet.
  if (item.ttl < Math.floor(Date.now() / 1000)) return null;

  return item;
}
