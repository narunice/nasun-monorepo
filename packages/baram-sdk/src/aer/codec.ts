/**
 * AER v2 BCS codec.
 *
 * BCS schemas mirror the Move struct hierarchy in
 * `apps/baram/contracts-aer/sources/aer.move`. Field order MUST match Move
 * declaration order; do not reorder. Spec: `apps/baram/docs/AER_V2_CODEC.md`.
 */

import { bcs } from '@mysten/sui/bcs';

import {
  ACTION_OUTCOME_TAG,
  EVENT_CLASS_TAG,
  TRIGGER_TYPE_TAG,
  type AERReport,
  type ActionEnvelope,
  type ActionOutcome,
  type EventClass,
  type TriggerType,
} from './types';
import { compareKeysCanonical, computePayloadHash, isCanonicalKeySequence } from './helpers';

// ===== Error classes =====

export class AERCodecError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AERCodecError';
  }
}

// ===== Raw BCS shapes (1:1 with Move) =====
//
// These mirror Move structs exactly. They speak in u64-as-string and
// address-as-hex like the rest of @mysten/sui/bcs. Higher-level types
// (AERReport) use bigint and 0x-prefixed hex; conversion happens in
// `toAERReport` / `fromAERReport`.

const Bytes = bcs.vector(bcs.u8());
const OptionBytes = bcs.option(Bytes);
const OptionString = bcs.option(bcs.string());
const OptionAddress = bcs.option(bcs.Address);
const OptionU64 = bcs.option(bcs.u64());

// VecMap<String, vector<u8>>
const VecMapEntry = bcs.struct('VecMapEntry', {
  key: bcs.string(),
  value: Bytes,
});
const VecMap = bcs.struct('VecMap', {
  contents: bcs.vector(VecMapEntry),
});

const RequesterContext = bcs.struct('RequesterContext', {
  initiator: bcs.Address,
  authorizer: bcs.Address,
  delegation_path: bcs.vector(bcs.Address),
});

const ExecutorContext = bcs.struct('ExecutorContext', {
  executor: bcs.Address,
  executor_principal: OptionAddress,
});

const PaymentContext = bcs.struct('PaymentContext', {
  payment_amount: bcs.u64(),
  payment_token: bcs.u8(),
  executor_received: bcs.u64(),
  fee_detail: OptionString,
  budget_id: OptionAddress,
  budget_remaining: OptionU64,
});

const InferenceContext = bcs.struct('InferenceContext', {
  model_name: bcs.string(),
  model_metadata: OptionString,
  input_hash: Bytes,
  output_hash: Bytes,
  execution_time_ms: bcs.u64(),
});

const WhyContext = bcs.struct('WhyContext', {
  purpose: OptionString,
  policy_version: OptionU64,
  // Plan B: snapshotted cap.version on the gated path, None on ungated.
  // Wire-position between policy_version and constraints - do not reorder.
  capability_version: OptionU64,
  constraints: OptionString,
});

const TrustContext = bcs.struct('TrustContext', {
  executor_tier: bcs.u8(),
  executor_reputation: bcs.u64(),
  executor_stake_amount: bcs.u64(),
  tee_verified: bcs.bool(),
  tee_attestation_hash: OptionBytes,
});

const TimeContext = bcs.struct('TimeContext', {
  requested_at: bcs.u64(),
  settled_at: bcs.u64(),
  status: bcs.u8(),
});

const IntentLineage = bcs.struct('IntentLineage', {
  intent_id: Bytes,
  parent_intent_id: OptionBytes,
  execution_id: bcs.u32(),
});

const ChainContext = bcs.struct('ChainContext', {
  triggered_by: OptionAddress,
  triggered_action: OptionAddress,
  lineage: IntentLineage,
});

const ActionEnvelopeBcs = bcs.struct('ActionEnvelope', {
  event_class: bcs.u8(),
  action_type: bcs.string(),
  action_schema_version: bcs.u16(),
  payload_codec: bcs.string(),
  payload_hash: Bytes,
  payload_bytes: Bytes,
  action_summary: bcs.string(),
  action_outcome: bcs.u8(),
});

const WakeContextBcs = bcs.struct('WakeContext', {
  triggered_by_type: bcs.u8(),
  triggered_by_ref: OptionString,
});

