/**
 * Number Match Transaction Builders
 *
 * IMPORTANT: play_game uses sui::random, so the PTB must have
 * splitCoins (native command) + a single moveCall. No additional moveCalls
 * after the one that takes &Random.
 *
 * NOTE: vector<u8> serialization via tx.pure.vector('u8', picks).
 * This pattern is proven in perp/transactions.ts.
 */
import { Transaction } from '@mysten/sui/transactions';
import {
  NUMBERMATCH_PACKAGE_ID,
  NUMBERMATCH_POOL_ID,
  NUMBERMATCH_ADMIN_CAP_ID,
  SUI_RANDOM_ID,
  CLOCK_ID,
  PRICE_PER_PICK,
} from './constants';

/**
 * Build a transaction to play Number Match.
 * Player picks 1-3 numbers from 1-5. Cost = picks.length * 5 NUSDC.
 * Result is determined instantly via VRF randomness.
 *
 * PTB structure: SplitCoins (native) + MoveCall (with Random).
 * No commands after the MoveCall due to Sui Random PTB restriction.
 */
export function buildPlayGame(nusdcCoinId: string, picks: number[]): Transaction {
  const tx = new Transaction();
  // Random-based transactions need higher gas; explicit budget prevents
  // InsufficientGas when SDK selects a small gas coin.
  tx.setGasBudget(50_000_000);

  const cost = BigInt(picks.length) * PRICE_PER_PICK;
  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(cost),
  ]);

  tx.moveCall({
    target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::play_game`,
    arguments: [
      tx.object(NUMBERMATCH_POOL_ID),
      paymentCoin,
      tx.pure.vector('u8', picks),
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
    target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::fund_pool`,
    arguments: [
      tx.object(NUMBERMATCH_ADMIN_CAP_ID),
      tx.object(NUMBERMATCH_POOL_ID),
      tx.object(nusdcCoinId),
    ],
  });

  return tx;
}

/** Withdraw excess funds from pool (admin only) */
export function buildWithdrawPool(amount: bigint): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::withdraw_pool`,
    arguments: [
      tx.object(NUMBERMATCH_ADMIN_CAP_ID),
      tx.object(NUMBERMATCH_POOL_ID),
      tx.pure.u64(amount),
    ],
  });

  return tx;
}

/** Emergency withdraw all funds and auto-pause (admin only) */
export function buildEmergencyWithdrawAll(): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::emergency_withdraw_all`,
    arguments: [
      tx.object(NUMBERMATCH_ADMIN_CAP_ID),
      tx.object(NUMBERMATCH_POOL_ID),
    ],
  });

  return tx;
}

/** Pause or unpause the game (admin only) */
export function buildSetPaused(paused: boolean): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::set_paused`,
    arguments: [
      tx.object(NUMBERMATCH_ADMIN_CAP_ID),
      tx.object(NUMBERMATCH_POOL_ID),
      tx.pure.bool(paused),
    ],
  });

  return tx;
}
