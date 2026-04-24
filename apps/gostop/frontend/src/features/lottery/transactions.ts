import { Transaction } from '@mysten/sui/transactions';
import {
  LOTTERY_PACKAGE_ID,
  LOTTERY_REGISTRY_ID,
  LOTTERY_TICKET_PRICE,
  LOTTERY_NUMBERS_COUNT,
  LOTTERY_MAX_NUMBER,
  BANKROLL_POOL_ID,
  SUI_CLOCK_ID,
  SUI_RANDOM_ID,
} from '../../lib/gostop-config';

/**
 * Buy a ticket. `nusdcCoinId` is any user-owned NUSDC Coin object with
 * balance >= ticket price; the contract takes exactly TICKET_PRICE and
 * refunds change.
 */
export function buildBuyTicket(
  roundId: string,
  nusdcCoinId: string,
  numbers: number[],
  extraCoinsToMerge: string[] = [],
): Transaction {
  if (numbers.length !== LOTTERY_NUMBERS_COUNT) {
    throw new Error(`[Security] Must select exactly ${LOTTERY_NUMBERS_COUNT} numbers`);
  }
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > LOTTERY_MAX_NUMBER) {
      throw new Error(`[Security] Number ${n} out of range (must be 1-${LOTTERY_MAX_NUMBER})`);
    }
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) {
      throw new Error(`[Security] Duplicate number detected: ${sorted[i]}`);
    }
  }

  const tx = new Transaction();
  // Merge any dust coins into the primary first, then split exact ticket price.
  if (extraCoinsToMerge.length > 0) {
    tx.mergeCoins(
      tx.object(nusdcCoinId),
      extraCoinsToMerge.map((id) => tx.object(id)),
    );
  }
  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(LOTTERY_TICKET_PRICE)]);

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::buy_ticket`,
    arguments: [
      tx.object(roundId),
      tx.object(LOTTERY_REGISTRY_ID),
      paymentCoin,
      tx.pure.u8(sorted[0]),
      tx.pure.u8(sorted[1]),
      tx.pure.u8(sorted[2]),
      tx.pure.u8(sorted[3]),
      tx.pure.u8(sorted[4]),
      tx.object(SUI_CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Claim a winning ticket (tier 1/2/3). Must be called within the 30-day
 * claim window after draw_time, otherwise reverts EClaimWindowExpired.
 * Note: gostop's `claim_prize` takes the Clock (unlike Pado), so the
 * contract enforces the deadline on-chain.
 */
export function buildClaimPrize(roundId: string, ticketId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::claim_prize`,
    arguments: [tx.object(roundId), tx.object(ticketId), tx.object(SUI_CLOCK_ID)],
  });
  return tx;
}

export function buildBurnTicket(roundId: string, ticketId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::burn_ticket`,
    arguments: [tx.object(roundId), tx.object(ticketId)],
  });
  return tx;
}

/**
 * Permissionless: forfeit unclaimed prize balance to the gostop BankrollPool
 * once the 30-day window after draw_time has elapsed. Anyone can call.
 */
export function buildSweepUnclaimed(roundId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::sweep_unclaimed_to_bankroll`,
    arguments: [
      tx.object(roundId),
      tx.object(LOTTERY_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ===== Permissionless keeper helpers (also callable by frontend e.g. for
// "settle now" button if the round is past draw_time but the keeper hasn't
// run yet). Admin keeper bot is the primary caller. =====

export function buildCloseRoundPermissionless(roundId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::close_round_permissionless`,
    arguments: [tx.object(roundId), tx.object(SUI_CLOCK_ID)],
  });
  return tx;
}

export function buildDrawNumbersPermissionless(roundId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::draw_numbers_permissionless`,
    arguments: [tx.object(roundId), tx.object(SUI_RANDOM_ID), tx.object(SUI_CLOCK_ID)],
  });
  return tx;
}
