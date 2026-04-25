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
): Transaction {
  const tx = new Transaction()
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
