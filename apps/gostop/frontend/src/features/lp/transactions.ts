/**
 * BankrollPool LP transaction builders.
 *
 * Move signatures (apps/gostop/contracts-bankroll-pool/sources/bankroll_pool.move):
 *   provide_liquidity(pool: &mut BankrollPool, coin: Coin<NUSDC>, clock: &Clock, ctx)
 *   request_withdraw(lp: &mut LPToken, clock: &Clock, ctx)
 *   redeem_liquidity(pool: &mut BankrollPool, lp: LPToken, clock: &Clock, ctx)
 *
 * MIN_LP_DEPOSIT = 10 NUSDC (10_000_000 base units). Caller MUST validate
 * amount before building the tx; the contract will abort with EDepositTooSmall
 * otherwise and the user just pays gas for a no-op.
 *
 * LPToken is soulbound (key only, no `store`): cannot be transferred between
 * wallets. The Move runtime enforces this via Sui's owned-object semantics.
 *
 * Plan: ~/.claude/plans/tier1-chunk2-bankroll-pnl-sot.md v3 §3 (Tier 1.2).
 */

import { Transaction } from '@mysten/sui/transactions';
import {
  BANKROLL_PACKAGE_ID,
  BANKROLL_POOL_ID,
  SUI_CLOCK_ID,
} from '../../lib/gostop-config';

export const MIN_LP_DEPOSIT_NUSDC = 10_000_000n; // 10 NUSDC (6 decimals)

/**
 * Build a provide_liquidity tx. Splits exactly `amountBaseUnits` from a user
 * NUSDC coin; the caller is expected to have resolved `nusdcCoinId` (and any
 * dust to merge) via `findNusdcCoins(amount)`.
 */
export function buildProvideLiquidity(
  amountBaseUnits: bigint,
  nusdcCoinId: string,
  extraCoinsToMerge: string[] = [],
): Transaction {
  if (amountBaseUnits < MIN_LP_DEPOSIT_NUSDC) {
    throw new Error(
      `LP deposit must be at least ${MIN_LP_DEPOSIT_NUSDC.toString()} base units (10 NUSDC).`,
    );
  }
  const tx = new Transaction();
  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    );
  }
  const [depositCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(amountBaseUnits),
  ]);
  tx.moveCall({
    target: `${BANKROLL_PACKAGE_ID}::bankroll_pool::provide_liquidity`,
    arguments: [
      tx.object(BANKROLL_POOL_ID),
      depositCoin,
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

/**
 * Start the 24h cooldown on an LPToken. Re-calling resets the timestamp
 * (Move overwrites Option<u64>::some). The UI should treat a repeat call
 * as a "restart cooldown" action, not "additional withdraw queued".
 */
export function buildRequestWithdraw(lpTokenId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BANKROLL_PACKAGE_ID}::bankroll_pool::request_withdraw`,
    arguments: [tx.object(lpTokenId), tx.object(SUI_CLOCK_ID)],
  });
  return tx;
}

/**
 * Redeem the LPToken for NUSDC after cooldown elapses. Consumes the token
 * (object deleted on chain); the resulting Coin<NUSDC> is transferred to
 * the tx sender. `redeem_liquidity` is NOT gated by `pool.paused` (Move
 * intentional — see bankroll_pool.move:557+), so LPs can always exit once
 * the cooldown has elapsed.
 */
export function buildRedeemLiquidity(lpTokenId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BANKROLL_PACKAGE_ID}::bankroll_pool::redeem_liquidity`,
    arguments: [
      tx.object(BANKROLL_POOL_ID),
      tx.object(lpTokenId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}
