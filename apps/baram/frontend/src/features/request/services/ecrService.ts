/**
 * ECR (ExecutionComplianceRecord) on-chain fetch service
 *
 * Fetches ECR data by querying ComplianceRecordCreated events,
 * then loading the full object from chain.
 */

import { COMPLIANCE_CONFIG, TEE_TYPES, TeeType, TIER_NAMES, TierLevel } from '@/config/network';
import { suiClient } from '@/config/client';

// Mirrors compliance.move ExecutionComplianceRecord fields
export interface ECRData {
  objectId: string;

  // Execution Context
  requestId: number;
  requester: string;
  executor: string;
  model: string;
  promptHash: string; // hex

  // Execution Result
  resultHash: string; // hex
  executionTimeMs: number;

  // Environment Proof
  teeType: number;
  teeTypeName: string;
  pcr0: string; // hex
  attestationHash: string; // hex
  pcrBaselineVersion: number;
  pcrVerified: boolean;

  // Credibility Snapshot
  executorReputation: number;
  executorStakeAmount: number; // in SOE (9 decimals)
  executorSlashCount: number;
  executorTier: TierLevel;
  executorTierName: string;

  // Economic Finality
  paymentAmount: number; // in NUSDC smallest unit (6 decimals)

  // Temporal Proof
  requestCreatedAt: number; // ms since epoch
  settledAt: number; // ms since epoch

  // Policy Snapshot
  policyVersion: number;
  timeoutMs: number;
  minPrice: number;
}

function bytesToHex(bytes: number[] | string): string {
  if (typeof bytes === 'string') return bytes;
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseECRFields(fields: Record<string, unknown>, objectId: string): ECRData {
  const teeType = Number(fields.tee_type || 0) as TeeType;
  const executorTier = Math.min(Number(fields.executor_tier || 0), 3) as TierLevel;

  return {
    objectId,
    requestId: Number(fields.request_id || 0),
    requester: String(fields.requester || ''),
    executor: String(fields.executor || ''),
    model: String(fields.model || ''),
    promptHash: bytesToHex(fields.prompt_hash as number[] | string),
    resultHash: bytesToHex(fields.result_hash as number[] | string),
    executionTimeMs: Number(fields.execution_time_ms || 0),
    teeType,
    teeTypeName: TEE_TYPES[teeType] || 'Unknown',
    pcr0: bytesToHex(fields.pcr0 as number[] | string),
    attestationHash: bytesToHex(fields.attestation_hash as number[] | string),
    pcrBaselineVersion: Number(fields.pcr_baseline_version || 0),
    pcrVerified: Boolean(fields.pcr_verified),
    executorReputation: Number(fields.executor_reputation || 0),
    executorStakeAmount: Number(fields.executor_stake_amount || 0),
    executorSlashCount: Number(fields.executor_slash_count || 0),
    executorTier,
    executorTierName: TIER_NAMES[executorTier],
    paymentAmount: Number(fields.payment_amount || 0),
    requestCreatedAt: Number(fields.request_created_at || 0),
    settledAt: Number(fields.settled_at || 0),
    policyVersion: Number(fields.policy_version || 0),
    timeoutMs: Number(fields.timeout_ms || 0),
    minPrice: Number(fields.min_price || 0),
  };
}

/**
 * Fetch ECR by request ID via ComplianceRecordCreated event query.
 * Returns null if no ECR exists for this request.
 */
export async function fetchECRByRequestId(requestId: number): Promise<ECRData | null> {
  const client = suiClient;

  if (!COMPLIANCE_CONFIG.packageId) {
    console.warn('[ECR] Compliance package ID not configured');
    return null;
  }

  try {
    // Query ComplianceRecordCreated events filtered by module
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${COMPLIANCE_CONFIG.packageId}::compliance::ComplianceRecordCreated`,
      },
      limit: 50,
      order: 'descending',
    });

    // Find event matching our request_id
    const matchingEvent = events.data.find(event => {
      const json = event.parsedJson as { request_id?: string | number };
      return Number(json?.request_id) === requestId;
    });

    if (!matchingEvent) {
      console.log(`[ECR] No ECR found for request #${requestId}`);
      return null;
    }

    const eventJson = matchingEvent.parsedJson as { record_id?: string };
    const recordId = eventJson.record_id;

    if (!recordId) {
      console.warn('[ECR] Event missing record_id');
      return null;
    }

    // Fetch the full ECR object
    const obj = await client.getObject({
      id: recordId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      console.warn('[ECR] Invalid ECR object');
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    return parseECRFields(fields, recordId);
  } catch (err) {
    console.error('[ECR] Failed to fetch ECR:', err);
    return null;
  }
}