const ReplayContextBcs = bcs.struct('ReplayContext', {
  model_version: bcs.string(),
  prompt_template_hash: Bytes,
  market_snapshot_hash: OptionBytes,
  replay_extras: VecMap,
});

/**
 * Top-level AIExecutionReport BCS. Includes the leading UID-as-address.
 * RPC's `showBcs: true` returns the full struct including the UID.
 */
export const AIExecutionReportBcs = bcs.struct('AIExecutionReport', {
  id: bcs.Address,
  request_id: bcs.u64(),
  requester: RequesterContext,
  executor: ExecutorContext,
  payment: PaymentContext,
  inference: InferenceContext,
  why: WhyContext,
  trust: TrustContext,
  time: TimeContext,
  chain: ChainContext,
  envelope: ActionEnvelopeBcs,
  wake: WakeContextBcs,
  replay: ReplayContextBcs,
});

// ===== Enum mapping =====

const EVENT_CLASS_REVERSE: Record<number, EventClass> = {
  1: 'cognition',
  2: 'execution',
  3: 'settlement',
  4: 'observation',
  5: 'coordination',
};

const ACTION_OUTCOME_REVERSE: Record<number, ActionOutcome> = {
  1: 'success',
  2: 'hold-noop',
  3: 'failure',
};

const TRIGGER_TYPE_REVERSE: Record<number, TriggerType> = {
  1: 'heartbeat',
  2: 'user_message',
  3: 'price_alert',
  4: 'manual',
};

function eventClassFromTag(tag: number): EventClass {
  return EVENT_CLASS_REVERSE[tag] ?? 'unknown';
}
function actionOutcomeFromTag(tag: number): ActionOutcome {
  return ACTION_OUTCOME_REVERSE[tag] ?? 'unknown';
}
function triggerTypeFromTag(tag: number): TriggerType {
  return TRIGGER_TYPE_REVERSE[tag] ?? 'unknown';
}

function eventClassToTag(value: EventClass): number {
  if (value === 'unknown') {
    throw new AERCodecError(
      'Cannot encode "unknown" event_class. Use a concrete enum value.',
      'AER_INVALID_EVENT_CLASS_ENCODE',
    );
  }
  return EVENT_CLASS_TAG[value];
}
function actionOutcomeToTag(value: ActionOutcome): number {
  if (value === 'unknown') {
    throw new AERCodecError(
      'Cannot encode "unknown" action_outcome. Use a concrete enum value.',
      'AER_INVALID_ACTION_OUTCOME_ENCODE',
    );
  }
  return ACTION_OUTCOME_TAG[value];
}
function triggerTypeToTag(value: TriggerType): number {
  if (value === 'unknown') {
    throw new AERCodecError(
      'Cannot encode "unknown" triggered_by_type. Use a concrete enum value.',
      'AER_INVALID_TRIGGER_TYPE_ENCODE',
    );
  }
  return TRIGGER_TYPE_TAG[value];
}

// ===== Helpers for Uint8Array conversions =====

function toU8(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new AERCodecError(`expected byte array, got ${typeof value}`, 'AER_BAD_BYTES');
}

function optToU8(value: unknown): Uint8Array | null {
  if (value === null || value === undefined) return null;
  return toU8(value);
}

// ===== payload_hash validation =====

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ===== Decode =====

/**
 * Decode a BCS-encoded AIExecutionReport.
 *
 * Validates:
 * - replay_extras keys are in strict-ascending UTF-8 byte order
 * - envelope.payload_hash === SHA-256(action_type_bytes || payload_bytes)
 *
 * Surfaces unknown enum values as `"unknown"` (forward-compat).
 *
 * @throws AERCodecError on validation failure.
 */
export function decodeAER(bytes: Uint8Array): AERReport {
  const raw = AIExecutionReportBcs.parse(bytes);
  return normalizeRaw(raw);
}

