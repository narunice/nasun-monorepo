import { Transaction } from '@mysten/sui/transactions';
import {
  NM_PACKAGE_ID,
  NM_REGISTRY_ID,
  NM_PRICE_PER_PICK,
  NM_MAX_PICKS,
  NM_MIN_NUMBER,
  NM_MAX_NUMBER,
  BANKROLL_POOL_ID,
  SUI_CLOCK_ID,
  SUI_RANDOM_ID,
} from '../../lib/gostop-config';

/**
 * Play a single round of Number Match. Contract accepts exactly
 * `picks.length * PRICE_PER_PICK` — no change handling.
 */
export function buildPlayGame(
  nusdcCoinId: string,
  picks: number[],
  extraCoinsToMerge: string[] = [],
): Transaction {
  if (picks.length < 1 || picks.length > NM_MAX_PICKS) {
    throw new Error(`[Security] Pick 1-${NM_MAX_PICKS} numbers`);
  }
  const seen = new Set<number>();
  for (const n of picks) {
    if (!Number.isInteger(n) || n < NM_MIN_NUMBER || n > NM_MAX_NUMBER) {
      throw new Error(`[Security] Number ${n} out of range (${NM_MIN_NUMBER}-${NM_MAX_NUMBER})`);
    }
    if (seen.has(n)) throw new Error(`[Security] Duplicate number: ${n}`);
    seen.add(n);
  }

  const tx = new Transaction();
  tx.setGasBudget(200_000_000);

  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    );
  }
  const totalCost = NM_PRICE_PER_PICK * BigInt(picks.length);
  const [payment] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(totalCost)]);

  tx.moveCall({
    target: `${NM_PACKAGE_ID}::numbermatch::play_game`,
    arguments: [
      tx.object(NM_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      payment,
      tx.pure.vector('u8', picks),
      tx.object(SUI_RANDOM_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}
