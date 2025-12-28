/**
 * Staking Query and Transaction Utilities
 * Uses Sui Staking System
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient, formatBalance } from './client';
import type {
  ValidatorInfo,
  DelegatedStake,
  StakeInfo,
  StakingSummary,
  StakeStatus,
} from '../types/staking';

// SUI System Object ID
const SUI_SYSTEM_STATE_OBJECT_ID = '0x5';

// NASUN decimals
const NASUN_DECIMALS = 9;

/**
 * Get all validators with APY data
 */
export async function getValidators(): Promise<ValidatorInfo[]> {
  const client = getSuiClient();

  try {
    // Fetch system state and APY in parallel
    const [systemState, validatorsApy] = await Promise.all([
      client.getLatestSuiSystemState(),
      client.getValidatorsApy(),
    ]);

    // Create APY lookup map
    const apyMap = new Map<string, number>();
    for (const apy of validatorsApy.apys) {
      apyMap.set(apy.address, apy.apy);
    }

    // Map validators to our interface
    const validators: ValidatorInfo[] = systemState.activeValidators.map((v) => ({
      address: v.suiAddress,
      name: v.name,
      description: v.description,
      imageUrl: v.imageUrl,
      commissionRate: Number(v.commissionRate) / 10000, // basis points to decimal
      apy: apyMap.get(v.suiAddress) || 0,
      stakingPoolSuiBalance: BigInt(v.stakingPoolSuiBalance),
      isActive: true,
    }));

    // Sort by APY descending
    return validators.sort((a, b) => b.apy - a.apy);
  } catch (error) {
    console.error('Failed to get validators:', error);
    return [];
  }
}

/**
 * Get a single validator by address
 */
export async function getValidator(address: string): Promise<ValidatorInfo | null> {
  const validators = await getValidators();
  return validators.find((v) => v.address === address) || null;
}

/**
 * Get stakes for an address
 */
export async function getStakes(address: string): Promise<DelegatedStake[]> {
  const client = getSuiClient();

  try {
    const stakes = await client.getStakes({ owner: address });

    return stakes.map((stake) => ({
      validatorAddress: stake.validatorAddress,
      stakingPool: stake.stakingPool,
      stakes: stake.stakes.map((s) => parseStakeObject(s)),
    }));
  } catch (error) {
    console.error('Failed to get stakes:', error);
    return [];
  }
}

/**
 * Parse stake object from RPC response
 */
function parseStakeObject(stake: {
  stakedSuiId: string;
  principal: string;
  stakeActiveEpoch: string;
  stakeRequestEpoch: string;
  status: string;
  estimatedReward?: string;
}): StakeInfo {
  const status = stake.status as StakeStatus;

  return {
    stakedSuiId: stake.stakedSuiId,
    principal: BigInt(stake.principal),
    estimatedReward: stake.estimatedReward ? BigInt(stake.estimatedReward) : undefined,
    stakeActiveEpoch: stake.stakeActiveEpoch,
    stakeRequestEpoch: stake.stakeRequestEpoch,
    status,
  };
}

/**
 * Calculate staking summary from delegated stakes
 */
export function calculateStakingSummary(stakes: DelegatedStake[]): StakingSummary {
  let totalStaked = 0n;
  let totalRewards = 0n;
  let activeCount = 0;
  let pendingCount = 0;

  for (const delegated of stakes) {
    for (const stake of delegated.stakes) {
      totalStaked += stake.principal;
      if (stake.estimatedReward) {
        totalRewards += stake.estimatedReward;
      }
      if (stake.status === 'Active') {
        activeCount++;
      } else if (stake.status === 'Pending') {
        pendingCount++;
      }
    }
  }

  return {
    totalStaked,
    totalRewards,
    activeStakeCount: activeCount,
    pendingStakeCount: pendingCount,
    formattedTotalStaked: formatBalance(totalStaked.toString(), NASUN_DECIMALS),
    formattedTotalRewards: formatBalance(totalRewards.toString(), NASUN_DECIMALS),
  };
}

/**
 * Build stake transaction
 * @param amount Amount to stake in MIST
 * @param validatorAddress Validator address to delegate to
 */
export function buildStakeTransaction(
  amount: bigint,
  validatorAddress: string
): Transaction {
  const tx = new Transaction();

  // Split coins from gas
  const [stakeCoin] = tx.splitCoins(tx.gas, [amount]);

  // Call request_add_stake
  tx.moveCall({
    target: '0x3::sui_system::request_add_stake',
    arguments: [
      tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
      stakeCoin,
      tx.pure.address(validatorAddress),
    ],
  });

  return tx;
}

/**
 * Build unstake transaction
 * @param stakedSuiId StakedSui object ID to withdraw
 */
export function buildUnstakeTransaction(stakedSuiId: string): Transaction {
  const tx = new Transaction();

  // Call request_withdraw_stake
  tx.moveCall({
    target: '0x3::sui_system::request_withdraw_stake',
    arguments: [
      tx.object(SUI_SYSTEM_STATE_OBJECT_ID),
      tx.object(stakedSuiId),
    ],
  });

  return tx;
}

/**
 * Format APY for display
 * @param apy APY as decimal (e.g., 0.05 = 5%)
 */
export function formatApy(apy: number): string {
  return `${(apy * 100).toFixed(2)}%`;
}

/**
 * Format staked amount for display
 * @param amount Amount in MIST
 */
export function formatStakedAmount(amount: bigint): string {
  return formatBalance(amount.toString(), NASUN_DECIMALS);
}

/**
 * Get current epoch from system state
 */
export async function getCurrentEpoch(): Promise<string> {
  try {
    const client = getSuiClient();
    const systemState = await client.getLatestSuiSystemState();
    return systemState.epoch;
  } catch (error) {
    console.error('Failed to get current epoch:', error);
    return '0';
  }
}
