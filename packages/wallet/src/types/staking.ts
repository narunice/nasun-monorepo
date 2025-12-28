/**
 * Staking Type Definitions
 * Based on Sui Staking System
 */

/**
 * Validator information for display
 */
export interface ValidatorInfo {
  /** Validator Sui address */
  address: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Image URL */
  imageUrl?: string;
  /** Commission rate (0-1, e.g., 0.02 = 2%) */
  commissionRate: number;
  /** Current APY (0-1, e.g., 0.05 = 5%) */
  apy: number;
  /** Total staked amount in MIST */
  stakingPoolSuiBalance: bigint;
  /** Whether validator is active */
  isActive: boolean;
}

/**
 * Stake status enum
 */
export type StakeStatus = 'Pending' | 'Active' | 'Unstaked';

/**
 * Individual stake object
 */
export interface StakeInfo {
  /** StakedSui object ID */
  stakedSuiId: string;
  /** Principal amount in MIST */
  principal: bigint;
  /** Estimated reward in MIST (only for Active stakes) */
  estimatedReward?: bigint;
  /** Stake activation epoch */
  stakeActiveEpoch: string;
  /** Request epoch */
  stakeRequestEpoch: string;
  /** Current status */
  status: StakeStatus;
}

/**
 * Delegated stake (grouped by validator)
 */
export interface DelegatedStake {
  /** Validator address */
  validatorAddress: string;
  /** Staking pool ID */
  stakingPool: string;
  /** Individual stakes */
  stakes: StakeInfo[];
}

/**
 * Staking summary for an account
 */
export interface StakingSummary {
  /** Total staked amount across all validators (MIST) */
  totalStaked: bigint;
  /** Total estimated rewards (MIST) */
  totalRewards: bigint;
  /** Number of active stakes */
  activeStakeCount: number;
  /** Number of pending stakes */
  pendingStakeCount: number;
  /** Formatted total staked (display unit) */
  formattedTotalStaked: string;
  /** Formatted total rewards (display unit) */
  formattedTotalRewards: string;
}

/**
 * Stake request parameters
 */
export interface StakeRequest {
  /** Amount to stake in display unit (NASUN) */
  amount: string;
  /** Validator address to delegate to */
  validatorAddress: string;
}

/**
 * Unstake request parameters
 */
export interface UnstakeRequest {
  /** StakedSui object ID to withdraw */
  stakedSuiId: string;
}

/**
 * Stake transaction result
 */
export interface StakeTransactionResult {
  /** Transaction digest */
  digest: string;
  /** Transaction status */
  status: 'success' | 'failure';
  /** Gas used in MIST */
  gasUsed?: string;
  /** Error message if failed */
  error?: string;
  /** Type of stake operation */
  operationType: 'stake' | 'unstake';
  /** Amount involved (display unit) */
  amount?: string;
}
