import { Transaction } from '@mysten/sui/transactions';
import {
  WHEEL_PACKAGE_ID,
  WHEEL_REGISTRY_ID,
  WHEEL_MIN_BET,
  WHEEL_MAX_BET,
  BANKROLL_POOL_ID,
  SUI_CLOCK_ID,
  SUI_RANDOM_ID,
} from '../../lib/gostop-config';

/**
 * Build an atomic wheel spin tx. Splits exactly `betAmount` off the
 * caller's NUSDC and passes it as the bet coin. The on-chain `spin`
 * entry consumes it via collect_bet, draws a VRF segment, and pays
 * winnings in the same transaction.
 */
export function buildSpinTx(
  nusdcCoinId: string,
  betAmount: bigint,
  extraCoinsToMerge: string[] = [],
): Transaction {
  if (betAmount < WHEEL_MIN_BET || betAmount > WHEEL_MAX_BET) {
    throw new Error(
      `[Security] Bet must be ${WHEEL_MIN_BET}-${WHEEL_MAX_BET} (raw units)`,
    );
  }

  const tx = new Transaction();
  tx.setGasBudget(200_000_000);

  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    );
  }
  const [betCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(betAmount),
  ]);

  tx.moveCall({
    target: `${WHEEL_PACKAGE_ID}::wheel::spin`,
    arguments: [
      tx.object(WHEEL_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      betCoin,
      tx.object(SUI_RANDOM_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}
