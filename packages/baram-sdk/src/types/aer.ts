/**
 * Core AER (AI Execution Report) types
 *
 * 8 categories, 31 on-chain fields - mirrors the Move struct AIExecutionReport.
 * JSON fields (feeDetail, modelMetadata, constraints) are parsed into typed objects,
 * unlike baram-sdk which stores them as raw strings.
 */

// === Enums / Constants ===

export type PaymentTokenType = 0 | 1;
export type AERStatus = 0 | 1 | 2;
export type TierLevel = 0 | 1 | 2 | 3;

export const TIER_NAMES = ['Open', 'Bronze', 'Silver', 'Gold'] as const;
export type TierName = (typeof TIER_NAMES)[TierLevel];

export const STATUS_NAMES: Record<AERStatus, string> = {
  0: 'Settled',
  1: 'Disputed',
  2: 'Slashed',
};

export const PAYMENT_TOKEN_NAMES: Record<PaymentTokenType, string> = {
  0: 'NUSDC',
  1: 'NASUN',
};

// === Parsed JSON Sub-types ===

export interface FeeDetail {
  modelCreator?: number;
  royalty?: number;
  protocolFee?: number;
}

export interface ModelMetadata {
  provider?: string;
  version?: string;
  hash?: string;
  quantization?: string;
  parameters?: Record<string, unknown>;
}

export interface ExecutionConstraints {
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  [key: string]: unknown;
}

// === Core Record Type ===

export interface AERRecord {
  objectId: string;
  requestId: number;

  // 1. WHO - Requester (3 fields)
  initiator: string;
  authorizer: string;
  delegationPath: string[];

  // 2. WHO - Executor (2 fields)
  executor: string;
  executorPrincipal: string | null;

  // 3. HOW MUCH (6 fields)
  paymentAmount: number;
  paymentToken: PaymentTokenType;
  executorReceived: number;
  feeDetail: FeeDetail | null;
  budgetId: string | null;
  budgetRemaining: number | null;

  // 4. WHAT (5 fields)
  modelName: string;
  modelMetadata: ModelMetadata | null;
  inputHash: string;
  outputHash: string;
  executionTimeMs: number;

  // 5. WHY (3 fields)
  purpose: string | null;
  policyVersion: number | null;
  constraints: ExecutionConstraints | null;

  // 6. HOW TRUSTWORTHY (5 fields)
  executorTier: TierLevel;
  executorTierName: string;
  executorReputation: number;
  executorStakeAmount: number;
  teeVerified: boolean;
  teeAttestationHash: string | null;

  // 7. WHEN (3 fields)
  requestedAt: number;
  settledAt: number;
  status: AERStatus;
  statusName: string;

  // 8. CHAIN (2 fields)
  triggeredBy: string | null;
  triggeredAction: string | null;
}
