/**
 * Baram Executor Types
 */

export interface ExecuteRequest {
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
export interface RecordRequest {
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
