/**
 * Coin selection helpers for "deposit/swap from wallet" flows.
 *
 * Faucet claims and auto-deposit flows fragment a wallet's holdings of one
 * coin type into many small objects. To deposit a specific amount we either:
 *   1. find a single coin that can cover it (preferred — no merge), or
 *   2. pick the largest coin as primary and merge the rest into it.
 */

import type { CoinStruct, SuiClient } from '@mysten/sui/client';

/**
 * Page through `client.getCoins` to collect every coin object the wallet
 * holds of a given type. Heavy faucet/auto-deposit users can fragment a
 * single coin type into hundreds or thousands of objects, all of which we
 * need to consider for accurate balance totals and merge planning. The
 * default `getCoins` response caps at 50 entries per page.
 */
export async function getAllCoins(
  client: SuiClient,
  owner: string,
  coinType: string,
): Promise<CoinStruct[]> {
  const out: CoinStruct[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const page = await client.getCoins({ owner, coinType, cursor });
    out.push(...page.data);
    cursor = page.nextCursor;
    if (!page.hasNextPage) break;
  } while (cursor);
  return out;
}

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

  // Need to merge. Sort descending so primary is the largest object, then
  // greedily pick just enough additional coins to cover `amount`. Merging
  // every remaining coin would inflate the PTB input-object count past
  // Sui's per-tx limit for wallets fragmented into thousands of objects
  // (e.g. heavy faucet users), causing the deposit tx to fail to submit.
  const sortedDesc = [...coins].sort((a, b) =>
    BigInt(b.balance) > BigInt(a.balance) ? 1 : -1
  );
  const primary = sortedDesc[0];
  const extras: string[] = [];
  let acc = BigInt(primary.balance);
  for (const c of sortedDesc.slice(1)) {
    if (acc >= amount) break;
    extras.push(c.coinObjectId);
    acc += BigInt(c.balance);
  }
  return { primary, extras };
}

/** Sum balances across coins, returning a bigint. */
export function totalBalance(coins: CoinStruct[]): bigint {
  return coins.reduce((sum, c) => sum + BigInt(c.balance), 0n);
}
