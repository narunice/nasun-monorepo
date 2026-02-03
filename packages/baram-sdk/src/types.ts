/**
 * Shared types for @nasun/baram-sdk
 */

// Tier definitions — mirrors executor_tier.move
export const TIER_NAMES = ['Open', 'Bronze', 'Silver', 'Gold'] as const;
export type TierLevel = 0 | 1 | 2 | 3;
export type TierName = (typeof TIER_NAMES)[TierLevel];

// TEE types — mirrors compliance.move tee_type field
export const TEE_TYPES: Record<number, string> = {
  0: 'None',
  1: 'AWS Nitro',
  2: 'Intel SGX',
  3: 'AMD SEV',
};
export type TeeType = 0 | 1 | 2 | 3;

// Executor info from on-chain ExecutorRegistry
export interface ExecutorInfo {
  id: string;
  operator: string;
  name: string;
  endpointUrl: string;
  teeType: TeeType;
  teeTypeName: string;
  supportedModels: string[];
  reputation: number;
  completedJobs: number;
  failedJobs: number;
  registeredAt: number;
  lastActiveAt: number;
  isActive: boolean;
  tier: TierLevel;
  tierName: TierName;
  isDormant: boolean;
}

// Coin reference for transaction building
export interface CoinRef {
  objectId: string;
  version: string;
  digest: string;
}

// ECR (ExecutionComplianceRecord) — mirrors compliance.move fields
export interface ECRData {
  objectId: string;
  requestId: number;
  requester: string;
  executor: string;
  model: string;
  promptHash: string;
  resultHash: string;
  executionTimeMs: number;
  teeType: number;
  teeTypeName: string;
  pcr0: string;
  attestationHash: string;
  pcrBaselineVersion: number;
  pcrVerified: boolean;
  executorReputation: number;
  executorStakeAmount: number;
  executorSlashCount: number;
  executorTier: TierLevel;
  executorTierName: string;
  paymentAmount: number;
  requestCreatedAt: number;
  settledAt: number;
  policyVersion: number;
  timeoutMs: number;
  minPrice: number;
}

// SDK configuration
export interface BaramConfig {
  rpcUrl: string;
  baram: {
    packageId: string;
    registryId: string;
  };
  executor: {
    packageId: string;
    registryId: string;
    processedRequestsId: string;
    tierRegistryId: string;
  };
  compliance: {
    packageId: string;
    registryId: string;
  };
  tokens: {
    nusdcType: string;
  };
}

// Parameters for building a create_request transaction
export interface BuildRequestParams {
  coins: CoinRef[];
  promptHashBytes: number[];
  model: string;
  executorOperator: string;
  price: number;
}

// Parameters for the execute() high-level API
export interface ExecuteParams {
  prompt: string;
  model: string;
  minTier?: TierLevel;
  teeRequired?: boolean;
}

// Result from the execute() high-level API
export interface ExecuteResult {
  requestId: number;
  response: string;
  resultHash: string;
  txDigest: string;
  executionTimeMs: number;
  ecr: ECRData | null;
  executor: ExecutorInfo;
}

// Model pricing info
export interface ModelInfo {
  name: string;
  price: number;
  description: string;
  provider: string;
}

// Executor selection constants
export const EXECUTOR_SELECTION = {
  BASE_WEIGHT: 0.3,
  REPUTATION_BONUS: 1.0,
  MAX_WEIGHT: 1.0,
  DORMANT_PENALTY: 0.3,
  MIN_TIER: 1 as TierLevel,
  MAX_RETRIES: 3,
} as const;

// Dormant threshold: 7 days in milliseconds
export const DORMANT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

// Model pricing (in NUSDC smallest unit, 6 decimals)
export const MODEL_PRICING: Record<string, ModelInfo> = {
  'llama-3.1-8b-instant': {
    name: 'Llama 3.1 8B (Groq)',
    price: 100_000,
    description: 'Fast inference via Groq Cloud',
    provider: 'groq',
  },
  'llama-3.3-70b-versatile': {
    name: 'Llama 3.3 70B (Groq)',
    price: 100_000,
    description: 'Large model via Groq Cloud',
    provider: 'groq',
  },
  'llama-3.2-3b-local': {
    name: 'Llama 3.2 3B (TEE)',
    price: 100_000,
    description: 'Private inference in TEE enclave',
    provider: 'tee',
  },
};
