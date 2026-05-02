import type { SuiClient, CoinStruct } from '@mysten/sui/client';
import { NUSDC_TYPE } from '../../lib/gostop-config';

export interface FoundCoins {
  primary: string;
  extra: string[];
  totalBalance: bigint;
}

/**
 * Finds sufficient NUSDC coins for a transaction.
 * Sorts by balance descending to use fewer objects and avoid fragmentation.
 */
export async function findNusdcCoins(
  client: SuiClient,
  owner: string,
  requiredAmount: bigint
): Promise<FoundCoins | null> {
  let coins: CoinStruct[] = [];
  let cursor: string | null | undefined = null;

  // Fetch all NUSDC coins (handle pagination if necessary, though most users have few)
  do {
    const res = await client.getCoins({
      owner,
      coinType: NUSDC_TYPE,
      cursor,
    });
    coins = [...coins, ...res.data];
    cursor = res.hasNextPage ? res.nextCursor : null;
  } while (cursor);

  if (coins.length === 0) return null;

  // Sort by balance descending
  const sorted = [...coins].sort((a, b) => {
    const diff = BigInt(b.balance) - BigInt(a.balance);
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
  
  const totalBalance = sorted.reduce((sum, c) => sum + BigInt(c.balance), 0n);
  if (totalBalance < requiredAmount) return null;

  // Pick the largest coin as primary
  const primary = sorted[0].coinObjectId;
  const extra: string[] = [];
  
  // If the largest coin isn't enough on its own, we'll need to join others.
  // In most GoStop games, we split from a single coin. If sorted[0] < requiredAmount,
  // we need to collect more coins to merge.
  let currentSum = BigInt(sorted[0].balance);
  if (currentSum < requiredAmount) {
    for (let i = 1; i < sorted.length; i++) {
      extra.push(sorted[i].coinObjectId);
      currentSum += BigInt(sorted[i].balance);
      if (currentSum >= requiredAmount) break;
    }
  }

  return {
    primary,
    extra,
    totalBalance,
  };
}