function normalizeRaw(raw: ReturnType<typeof AIExecutionReportBcs.parse>): AERReport {
  // Validate replay_extras canonical ordering.
  const keys = raw.replay.replay_extras.contents.map((e) => e.key);
  if (!isCanonicalKeySequence(keys)) {
    throw new AERCodecError(
      'replay_extras keys are not in strict-ascending UTF-8 byte order (or duplicate present)',
      'AER_NONCANONICAL_REPLAY_EXTRAS',
    );
  }

  // Decode envelope first so we can validate payload_hash.
  const envelope: ActionEnvelope = {
    eventClass: eventClassFromTag(raw.envelope.event_class),
    actionType: raw.envelope.action_type,
    actionSchemaVersion: raw.envelope.action_schema_version,
    payloadCodec: 'bcs',
    payloadHash: toU8(raw.envelope.payload_hash),
    payloadBytes: toU8(raw.envelope.payload_bytes),
    actionSummary: raw.envelope.action_summary,
    actionOutcome: actionOutcomeFromTag(raw.envelope.action_outcome),
  };

  if (raw.envelope.payload_codec !== 'bcs') {
    throw new AERCodecError(
      `unsupported payload_codec: ${raw.envelope.payload_codec}`,
      'AER_UNSUPPORTED_PAYLOAD_CODEC',
    );
  }

  const expected = computePayloadHash(envelope.actionType, envelope.payloadBytes);
  if (!bytesEqual(expected, envelope.payloadHash)) {
    throw new AERCodecError(
      'payload_hash mismatch: expected SHA-256(action_type || payload_bytes)',
      'AER_PAYLOAD_HASH_MISMATCH',
    );
  }

  return {
    id: raw.id,
    requestId: BigInt(raw.request_id),
    requester: {
      initiator: raw.requester.initiator,
      authorizer: raw.requester.authorizer,
      delegationPath: raw.requester.delegation_path,
    },
    executor: {
      executor: raw.executor.executor,
      executorPrincipal: raw.executor.executor_principal,
    },
    payment: {
      paymentAmount: BigInt(raw.payment.payment_amount),
      paymentToken: raw.payment.payment_token,
      executorReceived: BigInt(raw.payment.executor_received),
      feeDetail: raw.payment.fee_detail,
      budgetId: raw.payment.budget_id,
      budgetRemaining: raw.payment.budget_remaining === null ? null : BigInt(raw.payment.budget_remaining),
    },
    inference: {
      modelName: raw.inference.model_name,
      modelMetadata: raw.inference.model_metadata,
      inputHash: toU8(raw.inference.input_hash),
      outputHash: toU8(raw.inference.output_hash),
      executionTimeMs: BigInt(raw.inference.execution_time_ms),
    },
    why: {
      purpose: raw.why.purpose,
      policyVersion: raw.why.policy_version === null ? null : BigInt(raw.why.policy_version),
      capabilityVersion:
        raw.why.capability_version === null ? null : BigInt(raw.why.capability_version),
      constraints: raw.why.constraints,
    },
    trust: {
      executorTier: raw.trust.executor_tier,
      executorReputation: BigInt(raw.trust.executor_reputation),
      executorStakeAmount: BigInt(raw.trust.executor_stake_amount),
      teeVerified: raw.trust.tee_verified,
      teeAttestationHash: optToU8(raw.trust.tee_attestation_hash),
    },
    time: {
      requestedAt: BigInt(raw.time.requested_at),
      settledAt: BigInt(raw.time.settled_at),
      status: raw.time.status,
    },
    chain: {
      triggeredBy: raw.chain.triggered_by,
      triggeredAction: raw.chain.triggered_action,
      lineage: {
        intentId: toU8(raw.chain.lineage.intent_id),
        parentIntentId: optToU8(raw.chain.lineage.parent_intent_id),
        executionId: raw.chain.lineage.execution_id,
      },
    },
    envelope,
    wake: {
      triggeredByType: triggerTypeFromTag(raw.wake.triggered_by_type),
      triggeredByRef: raw.wake.triggered_by_ref,
    },
    replay: {
      modelVersion: raw.replay.model_version,
      promptTemplateHash: toU8(raw.replay.prompt_template_hash),
      marketSnapshotHash: optToU8(raw.replay.market_snapshot_hash),
      replayExtras: raw.replay.replay_extras.contents.map((e): [string, Uint8Array] => [
        e.key,
        toU8(e.value),
      ]),
    },
  };
}

// ===== Encode =====

/**
 * Encode an AERReport back to canonical BCS bytes.
 *
 * Useful for round-trip tests, golden fixture generation, and host-side
 * pre-flight verification. The producer remains responsible for:
 * - Inserting `replay_extras` keys in strict-ascending UTF-8 byte order.
 *   (Validated here; this function throws on violation.)
 * - Ensuring `envelope.payload_hash === SHA-256(action_type || payload_bytes)`.
 *   (Validated here; this function throws on mismatch.)
 *
 * @throws AERCodecError on canonical violations.
 */
