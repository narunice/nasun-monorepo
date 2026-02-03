/**
 * Prediction Market Transaction Builders
 */

import { Transaction } from '@mysten/sui/transactions';
import { PREDICTION_PACKAGE_ID, PREDICTION_GLOBAL_STATE, CLOCK_ID, MAX_PRICE } from './constants';

// ============================================
// Security: Validation Functions
// ============================================

/** Maximum mint/bid amount to prevent fat-finger errors (1M NUSDC) */
const MAX_AMOUNT = 1_000_000_000_000n; // 1M NUSDC (6 decimals)

/** Maximum string length for market metadata */
const MAX_QUESTION_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 50;

/**
 * Validate prediction price (basis points: 1-9999)
 * Boundary values 0 and 10000 represent certainty and are excluded.
 */
function validatePrice(price: number): void {
  if (!Number.isInteger(price) || price <= 0 || price >= MAX_PRICE) {
    throw new Error(
      `[Security] Price must be an integer between 1 and ${MAX_PRICE - 1} basis points (got ${price})`
    );
  }
}

/** Validate amount is positive and within sane bounds */
function validateAmount(amount: bigint): void {
  if (amount <= 0n) {
    throw new Error('[Security] Amount must be positive');
  }
  if (amount > MAX_AMOUNT) {
    throw new Error('[Security] Amount exceeds maximum allowed value');
  }
}

/** Validate market metadata string lengths */
function validateMarketStrings(question: string, description: string, category: string): void {
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    throw new Error(`[Security] Question must be 1-${MAX_QUESTION_LENGTH} characters`);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`[Security] Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  if (!category || category.length > MAX_CATEGORY_LENGTH) {
    throw new Error(`[Security] Category must be 1-${MAX_CATEGORY_LENGTH} characters`);
  }
}

// ============================================
// User Transaction Builders
// ============================================

/**
 * Mint YES and NO tokens by depositing NUSDC
 * 1 NUSDC = 1 YES + 1 NO (always minted in pairs)
 */
export function buildMintOutcomeTokens(
  marketId: string,
  nusdcCoinId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
    arguments: [
      tx.object(marketId),
      tx.object(nusdcCoinId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Mint outcome tokens with split amount
 * Splits NUSDC from existing coin and mints tokens
 */
export function buildMintOutcomeTokensWithAmount(
  marketId: string,
  nusdcCoinId: string,
  amount: bigint,
  _senderAddress: string,
): Transaction {
  validateAmount(amount);

  const tx = new Transaction();

  // Split the exact amount from the coin
  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
    arguments: [
      tx.object(marketId),
      paymentCoin,
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Place a bid order to buy outcome tokens (YES or NO)
 * Payment is in NUSDC
 */
export function buildPlaceBidOrder(
  marketId: string,
  isYes: boolean,
  price: number,
  nusdcCoinId: string,
): Transaction {
  validatePrice(price);

  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
    arguments: [
      tx.object(marketId),
      tx.object(PREDICTION_GLOBAL_STATE),
      tx.pure.bool(isYes),
      tx.pure.u64(price),
      tx.object(nusdcCoinId),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Place a bid order with specific amount
 */
export function buildPlaceBidOrderWithAmount(
  marketId: string,
  isYes: boolean,
  price: number,
  nusdcCoinId: string,
  amount: bigint,
): Transaction {
  validatePrice(price);
  validateAmount(amount);

  const tx = new Transaction();

  // Split the exact amount
  const [paymentCoin] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
    arguments: [
      tx.object(marketId),
      tx.object(PREDICTION_GLOBAL_STATE),
      tx.pure.bool(isYes),
      tx.pure.u64(price),
      paymentCoin,
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Place an ask order to sell outcome tokens
 * Requires a Position NFT
 */
export function buildPlaceAskOrder(
  marketId: string,
  positionId: string,
  price: number,
): Transaction {
  validatePrice(price);

  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_ask_order`,
    arguments: [
      tx.object(marketId),
      tx.object(PREDICTION_GLOBAL_STATE),
      tx.object(positionId),
      tx.pure.u64(price),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Claim winnings after market resolution
 */
export function buildClaimWinnings(
  marketId: string,
  positionId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_winnings`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
    ],
  });

  return tx;
}

/**
 * Burn losing position (cleanup)
 */
export function buildBurnLosingPosition(
  marketId: string,
  positionId: string,
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::burn_losing_position`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
    ],
  });

  return tx;
}

// ============================================
// Admin Transaction Builders
// ============================================

/**
 * Resolve market with outcome (Admin only)
 * Only the designated resolver can call this after close_time
 */
export function buildResolveMarket(
  marketId: string,
  outcome: boolean, // true = YES wins, false = NO wins
): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::resolve_market`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(outcome),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Create new market (Admin only)
 * Requires AdminCap
 */
export function buildCreateMarket(
  adminCapId: string,
  question: string,
  description: string,
  category: string,
  closeTime: bigint,
  resolveDeadline: bigint,
  resolver: string,
): Transaction {
  validateMarketStrings(question, description, category);

  if (resolveDeadline <= closeTime) {
    throw new Error('[Security] Resolve deadline must be after close time');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::create_market`,
    arguments: [
      tx.object(adminCapId),
      tx.pure.string(question),
      tx.pure.string(description),
      tx.pure.string(category),
      tx.pure.u64(closeTime),
      tx.pure.u64(resolveDeadline),
      tx.pure.address(resolver),
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}
