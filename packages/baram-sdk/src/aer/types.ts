/**
 * AER v2 TypeScript types.
 *
 * Mirrors the Move struct hierarchy in
 * `apps/baram/contracts-aer/sources/aer.move`. Field order matches the
 * canonical BCS wire order; do not reorder.
 *
 * Spec: `apps/baram/docs/AER_V2_CODEC.md`.
 */

export type EventClass =
  | 'cognition'
  | 'execution'
  | 'settlement'
  | 'observation'
  | 'coordination'
  | 'unknown';

export type ActionOutcome = 'success' | 'hold-noop' | 'failure' | 'unknown';

export type TriggerType =
  | 'heartbeat'
  | 'user_message'
  | 'price_alert'
  | 'manual'
  | 'unknown';

// Numeric tags as stored on-chain. Useful for indexer SQL and round-trip checks.
export const EVENT_CLASS_TAG = {
  cognition: 1,
  execution: 2,
  settlement: 3,
  observation: 4,
  coordination: 5,
} as const;

export const ACTION_OUTCOME_TAG = {
  success: 1,
  'hold-noop': 2,
  failure: 3,
} as const;

export const TRIGGER_TYPE_TAG = {
  heartbeat: 1,
  user_message: 2,
  price_alert: 3,
  manual: 4,
} as const;

export interface RequesterContext {
  initiator: string;
  authorizer: string;
  delegationPath: string[];
}

export interface ExecutorContext {
  executor: string;
  executorPrincipal: string | null;
}

export interface PaymentContext {
  paymentAmount: bigint;
  paymentToken: number;
  executorReceived: bigint;
  feeDetail: string | null;
  budgetId: string | null;
  budgetRemaining: bigint | null;
}

export interface InferenceContext {
  modelName: string;
  modelMetadata: string | null;
  inputHash: Uint8Array;
  outputHash: Uint8Array;
  executionTimeMs: bigint;
}

export interface WhyContext {
  purpose: string | null;
  policyVersion: bigint | null;
  // Plan B: snapshotted from cap.version when the gated AER entry was used.
  // null on the ungated (settlement-only) path. Wire-position: between
  // policyVersion and constraints. Do not reorder.
  capabilityVersion: bigint | null;
  constraints: string | null;
}

export interface TrustContext {
  executorTier: number;
  executorReputation: bigint;
  executorStakeAmount: bigint;
  teeVerified: boolean;
  teeAttestationHash: Uint8Array | null;
}

export interface TimeContext {
  requestedAt: bigint;
  settledAt: bigint;
  status: number;
}

export interface IntentLineage {
  intentId: Uint8Array;
  parentIntentId: Uint8Array | null;
  executionId: number;
}

export interface ChainContext {
  triggeredBy: string | null;
  triggeredAction: string | null;
  lineage: IntentLineage;
}

export interface ActionEnvelope {
  eventClass: EventClass;
  actionType: string;
  actionSchemaVersion: number;
  payloadCodec: 'bcs';
  // SHA-256(action_type_bytes || payload_bytes). Decoder verifies; mismatch throws.
  payloadHash: Uint8Array;
  payloadBytes: Uint8Array;
  actionSummary: string;
  actionOutcome: ActionOutcome;
}

export interface WakeContext {
  triggeredByType: TriggerType;
  triggeredByRef: string | null;
}

export interface ReplayContext {
  modelVersion: string;
  promptTemplateHash: Uint8Array;
  marketSnapshotHash: Uint8Array | null;
  // Sorted by key (UTF-8 byte order). Decoder verifies sort order.
  replayExtras: Array<[string, Uint8Array]>;
}

export interface AERReport {
  id: string;
  requestId: bigint;
  requester: RequesterContext;
  executor: ExecutorContext;
  payment: PaymentContext;
  inference: InferenceContext;
  why: WhyContext;
  trust: TrustContext;
  time: TimeContext;
  chain: ChainContext;
  envelope: ActionEnvelope;
  wake: WakeContext;
  replay: ReplayContext;
}
