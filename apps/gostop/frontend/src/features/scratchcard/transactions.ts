import { Transaction } from '@mysten/sui/transactions';
import {
  SCRATCH_PACKAGE_ID,
  SCRATCH_REGISTRY_ID,
  SCRATCH_CARD_PRICE,
  SCRATCH_MAX_BULK_COUNT,
  BANKROLL_POOL_ID,
  SUI_CLOCK_ID,
  SUI_RANDOM_ID,
} from '../../lib/gostop-config';

/**
 * Buy a single scratch card. The contract only accepts an exact
 * `CARD_PRICE` payment, so the caller must `splitCoins` or provide a
 * pre-sized coin.
 */
export function buildBuyScratchCard(
  nusdcCoinId: string,
  extraCoinsToMerge: string[] = [],
): Transaction {
  const tx = new Transaction();
  tx.setGasBudget(200_000_000);

  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    );
  }
  const [payment] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(SCRATCH_CARD_PRICE),
  ]);

  tx.moveCall({
    target: `${SCRATCH_PACKAGE_ID}::scratchcard::buy_scratch_card`,
    arguments: [
      tx.object(SCRATCH_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      payment,
      tx.object(SUI_RANDOM_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Buy up to MAX_BULK_COUNT cards in a single tx. The contract expects
 * exactly `count * CARD_PRICE`.
 */
export function buildBuyScratchCardsBulk(
  nusdcCoinId: string,
  count: number,
  extraCoinsToMerge: string[] = [],
): Transaction {
  if (!Number.isInteger(count) || count < 1 || count > SCRATCH_MAX_BULK_COUNT) {
    throw new Error(`[Security] Bulk count must be 1-${SCRATCH_MAX_BULK_COUNT}`);
  }
  const tx = new Transaction();
  tx.setGasBudget(500_000_000);

  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    );
  }
  const total = SCRATCH_CARD_PRICE * BigInt(count);
  const [payment] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(total)]);

  tx.moveCall({
    target: `${SCRATCH_PACKAGE_ID}::scratchcard::buy_scratch_cards_bulk`,
    arguments: [
      tx.object(SCRATCH_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      payment,
      tx.pure.u8(count),
      tx.object(SUI_RANDOM_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}
