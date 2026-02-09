/**
 * AER (AI Execution Report) on-chain fetch service
 */

import type { SuiClient, EventId } from '@mysten/sui/client';
import type { BaramConfig, AERData, TierLevel } from '../types';
import { AER_STATUS_NAMES, TIER_NAMES } from '../types';

// Max pages to paginate when searching for a specific AER event (50 events/page)
const MAX_EVENT_PAGES = 10;

function bytesToHex(bytes: number[] | string): string {
  if (typeof bytes === 'string') return bytes;
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseOptionString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function parseOptionNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

function parseOptionBytes(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return bytesToHex(val as number[] | string);
}

function parseAERFields(fields: Record<string, unknown>, objectId: string): AERData {
  const executorTier = Math.min(Number(fields.executor_tier || 0), 3) as TierLevel;
  const status = Number(fields.status || 0);

  // Parse delegation_path: vector<address>
  const rawPath = fields.delegation_path;
  const delegationPath: string[] = Array.isArray(rawPath) ? rawPath.map(String) : [];

  return {
    objectId,
    requestId: Number(fields.request_id || 0),
    // 1. WHO — Requester
    initiator: String(fields.initiator || ''),
    authorizer: String(fields.authorizer || ''),
    delegationPath,
    // 2. WHO — Executor
    executor: String(fields.executor || ''),
    executorPrincipal: parseOptionString(fields.executor_principal),
    // 3. HOW MUCH
    paymentAmount: Number(fields.payment_amount || 0),
    paymentToken: Number(fields.payment_token || 0),
    executorReceived: Number(fields.executor_received || 0),
    feeDetail: parseOptionString(fields.fee_detail),
    budgetId: parseOptionString(fields.budget_id),
    budgetRemaining: parseOptionNumber(fields.budget_remaining),
    // 4. WHAT
    modelName: String(fields.model_name || ''),
    modelMetadata: parseOptionString(fields.model_metadata),
    inputHash: bytesToHex(fields.input_hash as number[] | string),
    outputHash: bytesToHex(fields.output_hash as number[] | string),
    executionTimeMs: Number(fields.execution_time_ms || 0),
    // 5. WHY
    purpose: parseOptionString(fields.purpose),
    policyVersion: parseOptionNumber(fields.policy_version),
    constraints: parseOptionString(fields.constraints),
    // 6. HOW TRUSTWORTHY
    executorTier,
    executorTierName: TIER_NAMES[executorTier],
    executorReputation: Number(fields.executor_reputation || 0),
    executorStakeAmount: Number(fields.executor_stake_amount || 0),
    teeVerified: Boolean(fields.tee_verified),
    teeAttestationHash: parseOptionBytes(fields.tee_attestation_hash),
    // 7. WHEN
    requestedAt: Number(fields.requested_at || 0),
    settledAt: Number(fields.settled_at || 0),
    status,
    statusName: AER_STATUS_NAMES[status] || 'Unknown',
    // 8. CHAIN
    triggeredBy: parseOptionString(fields.triggered_by),
    triggeredAction: parseOptionString(fields.triggered_action),
  };
}

/**
 * Fetch AER by request ID via ExecutionReportCreated event query.
 * Returns null if no AER exists for this request.
 */
export async function fetchAERByRequestId(
  client: SuiClient,
  config: BaramConfig,
  requestId: number,
): Promise<AERData | null> {
  if (!config.aer.packageId) {
    return null;
  }

  try {
    // Paginate through events to find the matching requestId
    let cursor: EventId | null | undefined = null;
    let hasNextPage = true;
    let pageCount = 0;
    let recordId: string | null = null;

    while (hasNextPage && pageCount < MAX_EVENT_PAGES) {
      pageCount++;
      const events = await client.queryEvents({
        query: {
          MoveEventType: `${config.aer.packageId}::aer::ExecutionReportCreated`,
        },
        limit: 50,
        order: 'descending',
        ...(cursor !== null ? { cursor } : {}),
      });

      const match = events.data.find(event => {
        const json = event.parsedJson as { request_id?: string | number };
        return Number(json?.request_id) === requestId;
      });

      if (match) {
        recordId = (match.parsedJson as { record_id?: string }).record_id ?? null;
        break;
      }

      hasNextPage = events.hasNextPage;
      cursor = events.nextCursor;
    }

    if (!recordId) return null;

    const obj = await client.getObject({
      id: recordId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    return parseAERFields(fields, recordId);
  } catch {
    return null;
  }
}
