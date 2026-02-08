/**
 * AER (AI Execution Report) on-chain fetch service
 *
 * Fetches AER data by querying ExecutionReportCreated events,
 * then loading the full object from chain.
 */

import { AER_CONFIG, AER_STATUS_NAMES, TIER_NAMES, type TierLevel } from '@/config/network';
import { suiClient } from '@/config/client';

// Mirrors aer.move AIExecutionReport fields (8 categories)
export interface AERData {
  objectId: string;
  requestId: number;

  // 1. WHO — Requester
  initiator: string;
  authorizer: string;
  delegationPath: string[];

  // 2. WHO — Executor
  executor: string;
  executorPrincipal: string | null;

  // 3. HOW MUCH
  paymentAmount: number;
  paymentToken: number;
  executorReceived: number;
  feeDetail: string | null;
  budgetId: string | null;
  budgetRemaining: number | null;

  // 4. WHAT
  modelName: string;
  modelMetadata: string | null;
  inputHash: string;
  outputHash: string;
  executionTimeMs: number;

  // 5. WHY
  purpose: string | null;
  policyVersion: number | null;
  constraints: string | null;

  // 6. HOW TRUSTWORTHY
  executorTier: TierLevel;
  executorTierName: string;
  executorReputation: number;
  executorStakeAmount: number;
  teeVerified: boolean;
  teeAttestationHash: string | null;

  // 7. WHEN
  requestedAt: number;
  settledAt: number;
  status: number;
  statusName: string;

  // 8. CHAIN
  triggeredBy: string | null;
  triggeredAction: string | null;
}

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
export async function fetchAERByRequestId(requestId: number): Promise<AERData | null> {
  const client = suiClient;

  if (!AER_CONFIG.packageId) {
    console.warn('[AER] AER package ID not configured');
    return null;
  }

  try {
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${AER_CONFIG.packageId}::aer::ExecutionReportCreated`,
      },
      limit: 50,
      order: 'descending',
    });

    const matchingEvent = events.data.find(event => {
      const json = event.parsedJson as { request_id?: string | number };
      return Number(json?.request_id) === requestId;
    });

    if (!matchingEvent) {
      return null;
    }

    const eventJson = matchingEvent.parsedJson as { record_id?: string };
    const recordId = eventJson.record_id;

    if (!recordId) {
      console.warn('[AER] Event missing record_id');
      return null;
    }

    const obj = await client.getObject({
      id: recordId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      console.warn('[AER] Invalid AER object');
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    return parseAERFields(fields, recordId);
  } catch (err) {
    console.error('[AER] Failed to fetch AER:', err);
    return null;
  }
}
