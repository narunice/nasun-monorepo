/**
 * Zod schemas for RPC response validation
 *
 * These schemas validate responses from the SUI RPC endpoint
 * to protect against malicious or malformed data.
 */

import { z } from 'zod';

// ============================================
// Coin/Balance Schemas
// ============================================

/**
 * Schema for a single coin balance
 * Returned by client.getBalance()
 */
export const CoinBalanceSchema = z.object({
  coinType: z.string(),
  coinObjectCount: z.number(),
  totalBalance: z.string(),
  lockedBalance: z.record(z.string(), z.string()).optional(),
});

export type ValidatedCoinBalance = z.infer<typeof CoinBalanceSchema>;

/**
 * Schema for getAllBalances response
 * Array of coin balances
 */
export const AllBalancesSchema = z.array(CoinBalanceSchema);

export type ValidatedAllBalances = z.infer<typeof AllBalancesSchema>;

/**
 * Schema for a single coin object
 * Returned in getCoins().data
 */
export const CoinStructSchema = z.object({
  coinType: z.string(),
  coinObjectId: z.string(),
  version: z.string(),
  digest: z.string(),
  balance: z.string(),
  previousTransaction: z.string().optional(),
});

export type ValidatedCoinStruct = z.infer<typeof CoinStructSchema>;

/**
 * Schema for getCoins response
 */
export const PaginatedCoinsSchema = z.object({
  data: z.array(CoinStructSchema),
  nextCursor: z.string().nullable().optional(),
  hasNextPage: z.boolean().optional(),
});

export type ValidatedPaginatedCoins = z.infer<typeof PaginatedCoinsSchema>;

// ============================================
// Staking Schemas
// ============================================

/**
 * Schema for validator APY info
 */
export const ValidatorApySchema = z.object({
  address: z.string(),
  apy: z.number(),
});

export type ValidatedValidatorApy = z.infer<typeof ValidatorApySchema>;

/**
 * Schema for validators APY response
 */
export const ValidatorsApySchema = z.object({
  apys: z.array(ValidatorApySchema),
  epoch: z.string(),
});

export type ValidatedValidatorsApy = z.infer<typeof ValidatorsApySchema>;

/**
 * Schema for system state summary (partial - validators only)
 */
export const SuiValidatorSummarySchema = z.object({
  suiAddress: z.string(),
  name: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  projectUrl: z.string().optional(),
  netAddress: z.string().optional(),
  p2pAddress: z.string().optional(),
  stakingPoolId: z.string(),
  votingPower: z.string().optional(),
  commissionRate: z.string(),
  nextEpochStake: z.string().optional(),
  stakingPoolActivationEpoch: z.string().optional(),
  stakingPoolSuiBalance: z.string().optional(),
  rewardsPool: z.string().optional(),
  poolTokenBalance: z.string().optional(),
  pendingStake: z.string().optional(),
  pendingTotalSuiWithdraw: z.string().optional(),
  pendingPoolTokenWithdraw: z.string().optional(),
});

export type ValidatedSuiValidatorSummary = z.infer<typeof SuiValidatorSummarySchema>;

/**
 * Schema for stake object
 */
export const StakeObjectSchema = z.object({
  stakedSuiId: z.string(),
  stakeRequestEpoch: z.string(),
  stakeActiveEpoch: z.string(),
  principal: z.string(),
  status: z.enum(['Active', 'Pending', 'Unstaked']),
  estimatedReward: z.string().optional(),
});

export type ValidatedStakeObject = z.infer<typeof StakeObjectSchema>;

/**
 * Schema for delegated stake
 */
export const DelegatedStakeSchema = z.object({
  validatorAddress: z.string(),
  stakingPool: z.string(),
  stakes: z.array(StakeObjectSchema),
});

export type ValidatedDelegatedStake = z.infer<typeof DelegatedStakeSchema>;

// ============================================
// Transaction Schemas
// ============================================

/**
 * Schema for transaction execution response
 */
export const SuiTransactionBlockResponseSchema = z.object({
  digest: z.string(),
  confirmedLocalExecution: z.boolean().optional(),
  timestampMs: z.string().optional(),
  checkpoint: z.string().optional(),
  effects: z.object({
    status: z.object({
      status: z.enum(['success', 'failure']),
      error: z.string().optional(),
    }),
    gasUsed: z.object({
      computationCost: z.string(),
      storageCost: z.string(),
      storageRebate: z.string(),
      nonRefundableStorageFee: z.string().optional(),
    }).optional(),
    transactionDigest: z.string().optional(),
  }).optional(),
  errors: z.array(z.string()).optional(),
});

export type ValidatedSuiTransactionBlockResponse = z.infer<typeof SuiTransactionBlockResponseSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Safe parse with logging for debugging
 * Returns null on failure instead of throwing
 */
export function safeParseRpc<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[RPC Validation] ${context} failed:`, result.error.format());
    return null;
  }
  return result.data;
}

/**
 * Parse with error throwing for critical operations
 */
export function parseRpc<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorMsg = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`RPC validation failed (${context}): ${errorMsg}`);
  }
  return result.data;
}
