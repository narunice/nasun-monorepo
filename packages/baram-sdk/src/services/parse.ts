/**
 * Move field parsing — converts raw on-chain fields to typed AERRecord.
 * Ported from baram-sdk/services/aer.ts with typed JSON parsing additions.
 */

import type {
  AERRecord,
  AERStatus,
  FeeDetail,
  ModelMetadata,
  ExecutionConstraints,
  PaymentTokenType,
  TierLevel,
} from '../types/aer';
import { TIER_NAMES, STATUS_NAMES } from '../types/aer';
import { bytesToHex } from '../utils/bytes';

// === Option<T> parsers ===

export function parseOptionString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

export function parseOptionNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

export function parseOptionBytes(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return bytesToHex(val);
  if (Array.isArray(val)) return bytesToHex(val as number[]);
  return null;
}

// === JSON field parsers ===

export function parseFeeDetail(raw: string | null): FeeDetail | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      modelCreator: typeof parsed.modelCreator === 'number' ? parsed.modelCreator : undefined,
      royalty: typeof parsed.royalty === 'number' ? parsed.royalty : undefined,
      protocolFee: typeof parsed.protocolFee === 'number' ? parsed.protocolFee : undefined,
    };
  } catch {
    return null;
  }
}

export function parseModelMetadata(raw: string | null): ModelMetadata | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : undefined,
      version: typeof parsed.version === 'string' ? parsed.version : undefined,
      hash: typeof parsed.hash === 'string' ? parsed.hash : undefined,
      quantization: typeof parsed.quantization === 'string' ? parsed.quantization : undefined,
      parameters:
        typeof parsed.parameters === 'object' && parsed.parameters !== null
          ? parsed.parameters
          : undefined,
    };
  } catch {
    return null;
  }
}

export function parseConstraints(raw: string | null): ExecutionConstraints | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const result: ExecutionConstraints = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      result[key] = value;
    }
    return result;
  } catch {
    return null;
  }
}

// === Main parser ===

/**
 * Parse raw Move object fields into a typed AERRecord.
 * Handles Option<T> unwrapping and JSON field parsing.
 */
export function parseAERFields(
  fields: Record<string, unknown>,
  objectId: string,
): AERRecord {
  const executorTier = Math.min(Number(fields.executor_tier || 0), 3) as TierLevel;
  const status = Number(fields.status || 0) as AERStatus;
  const paymentToken = Number(fields.payment_token || 0) as PaymentTokenType;

  const rawPath = fields.delegation_path;
  const delegationPath: string[] = Array.isArray(rawPath) ? rawPath.map(String) : [];

  const rawFeeDetail = parseOptionString(fields.fee_detail);
  const rawModelMetadata = parseOptionString(fields.model_metadata);
  const rawConstraints = parseOptionString(fields.constraints);

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
    paymentToken,
    executorReceived: Number(fields.executor_received || 0),
    feeDetail: parseFeeDetail(rawFeeDetail),
    budgetId: parseOptionString(fields.budget_id),
    budgetRemaining: parseOptionNumber(fields.budget_remaining),

    // 4. WHAT
    modelName: String(fields.model_name || ''),
    modelMetadata: parseModelMetadata(rawModelMetadata),
    inputHash: bytesToHex((fields.input_hash as number[] | string) || ''),
    outputHash: bytesToHex((fields.output_hash as number[] | string) || ''),
    executionTimeMs: Number(fields.execution_time_ms || 0),

    // 5. WHY
    purpose: parseOptionString(fields.purpose),
    policyVersion: parseOptionNumber(fields.policy_version),
    constraints: parseConstraints(rawConstraints),

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
    statusName: STATUS_NAMES[status] || 'Unknown',

    // 8. CHAIN
    triggeredBy: parseOptionString(fields.triggered_by),
    triggeredAction: parseOptionString(fields.triggered_action),
  };
}
