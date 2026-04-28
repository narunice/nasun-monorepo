/**
 * Prediction Market Transaction Builders
 *
 * Convention (round-6 plan §2.3):
 * - First arg is `tx: Transaction`. Caller assembles tx, builders push moveCalls.
 * - NUSDC payment passed as `TransactionArgument` (built via assemblePaymentArg
 *   which handles inline mergeCoins + splitCoins for fragmented wallets).
 * - Direction-first naming: place_buy_taker, place_sell_taker, place_buy_maker,
 *   place_sell_maker — matches Move on-chain entry function names.
 */

import type { Transaction, TransactionArgument } from '@mysten/sui/transactions';
import { PREDICTION_PACKAGE_ID, CLOCK_ID, MAX_PRICE } from './constants';

// ============================================
// Validation
// ============================================

const MAX_PAYMENT_BASE = 100_000_000_000n;        // 100k NUSDC at 6 decimals
const MAX_MINT_BASE = 100_000_000_000n;
const MAX_QUESTION_LEN = 500;
const MAX_DESCRIPTION_LEN = 2000;
const MAX_CATEGORY_LEN = 50;
const MAX_RESOLUTION_SOURCE_LEN = 500;
const MAX_RESOLUTION_CRITERIA_LEN = 2000;

function validatePriceBps(price: number): void {
  if (!Number.isInteger(price) || price <= 0 || price >= MAX_PRICE) {
    throw new Error(
      `[Security] Price must be an integer between 1 and ${MAX_PRICE - 1} basis points (got ${price})`
    );
  }
}

function validateAmountBase(amount: bigint, max: bigint, label: string): void {
  if (amount <= 0n) throw new Error(`[Security] ${label} must be positive`);
  if (amount > max) throw new Error(`[Security] ${label} exceeds maximum allowed value`);
}

function validateMarketStrings(
  question: string,
  description: string,
  category: string,
  resolutionSource: string,
  resolutionCriteria: string,
): void {
  if (!question || question.length > MAX_QUESTION_LEN) {
    throw new Error(`[Security] Question must be 1-${MAX_QUESTION_LEN} characters`);
  }
  if (description.length > MAX_DESCRIPTION_LEN) {
    throw new Error(`[Security] Description must not exceed ${MAX_DESCRIPTION_LEN} characters`);
  }
  if (!category || category.length > MAX_CATEGORY_LEN) {
    throw new Error(`[Security] Category must be 1-${MAX_CATEGORY_LEN} characters`);
  }
  if (resolutionSource.length > MAX_RESOLUTION_SOURCE_LEN) {
    throw new Error(`[Security] Resolution source must not exceed ${MAX_RESOLUTION_SOURCE_LEN} characters`);
  }
  if (resolutionCriteria.length > MAX_RESOLUTION_CRITERIA_LEN) {
    throw new Error(`[Security] Resolution criteria must not exceed ${MAX_RESOLUTION_CRITERIA_LEN} characters`);
  }
}

// ============================================
// User: Mint
// ============================================

export function buildMintOutcomeTokens(
  tx: Transaction,
  marketId: string,
  paymentArg: TransactionArgument,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
    arguments: [
      tx.object(marketId),
      paymentArg,
      tx.object(CLOCK_ID),
    ],
  });
}

// ============================================
// Maker: place limit orders
// ============================================

export function buildPlaceBuyMaker(
  tx: Transaction,
  marketId: string,
  isYes: boolean,
  priceBps: number,
  paymentArg: TransactionArgument,
): void {
  validatePriceBps(priceBps);
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_buy_maker`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(isYes),
      tx.pure.u64(priceBps),
      paymentArg,
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildPlaceSellMaker(
  tx: Transaction,
  marketId: string,
  positionId: string,
  priceBps: number,
): void {
  validatePriceBps(priceBps);
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_sell_maker`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
      tx.pure.u64(priceBps),
      tx.object(CLOCK_ID),
    ],
  });
}

// ============================================
// Taker: atomic matching
// ============================================

export function buildPlaceBuyTaker(
  tx: Transaction,
  marketId: string,
  isYes: boolean,
  maxPriceBps: number,
  restOnNoFill: boolean,
  paymentArg: TransactionArgument,
): void {
  validatePriceBps(maxPriceBps);
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_buy_taker`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(isYes),
      tx.pure.u64(maxPriceBps),
      tx.pure.bool(restOnNoFill),
      paymentArg,
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildPlaceSellTaker(
  tx: Transaction,
  marketId: string,
  positionId: string,
  minPriceBps: number,
  restOnNoFill: boolean,
): void {
  validatePriceBps(minPriceBps);
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_sell_taker`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
      tx.pure.u64(minPriceBps),
      tx.pure.bool(restOnNoFill),
      tx.object(CLOCK_ID),
    ],
  });
}

// ============================================
// Cancel / Refund
// ============================================

export function buildCancelOrder(
  tx: Transaction,
  marketId: string,
  isYes: boolean,
  isBid: boolean,
  priceBps: number,
  orderId: number | bigint,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::cancel_order`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(isYes),
      tx.pure.bool(isBid),
      tx.pure.u64(priceBps),
      tx.pure.u64(BigInt(orderId)),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildClaimRestingOrderRefund(
  tx: Transaction,
  marketId: string,
  isYes: boolean,
  isBid: boolean,
  priceBps: number,
  orderId: number | bigint,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_resting_order_refund`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(isYes),
      tx.pure.bool(isBid),
      tx.pure.u64(priceBps),
      tx.pure.u64(BigInt(orderId)),
    ],
  });
}

// ============================================
// Resolution claims
// ============================================

export function buildClaimWinnings(
  tx: Transaction,
  marketId: string,
  positionId: string,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_winnings`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
    ],
  });
}

export function buildBurnLosingPosition(
  tx: Transaction,
  marketId: string,
  positionId: string,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::burn_losing_position`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
    ],
  });
}

// ============================================
// Cancellation
// ============================================

export function buildCancelExpiredMarket(
  tx: Transaction,
  marketId: string,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::cancel_expired_market`,
    arguments: [
      tx.object(marketId),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildClaimCancelledRefund(
  tx: Transaction,
  marketId: string,
  positionId: string,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_cancelled_refund`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
    ],
  });
}

// ============================================
// Admin
// ============================================

export function buildResolveMarket(
  tx: Transaction,
  marketId: string,
  outcome: boolean,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::resolve_market`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(outcome),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildCreateMarket(
  tx: Transaction,
  adminCapId: string,
  question: string,
  description: string,
  category: string,
  resolutionSource: string,
  resolutionCriteria: string,
  closeTime: bigint,
  resolveDeadline: bigint,
  resolver: string,
): void {
  validateMarketStrings(question, description, category, resolutionSource, resolutionCriteria);
  if (resolveDeadline <= closeTime) {
    throw new Error('[Security] Resolve deadline must be after close time');
  }
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::create_market`,
    arguments: [
      tx.object(adminCapId),
      tx.pure.string(question),
      tx.pure.string(description),
      tx.pure.string(category),
      tx.pure.string(resolutionSource),
      tx.pure.string(resolutionCriteria),
      tx.pure.u64(closeTime),
      tx.pure.u64(resolveDeadline),
      tx.pure.address(resolver),
      tx.object(CLOCK_ID),
    ],
  });
}

// ============================================
// Bound exports for unit tests / external code that wants to import the limits
// ============================================

export const TX_MAX_PAYMENT_BASE = MAX_PAYMENT_BASE;
export const TX_MAX_MINT_BASE = MAX_MINT_BASE;
