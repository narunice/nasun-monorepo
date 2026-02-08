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
