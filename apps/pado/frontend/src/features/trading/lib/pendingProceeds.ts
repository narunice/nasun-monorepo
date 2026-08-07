/**
 * Pending proceeds (pool-side settled balances).
 *
 * DeepBook credits the proceeds of a filled *maker* order to the pool-side
 * `Account.settled_balances`, not to the BalanceManager. Those funds only move
 * into the BalanceManager the next time the owner touches that same pool
 * (place/cancel/settle). Cancels settle immediately, so only maker fills strand
 * funds this way.
 *
 * Every balance view in the app reads the BalanceManager bag, so until the
 * settlement happens a maker whose orders were filled while away sees the
 * proceeds nowhere at all. This module surfaces those funds and lets the user
 * pull them into the BalanceManager.
 *
 * `pool::locked_balance` returns open-order collateral *plus* settled balances,
 * both of which have already left the BalanceManager bag. Both are reported
 * here; `hasOpenOrders` tells the caller whether any part is still working
 * collateral rather than claimable proceeds.
 */

import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { NETWORK_CONFIG, POOLS } from '../../../config/network';
import type { PoolConfig } from '../types';

export type PoolKey = keyof typeof POOLS;

export interface PendingProceeds {
  /** The manager these funds settle back into. */
  balanceManagerId: string;
  poolKey: PoolKey;
  pool: PoolConfig;
  /** Raw base-asset amount held pool-side (smallest unit) */
  baseRaw: bigint;
  /** Raw quote-asset amount held pool-side (smallest unit) */
  quoteRaw: bigint;
  /** True when part of the amount is collateral for still-working orders */
  hasOpenOrders: boolean;
}

const POOL_KEYS = Object.keys(POOLS) as PoolKey[];

/** devInspect needs a sender but never charges it; the zero address is fine. */
const INSPECT_SENDER = '0x0000000000000000000000000000000000000000000000000000000000000000';

function parseU64(bytes: number[] | undefined): bigint {
  if (!bytes) return 0n;
  let value = 0n;
  for (let i = 0; i < 8 && i < bytes.length; i++) {
    value += BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

/**
 * A `VecSet<u128>` is BCS-encoded as a ULEB128 length followed by its elements,
 * so a single 0x00 byte means the account has no working orders.
 */
function hasEntries(bytes: number[] | undefined): boolean {
  return !!bytes && bytes.length > 0 && bytes[0] !== 0;
}

function usablePools(): Array<{ poolKey: PoolKey; pool: PoolConfig }> {
  return POOL_KEYS.map((poolKey) => ({ poolKey, pool: POOLS[poolKey] as PoolConfig })).filter(
    ({ pool }) => !!pool.id && !!pool.baseToken.type && !!pool.quoteToken.type
  );
}

/**
 * Read pool-side balances for every configured pool in a single devInspect.
 * Returns only pools holding a non-zero amount. Never throws: a failed read
 * degrades to "nothing pending" rather than blanking the caller's UI.
 */
export async function getPendingProceeds(balanceManagerId: string): Promise<PendingProceeds[]> {
  const pools = usablePools();
  if (pools.length === 0) return [];

  const tx = new Transaction();
  for (const { pool } of pools) {
    const typeArguments = [pool.baseToken.type as string, pool.quoteToken.type as string];
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::pool::account_open_orders`,
      typeArguments,
      arguments: [tx.object(pool.id as string), tx.object(balanceManagerId)],
    });
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::pool::locked_balance`,
      typeArguments,
      arguments: [tx.object(pool.id as string), tx.object(balanceManagerId)],
    });
  }

  try {
    const result = await getSuiClient().devInspectTransactionBlock({
      sender: INSPECT_SENDER,
      transactionBlock: tx,
    });
    if (result.error) return [];

    const pending: PendingProceeds[] = [];
    pools.forEach(({ poolKey, pool }, i) => {
      const openOrders = result.results?.[i * 2]?.returnValues?.[0]?.[0];
      const locked = result.results?.[i * 2 + 1]?.returnValues;
      const baseRaw = parseU64(locked?.[0]?.[0]);
      const quoteRaw = parseU64(locked?.[1]?.[0]);
      if (baseRaw === 0n && quoteRaw === 0n) return;
      pending.push({
        balanceManagerId,
        poolKey,
        pool,
        baseRaw,
        quoteRaw,
        hasOpenOrders: hasEntries(openOrders),
      });
    });
    return pending;
  } catch {
    return [];
  }
}

/**
 * Pools whose whole pool-side amount is settled proceeds, and can therefore be
 * claimed.
 *
 * `locked_balance` is the sum of open-order collateral and settled balances, so
 * it only equals the settled amount when the account has no working orders.
 * That distinction is not cosmetic: settling a pool with nothing settled aborts
 * with `ENoBalanceToSettle`, which would fail the entire transaction.
 */
export function claimableProceeds(entries: PendingProceeds[]): PendingProceeds[] {
  return entries.filter((e) => !e.hasOpenOrders);
}

/**
 * Move settled proceeds into the BalanceManager.
 *
 * The permissionless entry point needs no TradeProof and can only credit the
 * BalanceManager it is given, so this is safe to call for any manager. Entries
 * with working orders are dropped because they may abort; placing or cancelling
 * an order in those pools settles them anyway.
 */
export function buildClaimPendingProceeds(
  balanceManagerId: string,
  entries: PendingProceeds[]
): Transaction {
  const tx = new Transaction();
  for (const { pool } of claimableProceeds(entries)) {
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::pool::withdraw_settled_amounts_permissionless`,
      typeArguments: [pool.baseToken.type as string, pool.quoteToken.type as string],
      arguments: [tx.object(pool.id as string), tx.object(balanceManagerId)],
    });
  }
  return tx;
}

/**
 * Claim across every manager represented in `entries`, in one transaction.
 *
 * A user can own more than one BalanceManager (duplicate creation, or an older
 * recovery path), and each strands its proceeds separately. Each call credits
 * only the manager it is handed, so routing every entry to its own manager is
 * what makes a single button recover all of it.
 */
export function buildClaimAcrossManagers(entries: PendingProceeds[]): Transaction {
  const tx = new Transaction();
  for (const { pool, balanceManagerId } of claimableProceeds(entries)) {
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::pool::withdraw_settled_amounts_permissionless`,
      typeArguments: [pool.baseToken.type as string, pool.quoteToken.type as string],
      arguments: [tx.object(pool.id as string), tx.object(balanceManagerId)],
    });
  }
  return tx;
}
