import { Transaction } from '@mysten/sui/transactions'
import {
  CRASH_PACKAGE_ID,
  CRASH_REGISTRY_ID,
  BANKROLL_POOL_ID,
  SUI_CLOCK_ID,
} from '../../lib/gostop-config'

export function buildPlaceBetTx(
  roundObjectId: string,
  parentCoinId: string,
  betAmount: bigint,
  extraCoinsToMerge: string[] = [],
): Transaction {
  const tx = new Transaction()
  // Merge extra coins into the parent first if the user's NUSDC balance is
  // fragmented across multiple objects and the largest one alone is < betAmount.
  // Without this, splitCoins below fails with InsufficientCoinBalance.
  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(parentCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    )
  }
  // Split exact betAmount from the parent NUSDC coin. Without this the whole
  // parent coin (often >= bet) is passed to place_bet which then sees a much
  // larger bet_amount than the user intended, triggering EBetTooLarge.
  const [betCoin] = tx.splitCoins(tx.object(parentCoinId), [tx.pure.u64(betAmount)])
  tx.moveCall({
    target: `${CRASH_PACKAGE_ID}::crash::place_bet`,
    arguments: [
      tx.object(roundObjectId),
      tx.object(CRASH_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      betCoin,
      tx.object(SUI_CLOCK_ID),
    ],
  })
  return tx
}

export function buildCashOutTx(roundObjectId: string, multiplierBps: number): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${CRASH_PACKAGE_ID}::crash::cash_out`,
    arguments: [
      tx.object(roundObjectId),
      tx.object(CRASH_REGISTRY_ID),
      tx.pure.u64(multiplierBps),
      tx.object(SUI_CLOCK_ID),
    ],
  })
  // Set explicit gas budget to skip the SDK's auto-budget dry run. The dry
  // run reads the fullnode's checkpoint clock, which lags real time by ~500ms.
  // Combined with the client's 250ms display lag, the gap can exceed the 3%
  // bound margin (~100ms in time) so a perfectly valid cashout aborts at
  // dry-run time with EMultiplierExceedsBound, even though the actual tx
  // would pass on execution. Skipping the dry run ships the tx as-is and
  // lets validators check against fresher state. cash_out is a few writes
  // and one event; 50M MIST is generous.
  tx.setGasBudget(50_000_000)
  return tx
}

export function buildEmergencyRefundTx(roundObjectId: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${CRASH_PACKAGE_ID}::crash::emergency_refund`,
    arguments: [
      tx.object(roundObjectId),
      tx.object(CRASH_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  })
  return tx
}
