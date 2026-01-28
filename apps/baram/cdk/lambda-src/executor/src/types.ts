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
  // OpenAI models
  'gpt-4o-mini': 100_000, // 0.1 NUSDC
  'gpt-4o': 500_000, // 0.5 NUSDC
  'gpt-4-turbo': 1_000_000, // 1.0 NUSDC
  // Groq models (fallback - fast inference)
  'llama-3.1-8b-instant': 100_000, // 0.1 NUSDC
  'llama-3.3-70b-versatile': 100_000, // 0.1 NUSDC
  'mixtral-8x7b-32768': 100_000, // 0.1 NUSDC
} as const;

// Default to Groq for free tier usage
export const DEFAULT_MODEL = 'llama-3.1-8b-instant';
