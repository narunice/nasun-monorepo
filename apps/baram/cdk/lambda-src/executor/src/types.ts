/**
 * Baram Executor Types
 */

/**
 * v2 capability + envelope fields shared by /execute and /record.
 *
 * The Lambda routes through `aer::create_report_with_receipt_capability`
 * (gated entry) because user-facing chat and self-reported execution events
 * fall under cognition/execution event_class, which the ungated entry
 * rejects. See apps/baram/contracts-aer/sources/aer.move.
 */
export interface AerCapabilityFields {
  /** Shared-object id of the agent's Capability. cap.owner must equal request.requester. */
  capabilityId: string;
  /** Caller-asserted cap.version; on-chain abort if rotated mid-flight. Decimal string for u64 safety. */
  expectedCapabilityVersion: string;
  /** Defaults per endpoint: 'cognition.chat.v1' for /execute, 'trade.swap.v1' for /record. */
  actionType?: string;
  /** 1=cognition (default for /execute), 2=execution (default for /record). */
  eventClass?: number;
  /** 1=heartbeat, 2=user_message, 3=price_alert, 4=manual (default), 5=coordination. */
  triggeredByType?: number;
  /** Optional session/correlation id surfaced into AER.wake.triggered_by_ref. */
  triggeredByRef?: string;
  /** Optional 16-byte hex intent id linking back to a prior AER. */
  parentIntentId?: string;
}

export interface ExecuteRequest extends AerCapabilityFields {
  requestId: number;
  encryptedPrompt: string; // Base64 encoded (MVP: just plain text encoded)
  model?: string;
}

export interface ExecuteResponse {
  success: boolean;
  requestId: number;
  result?: string;
  resultHash?: string;
  txDigest?: string;
  executionTimeMs?: number;
  error?: string;
}

export interface ComputeRequestOnChain {
  requestId: number;
  requester: string;
  executor: string;
  price: number;
  promptHash: string; // hex
  model: string;
  createdAt: number;
  timeoutAt: number;
  status: number;
}

// Status constants (must match Move contract)
export const STATUS = {
  PENDING: 0,
  EXECUTING: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  REFUNDED: 4,
} as const;

// Model pricing (in NUSDC, 6 decimals)
export const MODEL_PRICING: Record<string, number> = {
  'llama-3.3-70b-versatile': 100_000, // 0.1 NUSDC
} as const;

export const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// /record endpoint -- Model B (self-reported LLM results)
export interface RecordRequest extends AerCapabilityFields {
  requestId: number;
  result: string;              // LLM output (50–10,000 chars)
  promptHash: string;          // SHA-256 hex (64 chars)
  executionTimeMs?: number;    // LLM call duration (default 0)
}

export interface RecordResponse {
  success: boolean;
  requestId: number;
  resultHash?: string;
  txDigest?: string;
  error?: string;
}

// DynamoDB result storage (7-day TTL)
export interface ResultRecord {
  requestId: number;
  requesterAddress: string;
  result: string;
  resultHash: string;
  model: string;
  purpose: string;
  createdAt: number;
  ttl: number; // Unix epoch seconds
}

// POST /result -- wallet-signature-authenticated result fetch
export interface ResultRequest {
  requestId: number;
  timestamp: number;
  signature: string;
  address: string;
  signerType: 'standard' | 'zklogin';
  ephemeralPubKey?: string;
}

// ============================================================================
// /infer + /execute-capability -- split-inference + settlement (PR1.A HOLD-only).
//
// Two-call shape: the trader runtime first POSTs /infer to get the LLM
// completion bound to a pre-created on-chain request, then POSTs
// /execute-capability with the agent-signed settlement intent. PR1.A
// rejects any actionCall (swap) -- those land in PR1.5.
// ============================================================================

export interface InferRequest {
  requestId: number;
  encryptedPrompt: string;              // base64 (MVP: plain text encoded)
  model: string;
  capabilityId: string;                 // 0x<hex>
  principalAddress: string;             // 0x<64 hex> -- must match cap.owner
  promptHash: string;                   // 0x<64 hex lower>
  expectedCapabilityVersion: string;    // u64 decimal
}

