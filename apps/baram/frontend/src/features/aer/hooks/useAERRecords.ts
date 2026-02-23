/**
 * useAERRecords - Query AIExecutionReport records via indexer API with RPC fallback.
 *
 * When VITE_AER_INDEXER_API_URL is configured, fetches from the baram API server.
 * Falls back to direct RPC getOwnedObjects when indexer is unavailable.
 */

import { useQuery } from '@tanstack/react-query';
import { suiClient } from '../../../config/client';
import { AER_CONFIG, AER_STATUS_NAMES } from '../../../config/network';
import { parseOptionField } from '../../../utils/format';

export interface AERRecord {
  id: string;
  requestId: number;
  authorizer: string;
  executor: string;
  modelName: string;
  paymentAmount: number;
  executionTimeMs: number;
  status: number;
  statusName: string;
  settledAt: number;
  requestedAt: number;
  purpose: string;
  teeVerified: boolean;
  executorTier: number;
  budgetId: string;
  budgetRemaining: number;
}

// === Indexer API fetch ===

interface IndexerApiResponse {
  data: Array<{
    objectId: string;
    requestId: number;
    authorizer: string;
    executor: string;
    modelName: string;
    paymentAmount: number;
    executionTimeMs: number;
    status: number;
    statusName: string;
    settledAt: number;
    requestedAt: number;
    purpose: string | null;
    teeVerified: boolean;
    executorTier: number;
    budgetId: string | null;
    budgetRemaining: number | null;
  }>;
  hasNextPage: boolean;
  nextCursor: string | null;
}

function mapIndexerRecord(row: IndexerApiResponse['data'][number]): AERRecord {
  return {
    id: row.objectId,
    requestId: row.requestId,
    authorizer: row.authorizer,
    executor: row.executor,
    modelName: row.modelName,
    paymentAmount: row.paymentAmount,
    executionTimeMs: row.executionTimeMs,
    status: row.status,
    statusName: row.statusName,
    settledAt: row.settledAt,
    requestedAt: row.requestedAt,
    purpose: row.purpose ?? '',
    teeVerified: row.teeVerified,
    executorTier: row.executorTier,
    budgetId: row.budgetId ?? '',
    budgetRemaining: row.budgetRemaining ?? 0,
  };
}

async function fetchFromIndexer(ownerAddress: string): Promise<AERRecord[]> {
  const baseUrl = AER_CONFIG.indexerApiUrl;
  const url = `${baseUrl}/api/v1/aer?authorizer=${encodeURIComponent(ownerAddress)}&limit=200&order=desc`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Indexer API error: ${res.status}`);

  const json: IndexerApiResponse = await res.json();
  return json.data.map(mapIndexerRecord);
}

// === RPC fallback (original implementation) ===

function parseAERRecord(fields: Record<string, unknown>): AERRecord | null {
  try {
    return {
      id: (fields.id as Record<string, string>)?.id ?? '',
      requestId: Number(fields.request_id ?? 0),
      authorizer: fields.authorizer as string ?? '',
      executor: fields.executor as string ?? '',
      modelName: fields.model_name as string ?? '',
      paymentAmount: Number(fields.payment_amount ?? 0),
      executionTimeMs: Number(fields.execution_time_ms ?? 0),
      status: Number(fields.status ?? 0),
      statusName: AER_STATUS_NAMES[Number(fields.status ?? 0)] ?? 'Unknown',
      settledAt: Number(fields.settled_at ?? 0),
      requestedAt: Number(fields.requested_at ?? 0),
      purpose: parseOptionField<string>(fields.purpose) ?? '',
      teeVerified: fields.tee_verified as boolean ?? false,
      executorTier: Number(fields.executor_tier ?? 0),
      budgetId: parseOptionField<string>(fields.budget_id) ?? '',
      budgetRemaining: Number(parseOptionField<string>(fields.budget_remaining) ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchFromRpc(ownerAddress: string): Promise<AERRecord[]> {
  const aerType = `${AER_CONFIG.packageId}::aer::AIExecutionReport`;
  const records: AERRecord[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const result = await suiClient.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: aerType },
      options: { showContent: true },
      cursor,
    });

    for (const item of result.data) {
      if (item.data?.content?.dataType === 'moveObject') {
        const parsed = parseAERRecord(item.data.content.fields as Record<string, unknown>);
        if (parsed) records.push(parsed);
      }
    }

    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  records.sort((a, b) => b.settledAt - a.settledAt);
  return records;
}

// === Dual-mode fetch ===

async function fetchAERRecords(ownerAddress: string): Promise<AERRecord[]> {
  if (AER_CONFIG.indexerApiUrl) {
    try {
      return await fetchFromIndexer(ownerAddress);
    } catch {
      // Indexer unavailable — fall back to RPC
    }
  }
  return fetchFromRpc(ownerAddress);
}

export function useAERRecords(ownerAddress: string | null) {
  return useQuery({
    queryKey: ['aerRecords', ownerAddress],
    queryFn: () => fetchAERRecords(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: AER_CONFIG.indexerApiUrl ? 30000 : 15000,
    staleTime: AER_CONFIG.indexerApiUrl ? 20000 : 10000,
  });
}
