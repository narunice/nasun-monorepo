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

// /record endpoint — Model B (self-reported LLM results)
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

// POST /result — wallet-signature-authenticated result fetch
export interface ResultRequest {
  requestId: number;
  timestamp: number;
  signature: string;
  address: string;
  signerType: 'standard' | 'zklogin';
  ephemeralPubKey?: string;
}