export interface InferResponse {
  success: boolean;
  result?: string;
  resultHash?: string;                  // 0x<64 hex lower>
  capabilityVersion?: string;           // u64 decimal (echoed from on-chain)
  executionTimeMs?: number;
  // Multi-provider fallback chain: which provider served this response
  // and what model id it advertised. Optional/additive — older callers
  // ignore. Newer runtimes pass `provider` through replay.modelVersion
  // so the AER on-chain records `<canonical_model>+<provider>`.
  provider?: string;
  modelUsed?: string;
  error?: string;
  reason?: string;                      // structured reason on 4xx (e.g. 'prompt_hash_mismatch')
}

/**
 * Wire-level swap-path blocks. PR1.5: present iff actionCall !== null,
 * absent (all three null) for HOLD/cognition. Lambda enforces the XOR.
 *
 * Mirrors runtime `host-client.ts:ActionCallSpecWire` byte-for-byte --
 * canonical JSON of {actionCall, escrow, spend} is hashed and bound to sig2
 * via SettleSigFields.actionCallHash, so any field-name/order drift here
 * breaks sig2 verification on every swap.
 */
export interface ActionCallArg {
  kind: 'object' | 'pure' | 'pipe';
  id?: string;                         // kind=object
  bytes?: string;                      // kind=pure, base64-encoded BCS
  from?: 'withdraw_coin' | 'zero_deep'; // kind=pipe
}

export interface ActionCallSpecWire {
  targetPackage: string;
  module: string;                      // PR1.5: 'pool'
  fn: string;                          // 'swap_exact_quote_for_base' | 'swap_exact_base_for_quote'
  typeArguments: string[];             // [Base, Quote] full 0x<addr>::module::Type
  args: ActionCallArg[];
}

export interface EscrowBlock {
  objectId: string;
  initialSharedVersion: string;
  capabilityId: string;
  capabilityInitialSharedVersion: string;
}

export interface SpendBlock {
  coinAssetType: string;               // 0x<addr>::module::Type
  amount: string;                      // u64 decimal
}

export interface ExecuteCapabilityRequest {
  requestId: number;
  promptHash: string;                   // 0x<64 hex lower>
  resultHash: string;                   // 0x<64 hex lower>
  result: string;                       // full result text -- Lambda re-hashes to guard against host bugs
  executionTimeMs: number;
  model: string;
  budgetId?: string | null;
  capabilityId: string;
  agentAddress: string;                 // 0x<64 hex> -- sig recover target
  principalAddress: string;             // 0x<64 hex> -- must match cap.owner
  expectedCapabilityVersion: string;    // u64 decimal
  envelope: Record<string, unknown>;    // TraderEnvelopeMeta from runtime
  lineage: Record<string, unknown>;
  wake: Record<string, unknown>;
  replay: Record<string, unknown>;
  proposal: Record<string, unknown>;
  envelopeHash: string;                 // 0x<64 hex lower> sha256(canonicalJson(envelope))
  actionCallHash: string;               // HOLD: 0x00...00 ; swap: sha256(canonicalJson({actionCall, escrow, spend}))
  sig2: string;                         // base64 Sui personal-message signature
  // PR1.5: HOLD branch leaves all three null; swap branch sets all three.
  // Lambda enforces the all-null XOR all-non-null invariant and recomputes
  // actionCallHash before signing the PTB.
  actionCall: ActionCallSpecWire | null;
  escrow: EscrowBlock | null;
  spend: SpendBlock | null;
  purpose?: string | null;
  constraints?: string | null;
  triggeredBy?: string | null;
  triggeredAction?: string | null;
}

export interface ExecuteCapabilityResponse {
  success: boolean;
  requestId?: number;
  resultHash?: string;
  txDigest?: string;
  capabilityVersion?: string;
  executionTimeMs?: number;
  error?: string;
  reason?: string;
}
