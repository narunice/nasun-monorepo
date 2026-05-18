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
import { PREDICTION_PACKAGE_ID, POSITION_TYPE, CLOCK_ID, MAX_PRICE } from './constants';

/**
 * Position argument — either a freshly-owned ObjectID string (e.g. an existing
 * Position NFT in the user's wallet) or a chained TransactionArgument produced
 * by an earlier moveCall in the same PTB (e.g. the return value of
 * merge_positions). Builders that consume a Position accept either form.
 */
export type PositionArg = string | TransactionArgument;

function toPositionArg(tx: Transaction, arg: PositionArg): TransactionArgument {
  return typeof arg === 'string' ? tx.object(arg) : arg;
}

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
  if (amount > max) {
    throw new Error(
      `[Security] ${label} ${amount} exceeds maximum allowed value ${max} (mirrors Move MAX_PAYMENT_AMOUNT_BASE)`,
    );
  }
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
  amountBase: bigint,
  paymentArg: TransactionArgument,
): void {
  validateAmountBase(amountBase, MAX_MINT_BASE, 'Mint amount');
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
  amountBase: bigint,
  paymentArg: TransactionArgument,
): void {
  validatePriceBps(priceBps);
  validateAmountBase(amountBase, MAX_PAYMENT_BASE, 'Buy maker amount');
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
  positionId: PositionArg,
  priceBps: number,
): void {
  validatePriceBps(priceBps);
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_sell_maker`,
    arguments: [
      tx.object(marketId),
      toPositionArg(tx, positionId),
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
  amountBase: bigint,
  paymentArg: TransactionArgument,
): void {
  validatePriceBps(maxPriceBps);
  validateAmountBase(amountBase, MAX_PAYMENT_BASE, 'Buy taker amount');
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
  positionId: PositionArg,
  minPriceBps: number,
  restOnNoFill: boolean,
): void {
  validatePriceBps(minPriceBps);
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_sell_taker`,
    arguments: [
      tx.object(marketId),
      toPositionArg(tx, positionId),
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
  positionId: PositionArg,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_winnings`,
    arguments: [
      tx.object(marketId),
      toPositionArg(tx, positionId),
    ],
  });
}

export function buildBurnLosingPosition(
  tx: Transaction,
  marketId: string,
  positionId: PositionArg,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::burn_losing_position`,
    arguments: [
      tx.object(marketId),
      toPositionArg(tx, positionId),
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
  positionId: PositionArg,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_cancelled_refund`,
    arguments: [
      tx.object(marketId),
      toPositionArg(tx, positionId),
    ],
  });
}

// ============================================
// Position Merge
// ============================================

/**
 * Soft cap on input vector size for a single merge_positions call. The Sui PTB
 * input limit is well above this, but we keep merge ops compact to bound gas
 * per call. Callers with more than this should batch merges (uncommon path).
 */
const MAX_MERGE_BATCH = 256;

function validateMergeInputs(positionIds: readonly string[]): void {
  if (positionIds.length === 0) {
    throw new Error('[Security] merge_positions requires at least one position');
  }
  if (positionIds.length > MAX_MERGE_BATCH) {
    throw new Error(
      `[Security] merge_positions batch size ${positionIds.length} exceeds cap ${MAX_MERGE_BATCH}; ` +
        `split into multiple merges`,
    );
  }
}

/**
 * Chained variant — calls `merge_positions` and returns the merged Position as
 * a `TransactionArgument` so it can be threaded into the next moveCall within
 * the same PTB (e.g. place_sell_taker, claim_winnings).
 *
 * Use this for auto-merge-then-action flows where the user expects a single
 * signature. If you need a standalone "merge and keep" tx, use
 * `buildMergePositionsEntry` instead.
 */
export function buildMergePositionsChained(
  tx: Transaction,
  marketId: string,
  positionIds: readonly string[],
): TransactionArgument {
  validateMergeInputs(positionIds);
  const positionsVec = tx.makeMoveVec({
    elements: positionIds.map((id) => tx.object(id)),
    type: POSITION_TYPE,
  });
  return tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::merge_positions`,
    arguments: [tx.object(marketId), positionsVec],
  });
}

/**
 * Standalone "merge and keep" — calls `merge_positions_entry` which transfers
 * the merged Position back to the sender's wallet. Use for explicit user-
 * triggered tidy-up; for auto-merge piggybacked onto a sell/claim, prefer
 * `buildMergePositionsChained`.
 */
export function buildMergePositionsEntry(
  tx: Transaction,
  marketId: string,
  positionIds: readonly string[],
): void {
  validateMergeInputs(positionIds);
  const positionsVec = tx.makeMoveVec({
    elements: positionIds.map((id) => tx.object(id)),
    type: POSITION_TYPE,
  });
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::merge_positions_entry`,
    arguments: [tx.object(marketId), positionsVec],
  });
}

/**
 * Helper: given a list of Position IDs in the same (market, side) bucket,
 * return a `PositionArg` suitable for passing to any Position-consuming
 * builder. If the bucket has one element, returns it as a plain string (no
 * moveCall needed). If two or more, emits a `merge_positions` and returns the
 * chained argument.
 */
export function buildBucketPositionArg(
  tx: Transaction,
  marketId: string,
  positionIds: readonly string[],
): PositionArg {
  if (positionIds.length === 1) {
    return positionIds[0];
  }
  return buildMergePositionsChained(tx, marketId, positionIds);
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

export function buildExtendResolveDeadline(
  tx: Transaction,
  adminCapId: string,
  marketId: string,
  newDeadline: bigint,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::extend_resolve_deadline`,
    arguments: [
      tx.object(adminCapId),
      tx.object(marketId),
      tx.pure.u64(newDeadline),
      tx.object(CLOCK_ID),
    ],
  });
}

export function buildAdminCancelMarket(
  tx: Transaction,
  adminCapId: string,
  marketId: string,
): void {
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::admin_cancel_market`,
    arguments: [
      tx.object(adminCapId),
      tx.object(marketId),
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
