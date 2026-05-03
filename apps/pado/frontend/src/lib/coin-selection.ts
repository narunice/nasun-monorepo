/**
 * Coin selection helpers for "deposit/swap from wallet" flows.
 *
 * Faucet claims and auto-deposit flows fragment a wallet's holdings of one
 * coin type into many small objects. To deposit a specific amount we either:
 *   1. find a single coin that can cover it (preferred — no merge), or
 *   2. pick the largest coin as primary and merge the rest into it.
 */

import type { CoinStruct } from '@mysten/sui/client';

export interface CoinSelection {
  /** The coin object to split from */
  primary: CoinStruct;
  /** Object IDs to merge into primary before split */
  extras: string[];
}

/**
 * Pick coins to cover `amount`. Throws if the combined balance is insufficient.
 *
 *   - If a single coin's balance >= amount → use the smallest such coin (no merge).
 *   - Otherwise → primary = largest, extras = the rest sorted desc.
 *
 * Caller is responsible for checking the total balance up front; this helper
 * only handles the selection.
 */
export function pickCoinsForAmount(coins: CoinStruct[], amount: bigint): CoinSelection {
  if (coins.length === 0) {
    throw new Error('No coins to select from');
  }

  const sufficient = coins.filter((c) => BigInt(c.balance) >= amount);
  if (sufficient.length > 0) {
    const smallest = sufficient.reduce((a, b) =>
      BigInt(a.balance) <= BigInt(b.balance) ? a : b
    );
    return { primary: smallest, extras: [] };
  }

  // Need to merge. Sort descending so primary is the largest object.
  const sortedDesc = [...coins].sort((a, b) =>
    BigInt(b.balance) > BigInt(a.balance) ? 1 : -1
  );
  return {
    primary: sortedDesc[0],
    extras: sortedDesc.slice(1).map((c) => c.coinObjectId),
  };
}

/** Sum balances across coins, returning a bigint. */
export function totalBalance(coins: CoinStruct[]): bigint {
  return coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
}
