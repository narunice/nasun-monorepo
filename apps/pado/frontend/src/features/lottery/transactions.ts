import { Transaction } from '@mysten/sui/transactions';
import {
  LOTTERY_PACKAGE_ID,
  LOTTERY_REGISTRY_ID,
  CLOCK_ID,
  TICKET_PRICE,
  MAX_NUMBER,
  NUMBERS_COUNT,
} from './constants';

/**
 * Build a transaction to buy a lottery ticket
 * @param roundId - The lottery round object ID
 * @param nusdcCoinId - The NUSDC coin object ID to pay with
 * @param numbers - Array of 5 numbers (1-32)
 * @returns Transaction object
 */
export function buildBuyTicket(
  roundId: string,
  nusdcCoinId: string,
  numbers: number[]
): Transaction {
  if (numbers.length !== NUMBERS_COUNT) {
    throw new Error(`[Security] Must select exactly ${NUMBERS_COUNT} numbers`);
  }

  // Validate range: each number must be 1-32 (matches on-chain ENumberOutOfRange)
  for (const num of numbers) {
    if (!Number.isInteger(num) || num < 1 || num > MAX_NUMBER) {
      throw new Error(`[Security] Number ${num} out of range (must be 1-${MAX_NUMBER})`);
    }
  }

  const sortedNumbers = [...numbers].sort((a, b) => a - b);

  // Validate no duplicates (matches on-chain EDuplicateNumber)
  for (let i = 1; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] === sortedNumbers[i - 1]) {
      throw new Error(`[Security] Duplicate number detected: ${sortedNumbers[i]}`);
    }
  }

  const tx = new Transaction();

  // Split exact ticket price from the coin
  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(TICKET_PRICE),
  ]);

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::buy_ticket`,
    arguments: [
      tx.object(roundId),
      tx.object(LOTTERY_REGISTRY_ID),
      paymentCoin,
      tx.pure.u8(sortedNumbers[0]),
      tx.pure.u8(sortedNumbers[1]),
      tx.pure.u8(sortedNumbers[2]),
      tx.pure.u8(sortedNumbers[3]),
      tx.pure.u8(sortedNumbers[4]),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build a transaction to claim prize for a winning ticket
 * @param roundId - The lottery round object ID
 * @param ticketId - The ticket object ID
 * @returns Transaction object
 */
export function buildClaimPrize(
  roundId: string,
  ticketId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::claim_prize`,
    arguments: [tx.object(roundId), tx.object(ticketId)],
  });

  return tx;
}

/**
 * Build a transaction to burn a non-winning ticket
 * @param roundId - The lottery round object ID
 * @param ticketId - The ticket object ID
 * @returns Transaction object
 */
export function buildBurnTicket(
  roundId: string,
  ticketId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::burn_ticket`,
    arguments: [tx.object(roundId), tx.object(ticketId)],
  });

  return tx;
}

// ===== Admin Functions =====

/**
 * Build a transaction to create a new lottery round
 * @param closeTime - Ticket sales close time (milliseconds)
 * @param drawTime - Draw time (milliseconds)
 * @param rolloverAmount - Amount to carry over from previous round
 * @param adminCapId - Admin capability object ID
 * @returns Transaction object
 */
export function buildCreateRound(
  closeTime: number,
  drawTime: number,
  rolloverAmount: bigint,
  adminCapId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::create_round`,
    arguments: [
      tx.object(adminCapId),
      tx.object(LOTTERY_REGISTRY_ID),
      tx.pure.u64(closeTime),
      tx.pure.u64(drawTime),
      tx.pure.u64(rolloverAmount),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build a transaction to close a round for ticket sales
 * @param roundId - The lottery round object ID
 * @param adminCapId - Admin capability object ID
 * @returns Transaction object
 */
export function buildCloseRound(
  roundId: string,
  adminCapId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::close_round`,
    arguments: [
      tx.object(adminCapId),
      tx.object(roundId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build a transaction to draw winning numbers
 * @param roundId - The lottery round object ID
 * @param adminCapId - Admin capability object ID
 * @returns Transaction object
 */
export function buildDrawNumbers(
  roundId: string,
  adminCapId: string
): Transaction {
  const tx = new Transaction();

  // Sui Random is at address 0x8
  const SUI_RANDOM_ID = '0x8';

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::draw_numbers`,
    arguments: [
      tx.object(adminCapId),
      tx.object(roundId),
      tx.object(SUI_RANDOM_ID),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build a transaction to settle a round (multi-tier)
 * @param roundId - The lottery round object ID
 * @param tier1WinnersCount - Number of tier 1 (5 match) winners
 * @param tier2WinnersCount - Number of tier 2 (4 match) winners
 * @param tier3WinnersCount - Number of tier 3 (3 match) winners
 * @param adminCapId - Admin capability object ID
 * @returns Transaction object
 */
export function buildSettleRound(
  roundId: string,
  tier1WinnersCount: number,
  tier2WinnersCount: number,
  tier3WinnersCount: number,
  adminCapId: string
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::settle_round`,
    arguments: [
      tx.object(adminCapId),
      tx.object(roundId),
      tx.object(LOTTERY_REGISTRY_ID),
      tx.pure.u64(tier1WinnersCount),
      tx.pure.u64(tier2WinnersCount),
      tx.pure.u64(tier3WinnersCount),
    ],
  });

  return tx;
}

/**
 * Build a transaction to withdraw treasury balance
 * @param adminCapId - Admin capability object ID
 * @returns Transaction object
 */
export function buildWithdrawTreasury(adminCapId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::withdraw_treasury`,
    arguments: [tx.object(adminCapId), tx.object(LOTTERY_REGISTRY_ID)],
  });

  return tx;
}

// ===== Permissionless Keeper Functions =====

/**
 * Build a transaction to close round (permissionless, after close_time)
 * @param roundId - The lottery round object ID
 * @returns Transaction object
 */
export function buildCloseRoundPermissionless(roundId: string): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::close_round_permissionless`,
    arguments: [tx.object(roundId), tx.object(CLOCK_ID)],
  });

  return tx;
}

/**
 * Build a transaction to draw numbers (permissionless, after draw_time)
 * @param roundId - The lottery round object ID
 * @returns Transaction object
 */
export function buildDrawNumbersPermissionless(roundId: string): Transaction {
  const tx = new Transaction();

  // Sui Random is at address 0x8
  const SUI_RANDOM_ID = '0x8';

  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::draw_numbers_permissionless`,
    arguments: [tx.object(roundId), tx.object(SUI_RANDOM_ID), tx.object(CLOCK_ID)],
  });

  return tx;
}
