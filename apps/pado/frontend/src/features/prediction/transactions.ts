/**
 * Prediction Market Transaction Builders
 *
 * Convention (round-6 plan §2.3):
 * - First arg is `tx: Transaction`. Caller assembles tx, builders push moveCalls.
 * - NUSDC payment passed as `TransactionArgument` (built via assemblePaymentArg
 *   which handles inline mergeCoins + splitCoins for fragmented wallets).
 * - Direction-first naming: place_buy_taker, place_sell_taker, place_buy_maker,
 *   place_sell_maker — matches Move on-chain entry function names.
 *
 * 2026-05-20 v5 cutover:
 * Every builder dispatches `packageId` via `packageForMarket(marketId)`, which
 * reads from the in-memory registry populated by `fetchMarket`. A wrong-
 * package call aborts at dryRun (not silently), so the worst case for a miss
 * is a clear error rather than incorrect on-chain state. Callers may pass an
 * explicit override for cases where the registry hasn't been populated yet
 * (e.g. brand-new admin-created v5 markets before the first fetch).
 */

import type { Transaction, TransactionArgument } from '@mysten/sui/transactions';
import {
  PREDICTION_PACKAGE_ID,
  POSITION_TYPE,
  LEGACY_PREDICTION_PACKAGE_ID,
  LEGACY_POSITION_TYPE,
  CLOCK_ID,
  MAX_PRICE,
  packageForMarket,
} from './constants';

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
  packageIdOverride?: string,
): void {
  validateAmountBase(amountBase, MAX_MINT_BASE, 'Mint amount');
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::mint_outcome_tokens`,
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
  packageIdOverride?: string,
): void {
  validatePriceBps(priceBps);
  validateAmountBase(amountBase, MAX_PAYMENT_BASE, 'Buy maker amount');
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::place_buy_maker`,
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
  packageIdOverride?: string,
): void {
  validatePriceBps(priceBps);
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::place_sell_maker`,
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
  packageIdOverride?: string,
): void {
  validatePriceBps(maxPriceBps);
  validateAmountBase(amountBase, MAX_PAYMENT_BASE, 'Buy taker amount');
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::place_buy_taker`,
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
  packageIdOverride?: string,
): void {
  validatePriceBps(minPriceBps);
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::place_sell_taker`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::cancel_order`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::claim_resting_order_refund`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::claim_winnings`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::burn_losing_position`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::cancel_expired_market`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::claim_cancelled_refund`,
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
 *
 * NOTE: `merge_positions` was added in v2 of the legacy package and lives in
 * v5 too. Type-vec uses the POSITION_TYPE (v5 originalId) — legacy positions
 * have a different type tag, so a merge that mixes v5 and legacy positions
 * would fail on dryRun. This is fine because positions can only originate
 * from a single market, and a market belongs to exactly one package.
 */
export function buildMergePositionsChained(
  tx: Transaction,
  marketId: string,
  positionIds: readonly string[],
  packageIdOverride?: string,
): TransactionArgument {
  validateMergeInputs(positionIds);
  const pkg = packageForMarket(marketId, packageIdOverride);
  // Vec type tag is anchored to the originalPackageId of the package that
  // owns this market. Derive from `pkg` (the latest published-at) by reading
  // the same originalId convention as the Move source.
  // For v5 fresh publish, originalId == latest so this collapses to `pkg`.
  // For legacy, callers must pass a positionTypePackage override if they
  // ever mix sides — but that's unreachable per the docstring above.
  const positionsVec = tx.makeMoveVec({
    elements: positionIds.map((id) => tx.object(id)),
    type: positionTypeFor(pkg),
  });
  return tx.moveCall({
    target: `${pkg}::prediction_market::merge_positions`,
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
  packageIdOverride?: string,
): void {
  validateMergeInputs(positionIds);
  const pkg = packageForMarket(marketId, packageIdOverride);
  const positionsVec = tx.makeMoveVec({
    elements: positionIds.map((id) => tx.object(id)),
    type: positionTypeFor(pkg),
  });
  tx.moveCall({
    target: `${pkg}::prediction_market::merge_positions_entry`,
    arguments: [tx.object(marketId), positionsVec],
  });
}

/**
 * Map a package's *latest* publish id (used as moveCall target) to the
 * `Position` struct type-tag anchored to that package's originalId. Sui's
 * type system tags structs at the originalId, NOT the latest publish, so
 * `${pkg}::prediction_market::Position` would only be correct for fresh
 * publishes (where pkg == originalId).
 *
 * For the cutover, v5 is a fresh publish (pkg == originalId), and legacy
 * has a known originalId/published-at split that we encode here.
 */
function positionTypeFor(latestPkg: string): string {
  if (latestPkg === LEGACY_PREDICTION_PACKAGE_ID) return LEGACY_POSITION_TYPE;
  if (latestPkg === PREDICTION_PACKAGE_ID) return POSITION_TYPE;
  // Unknown package — fall through to v5 type. dryRun will surface mismatch
  // immediately if the assumption was wrong.
  return POSITION_TYPE;
}

/**
 * Helper: given a list of Position IDs in the same (market, side) bucket,
 * return a `PositionArg` suitable for passing to any Position-consuming
 * builder.
 *
 * Behavior by bucket size:
 *   - 0:           throws (no positions to merge).
 *   - 1:           returns the lone ID as a plain string (no moveCall added).
 *   - 2..256:      emits one `merge_positions` and returns the chained arg.
 *   - 257..MAX:    emits a chain of `merge_positions` calls (each ≤256 inputs)
 *                  threaded through a running merged Position. The final
 *                  merged Position is returned as the chained arg.
 *
 * The chunked path keeps single-signature UX for users with deep position
 * lists (e.g. a taker order that hit many maker fills produced 998 Position
 * NFTs in one (market, side) bucket — without this path, the per-call 256
 * cap would force the Claim All UI to throw on the first attempt).
 */
export function buildBucketPositionArg(
  tx: Transaction,
  marketId: string,
  positionIds: readonly string[],
  packageIdOverride?: string,
): PositionArg {
  if (positionIds.length === 0) {
    throw new Error('[Security] buildBucketPositionArg requires at least one position');
  }
  if (positionIds.length === 1) {
    return positionIds[0];
  }
  if (positionIds.length <= MAX_MERGE_BATCH) {
    return buildMergePositionsChained(tx, marketId, positionIds, packageIdOverride);
  }
  return buildChunkedChainedMerge(tx, marketId, positionIds, packageIdOverride);
}

/**
 * Large-bucket path: chain N merge_positions calls so each one stays within
 * the per-call 256-input cap while the entire merge completes inside a single
 * PTB / single user signature.
 *
 * Strategy: first merge takes a full chunk of up to MAX_MERGE_BATCH raw IDs.
 * Subsequent merges take `[running_merged, ...next chunk]` so the prior
 * result threads through. Each subsequent chunk holds up to
 * `MAX_MERGE_BATCH - 1` new IDs (one slot reserved for the running merged
 * Position).
 *
 * Total moveCalls = ceil((N - MAX_MERGE_BATCH) / (MAX_MERGE_BATCH - 1)) + 1.
 * For N=998: ceil(742 / 255) + 1 = 4 merge calls.
 */
function buildChunkedChainedMerge(
  tx: Transaction,
  marketId: string,
  positionIds: readonly string[],
  packageIdOverride?: string,
): TransactionArgument {
  const pkg = packageForMarket(marketId, packageIdOverride);
  const posType = positionTypeFor(pkg);

  // First merge: full batch of raw IDs (no running result yet).
  const firstChunkSize = Math.min(MAX_MERGE_BATCH, positionIds.length);
  const firstVec = tx.makeMoveVec({
    elements: positionIds.slice(0, firstChunkSize).map((id) => tx.object(id)),
    type: posType,
  });
  let merged: TransactionArgument = tx.moveCall({
    target: `${pkg}::prediction_market::merge_positions`,
    arguments: [tx.object(marketId), firstVec],
  });
  let cursor = firstChunkSize;

  // Subsequent merges: prepend the running merged Position to each chunk so
  // the chain consumes it. One vector slot is reserved for the prior result,
  // leaving MAX_MERGE_BATCH - 1 slots for new IDs.
  while (cursor < positionIds.length) {
    const remaining = positionIds.length - cursor;
    const chunkSize = Math.min(MAX_MERGE_BATCH - 1, remaining);
    const nextIds = positionIds.slice(cursor, cursor + chunkSize);
    const vec = tx.makeMoveVec({
      elements: [merged, ...nextIds.map((id) => tx.object(id))],
      type: posType,
    });
    merged = tx.moveCall({
      target: `${pkg}::prediction_market::merge_positions`,
      arguments: [tx.object(marketId), vec],
    });
    cursor += chunkSize;
  }
  return merged;
}

// ============================================
// Admin
// ============================================

export function buildResolveMarket(
  tx: Transaction,
  marketId: string,
  outcome: boolean,
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::resolve_market`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::extend_resolve_deadline`,
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
  packageIdOverride?: string,
): void {
  const pkg = packageForMarket(marketId, packageIdOverride);
  tx.moveCall({
    target: `${pkg}::prediction_market::admin_cancel_market`,
    arguments: [
      tx.object(adminCapId),
      tx.object(marketId),
      tx.object(CLOCK_ID),
    ],
  });
}

/**
 * Create a brand-new market on v5. Always targets PREDICTION_PACKAGE_ID
 * (legacy is read-only post-cutover; admin should not create new legacy
 * markets — admin-cancelling expired legacy ones is fine via
 * buildAdminCancelMarket).
 */
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
  packageIdOverride?: string,
): void {
  validateMarketStrings(question, description, category, resolutionSource, resolutionCriteria);
  if (resolveDeadline <= closeTime) {
    throw new Error('[Security] Resolve deadline must be after close time');
  }
  const pkg = packageIdOverride ?? PREDICTION_PACKAGE_ID;
  tx.moveCall({
    target: `${pkg}::prediction_market::create_market`,
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

// Re-export the dispatch helper so external consumers can use it for custom
// PTB construction without re-importing from './constants'.
export { packageForMarket };