export function encodeAER(aer: AERReport): Uint8Array {
  // Pre-encode validation
  const keys = aer.replay.replayExtras.map(([k]) => k);
  if (!isCanonicalKeySequence(keys)) {
    throw new AERCodecError(
      'replay_extras keys not in strict-ascending order (or duplicate); call sort before encode',
      'AER_NONCANONICAL_REPLAY_EXTRAS',
    );
  }
  const expectedHash = computePayloadHash(aer.envelope.actionType, aer.envelope.payloadBytes);
  if (!bytesEqual(expectedHash, aer.envelope.payloadHash)) {
    throw new AERCodecError(
      'payload_hash does not match SHA-256(action_type || payload_bytes); recompute before encode',
      'AER_PAYLOAD_HASH_MISMATCH',
    );
  }

  return AIExecutionReportBcs.serialize({
    id: aer.id,
    request_id: aer.requestId.toString(),
    requester: {
      initiator: aer.requester.initiator,
      authorizer: aer.requester.authorizer,
      delegation_path: aer.requester.delegationPath,
    },
    executor: {
      executor: aer.executor.executor,
      executor_principal: aer.executor.executorPrincipal,
    },
    payment: {
      payment_amount: aer.payment.paymentAmount.toString(),
      payment_token: aer.payment.paymentToken,
      executor_received: aer.payment.executorReceived.toString(),
      fee_detail: aer.payment.feeDetail,
      budget_id: aer.payment.budgetId,
      budget_remaining: aer.payment.budgetRemaining === null ? null : aer.payment.budgetRemaining.toString(),
    },
    inference: {
      model_name: aer.inference.modelName,
      model_metadata: aer.inference.modelMetadata,
      input_hash: aer.inference.inputHash,
      output_hash: aer.inference.outputHash,
      execution_time_ms: aer.inference.executionTimeMs.toString(),
    },
    why: {
      purpose: aer.why.purpose,
      policy_version: aer.why.policyVersion === null ? null : aer.why.policyVersion.toString(),
      capability_version:
        aer.why.capabilityVersion === null ? null : aer.why.capabilityVersion.toString(),
      constraints: aer.why.constraints,
    },
    trust: {
      executor_tier: aer.trust.executorTier,
      executor_reputation: aer.trust.executorReputation.toString(),
      executor_stake_amount: aer.trust.executorStakeAmount.toString(),
      tee_verified: aer.trust.teeVerified,
      tee_attestation_hash: aer.trust.teeAttestationHash,
    },
    time: {
      requested_at: aer.time.requestedAt.toString(),
      settled_at: aer.time.settledAt.toString(),
      status: aer.time.status,
    },
    chain: {
      triggered_by: aer.chain.triggeredBy,
      triggered_action: aer.chain.triggeredAction,
      lineage: {
        intent_id: aer.chain.lineage.intentId,
        parent_intent_id: aer.chain.lineage.parentIntentId,
        execution_id: aer.chain.lineage.executionId,
      },
    },
    envelope: {
      event_class: eventClassToTag(aer.envelope.eventClass),
      action_type: aer.envelope.actionType,
      action_schema_version: aer.envelope.actionSchemaVersion,
      payload_codec: aer.envelope.payloadCodec,
      payload_hash: aer.envelope.payloadHash,
      payload_bytes: aer.envelope.payloadBytes,
      action_summary: aer.envelope.actionSummary,
      action_outcome: actionOutcomeToTag(aer.envelope.actionOutcome),
    },
    wake: {
      triggered_by_type: triggerTypeToTag(aer.wake.triggeredByType),
      triggered_by_ref: aer.wake.triggeredByRef,
    },
    replay: {
      model_version: aer.replay.modelVersion,
      prompt_template_hash: aer.replay.promptTemplateHash,
      market_snapshot_hash: aer.replay.marketSnapshotHash,
      replay_extras: {
        contents: aer.replay.replayExtras.map(([key, value]) => ({ key, value })),
      },
    },
  }).toBytes();
}

// Re-export the comparator for callers that want to sort replay_extras before encode.
export { compareKeysCanonical };
