/**
 * useAERRecords - Query AIExecutionReport objects
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

// AER reports are owned by the authorizer (requester)
async function fetchAERRecords(ownerAddress: string): Promise<AERRecord[]> {
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

  // Sort by settled_at descending (newest first)
  records.sort((a, b) => b.settledAt - a.settledAt);
  return records;
}

export function useAERRecords(ownerAddress: string | null) {
  return useQuery({
    queryKey: ['aerRecords', ownerAddress],
    queryFn: () => fetchAERRecords(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
