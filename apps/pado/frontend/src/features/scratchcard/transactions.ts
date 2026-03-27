/**
 * Scratchcard Transaction Builders
 *
 * IMPORTANT: buy_scratch_card uses sui::random, so the PTB must have
 * splitCoins (native command) + a single moveCall. No additional moveCalls
 * after the one that takes &Random.
 */
import { Transaction } from '@mysten/sui/transactions';
import {
  SCRATCHCARD_PACKAGE_ID,
  SCRATCHCARD_POOL_ID,
  SCRATCHCARD_ADMIN_CAP_ID,
  SUI_RANDOM_ID,
  CLOCK_ID,
  CARD_PRICE,
} from './constants';

/**
 * Build a transaction to buy a scratch card.
 * Result is determined instantly via VRF randomness.
 *
 * PTB structure: SplitCoins (native) + MoveCall (with Random).
 * No commands after the MoveCall due to Sui Random PTB restriction.
 */
export function buildBuyScratchCard(nusdcCoinId: string): Transaction {
  const tx = new Transaction();
  // Random-based transactions need higher gas; explicit budget prevents
  // InsufficientGas when SDK selects a small gas coin.
  tx.setGasBudget(50_000_000);

  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(CARD_PRICE),
  ]);

  tx.moveCall({
    target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::buy_scratch_card`,
    arguments: [
      tx.object(SCRATCHCARD_POOL_ID),
      paymentCoin,
      tx.object(SUI_RANDOM_ID),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/** Fund the prize pool with NUSDC (admin only) */
export function buildFundPool(nusdcCoinId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::fund_pool`,
    arguments: [
      tx.object(SCRATCHCARD_ADMIN_CAP_ID),
      tx.object(SCRATCHCARD_POOL_ID),
      tx.object(nusdcCoinId),
    ],
  });

  return tx;
}

/** Withdraw excess funds from pool (admin only, must leave >= POOL_MIN_BALANCE) */
export function buildWithdrawPool(amount: bigint): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::withdraw_pool`,
    arguments: [
      tx.object(SCRATCHCARD_ADMIN_CAP_ID),
      tx.object(SCRATCHCARD_POOL_ID),
      tx.pure.u64(amount),
    ],
  });

  return tx;
}

/** Emergency withdraw all funds and auto-pause (admin only) */
export function buildEmergencyWithdrawAll(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::emergency_withdraw_all`,
    arguments: [
      tx.object(SCRATCHCARD_ADMIN_CAP_ID),
      tx.object(SCRATCHCARD_POOL_ID),
    ],
  });

  return tx;
}

/** Pause or unpause the scratch card game (admin only) */
export function buildSetPaused(paused: boolean): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::set_paused`,
    arguments: [
      tx.object(SCRATCHCARD_ADMIN_CAP_ID),
      tx.object(SCRATCHCARD_POOL_ID),
      tx.pure.bool(paused),
    ],
  });

  return tx;
}
