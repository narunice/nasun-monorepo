/**
 * Lending Types
 * Type definitions for NUSDC lending pool
 */

// Deployed contract addresses (2026-01-03)
export const LENDING_PACKAGE_ID = '0xeaa6d4ac6c6bb0b805bd6863a1b3e3d15c15b72f85c12131d83e9208635ecd15';
export const LENDING_POOL_ID = '0x5add35dcbc7384c8b2704e5f4ed322881d085a45440a84b4fe9309914a397afe';

// Constants matching smart contract
export const RATE_PRECISION = 100_000_000n; // 1e8 = 100%
export const MIN_DEPOSIT = 1_000_000n; // 1 NUSDC (6 decimals)

/**
 * Lending pool state from blockchain
 */
export interface LendingPool {
  id: string;
  totalDeposits: bigint;
  totalBorrows: bigint;
  totalReserves: bigint;
  lastUpdateTime: bigint;
  borrowIndex: bigint;
  supplyIndex: bigint;
}

/**
 * Computed pool statistics
 */
export interface PoolStats {
  utilizationRate: number; // 0-1
  supplyAPY: number;       // 0-1
  borrowAPR: number;       // 0-1
  availableLiquidity: bigint;
}

/**
 * User deposit position
 */
export interface DepositPosition {
  id: string;
  owner: string;
  shares: bigint;
  depositIndex: bigint;
  createdAt: bigint;
}

/**
 * Computed position value
 */
export interface PositionValue {
  position: DepositPosition;
  currentValue: bigint;
  earnedInterest: bigint;
}

/**
 * Deposit event
 */
export interface DepositedEvent {
  poolId: string;
  depositor: string;
  amount: bigint;
  shares: bigint;
}

/**
 * Withdraw event
 */
export interface WithdrawnEvent {
  poolId: string;
  depositor: string;
  amount: bigint;
  shares: bigint;
}

/**
 * Format NUSDC amount (6 decimals)
 */
export function formatNUSDC(amount: bigint): string {
  const value = Number(amount) / 1_000_000;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse NUSDC amount from string
 */
export function parseNUSDC(value: string): bigint {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return 0n;
  return BigInt(Math.floor(num * 1_000_000));
}

/**
 * Format percentage (0-1 to %)
 */
export function formatPercentage(rate: number): string {
  return (rate * 100).toFixed(2) + '%';
}
