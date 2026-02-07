/**
 * @nasun/baram-sdk
 *
 * Node.js SDK for Baram AI Settlement Layer.
 * Enables programmatic access to Baram's escrow → execution → settlement → ECR pipeline.
 *
 * Usage:
 *   import { BaramClient, createDevnetConfig } from '@nasun/baram-sdk';
 *   import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
 *
 *   const client = new BaramClient({
 *     config: createDevnetConfig(),
 *     signer: Ed25519Keypair.fromSecretKey(key),
 *   });
 *
 *   const result = await client.execute({
 *     prompt: 'Analyze risk factors for BTC/USD',
 *     model: 'llama-3.3-70b-versatile',
 *   });
 *
 *   console.log(result.response);
 *   console.log(result.ecr?.objectId);
 */

// Client
export { BaramClient } from './client';
export type { BaramClientOptions } from './client';

// Config
export { createDevnetConfig } from './config';

// Errors
export {
  BaramError,
  InsufficientBalanceError,
  NoCoinsError,
  NoExecutorError,
  ExecutorApiError,
  TransactionError,
  TimeoutError,
} from './errors';

// Types
export type {
  BaramConfig,
  ExecutorInfo,
  ECRData,
  CoinRef,
  BuildRequestParams,
  ExecuteParams,
  ExecuteResult,
  ModelInfo,
  TierLevel,
  TierName,
  TeeType,
  // Budget types
  BudgetInfo,
  CreateBudgetParams,
  ExecuteWithBudgetParams,
  UpdateBudgetConstraintsParams,
  BudgetEventType,
  BudgetSpentEvent,
} from './types';

export {
  TIER_NAMES,
  TEE_TYPES,
  MODEL_PRICING,
  EXECUTOR_SELECTION,
  DORMANT_THRESHOLD_MS,
} from './types';

// TEE encryption (low-level access)
export {
  encryptForTee,
  decryptResponse,
  importPublicKey,
  encryptPrompt,
  clearPublicKeyCache,
} from './services/tee';
export type { EncryptResult } from './services/tee';

// Services (low-level access)
export { sha256, hexToBytes } from './services/encoding';
export { getNusdcCoins } from './services/coin';
export { fetchExecutors, selectExecutorWeightedRandom, calculateTierClient } from './services/executor';
export { buildCreateRequestTransaction, buildCancelRequestTransaction } from './services/transaction';
export { fetchECRByRequestId } from './services/ecr';

// Budget services
export {
  fetchBudget,
  fetchBudgetsByOwner,
  fetchBudgetsByAgent,
  buildCreateBudgetTransaction,
  buildDepositToBudgetTransaction,
  buildWithdrawFromBudgetTransaction,
  buildDeactivateBudgetTransaction,
  buildUpdateConstraintsTransaction,
  buildCreateRequestWithBudgetTransaction,
} from './services/budget';
