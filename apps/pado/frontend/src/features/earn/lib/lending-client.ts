/**
 * Lending Client
 * Functions to interact with the lending pool smart contract
 */

import { getSuiClient } from '@nasun/wallet';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import {
  LENDING_PACKAGE_ID,
  LENDING_POOL_ID,
  RATE_PRECISION,
  type LendingPool,
  type PoolStats,
  type DepositPosition,
} from '../types/lending';
import { TOKENS } from '../../../config/network';

/**
 * Fetch lending pool state from blockchain
 */
export async function getLendingPool(): Promise<LendingPool | null> {
  try {
    const client = getSuiClient();
    const response = await client.getObject({
      id: LENDING_POOL_ID,
      options: { showContent: true },
    });

    if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = response.data.content.fields as Record<string, unknown>;

    return {
      id: LENDING_POOL_ID,
      totalDeposits: BigInt(fields.total_deposits as string || '0'),
      totalBorrows: BigInt(fields.total_borrows as string || '0'),
      totalReserves: BigInt(fields.total_reserves as string || '0'),
      lastUpdateTime: BigInt(fields.last_update_time as string || '0'),
      borrowIndex: BigInt(fields.borrow_index as string || '0'),
      supplyIndex: BigInt(fields.supply_index as string || '0'),
    };
  } catch (error) {
    console.error('Failed to fetch lending pool:', error);
    return null;
  }
}

/**
 * Calculate pool statistics
 */
export function calculatePoolStats(pool: LendingPool): PoolStats {
  const deposits = pool.totalDeposits;
  const borrows = pool.totalBorrows;

  // Utilization rate
  const utilizationRate = deposits > 0n
    ? Number(borrows * RATE_PRECISION / deposits) / Number(RATE_PRECISION)
    : 0;

  // Interest rate model constants (matching contract)
  const BASE_RATE = 2_000_000n; // 2%
  const MULTIPLIER = 20_000_000n; // 20%
  const JUMP_MULTIPLIER = 100_000_000n; // 100%
  const KINK = 80_000_000n; // 80%
  const RESERVE_FACTOR = 10_000_000n; // 10%

  // Calculate borrow APR
  const utilBigInt = BigInt(Math.floor(utilizationRate * Number(RATE_PRECISION)));
  let borrowAPR: bigint;

  if (utilBigInt <= KINK) {
    borrowAPR = BASE_RATE + (utilBigInt * MULTIPLIER) / RATE_PRECISION;
  } else {
    const normalRate = BASE_RATE + (KINK * MULTIPLIER) / RATE_PRECISION;
    const excessUtil = utilBigInt - KINK;
    borrowAPR = normalRate + (excessUtil * JUMP_MULTIPLIER) / RATE_PRECISION;
  }

  // Calculate supply APY
  const grossSupply = (borrowAPR * utilBigInt) / RATE_PRECISION;
  const supplyAPY = (grossSupply * (RATE_PRECISION - RESERVE_FACTOR)) / RATE_PRECISION;

  // Available liquidity
  const availableLiquidity = deposits > borrows ? deposits - borrows : 0n;

  return {
    utilizationRate,
    supplyAPY: Number(supplyAPY) / Number(RATE_PRECISION),
    borrowAPR: Number(borrowAPR) / Number(RATE_PRECISION),
    availableLiquidity,
  };
}

/**
 * Fetch user's deposit positions
 */
export async function getUserPositions(address: string): Promise<DepositPosition[]> {
  try {
    const client = getSuiClient();
    const POSITION_TYPE = `${LENDING_PACKAGE_ID}::lending_pool::DepositPosition`;

    const response = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: POSITION_TYPE },
      options: { showContent: true },
    });

    return response.data
      .filter(obj => obj.data?.content?.dataType === 'moveObject')
      .map(obj => {
        const fields = (obj.data!.content as { fields: Record<string, unknown> }).fields;
        return {
          id: obj.data!.objectId,
          owner: fields.owner as string,
          shares: BigInt(fields.shares as string || '0'),
          depositIndex: BigInt(fields.deposit_index as string || '0'),
          createdAt: BigInt(fields.created_at as string || '0'),
        };
      });
  } catch (error) {
    console.error('Failed to fetch user positions:', error);
    return [];
  }
}

/**
 * Calculate position value including accrued interest
 */
export function calculatePositionValue(
  position: DepositPosition,
  currentSupplyIndex: bigint
): bigint {
  if (position.depositIndex === 0n) return position.shares;
  return (position.shares * currentSupplyIndex) / position.depositIndex;
}

/**
 * Build deposit transaction.
 * Uses SDK's coinWithBalance intent to auto-fetch, merge, and split NUSDC coins
 * across all owned coin objects (handles fragmentation transparently).
 *
 * Caller must call tx.setSender(address) before tx.build({client}) — the intent
 * resolver fetches coins owned by the sender at build time.
 */
export function buildDepositTransaction(amount: bigint): Transaction {
  const nusdcType = TOKENS.NUSDC.type;
  if (!nusdcType) {
    throw new Error('NUSDC type not configured (VITE_NUSDC_TYPE missing)');
  }

  const tx = new Transaction();

  const depositCoin = coinWithBalance({
    type: nusdcType,
    balance: amount,
  })(tx);

  tx.moveCall({
    target: `${LENDING_PACKAGE_ID}::lending_pool::deposit`,
    arguments: [
      tx.object(LENDING_POOL_ID),
      depositCoin,
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build withdraw transaction (full position)
 */
export function buildWithdrawTransaction(positionId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LENDING_PACKAGE_ID}::lending_pool::withdraw`,
    arguments: [
      tx.object(LENDING_POOL_ID),
      tx.object(positionId),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build partial withdraw transaction
 */
export function buildWithdrawAmountTransaction(
  positionId: string,
  amount: bigint
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LENDING_PACKAGE_ID}::lending_pool::withdraw_amount`,
    arguments: [
      tx.object(LENDING_POOL_ID),
      tx.object(positionId),
      tx.pure.u64(amount),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}
