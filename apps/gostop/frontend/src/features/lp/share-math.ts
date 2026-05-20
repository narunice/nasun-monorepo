/**
 * LP share-math (frontend preview only).
 *
 * These formulas are pre-tx PREVIEW estimates. They do NOT carry the +1
 * virtual offset that Move's compute_shares_to_mint / redeem_liquidity use
 * (bankroll_pool.move:616 / :673). The simplification is acceptable here
 * because the chain returns the authoritative value on tx confirm; UI just
 * needs a sane estimate.
 *
 * Do NOT use these for backend quote logic — that lives in
 * apps/gostop/backend/src/api/lib/bankroll-pool-math.ts (computeRedeemQuoteRaw),
 * which mirrors the Move +1 trick exactly.
 */

/**
 * Share-price scale factor. Mirrors backend SHARE_PRICE_SCALE and Move
 * bankroll_pool.move:SHARE_PRICE_SCALE. Locked by a test assertion so a
 * silent edit breaks the build.
 */
export const SHARE_PRICE_SCALE = 1_000_000_000n;

/**
 * Preview shares the user would receive for a NUSDC deposit, assuming a
 * given pps. Returns 0n when pps is zero or negative (pre-seed / unknown).
 *
 * Caller renders this as a string. Chain returns the authoritative count
 * on tx confirm.
 */
export function previewSharesForDeposit(amountBaseUnits: bigint, ppsScaled: bigint): bigint {
  if (ppsScaled <= 0n) return 0n;
  return (amountBaseUnits * SHARE_PRICE_SCALE) / ppsScaled;
}

/**
 * Preview NUSDC value a user's LP shares are currently worth, assuming a
 * given pps. Returns 0n when pps is zero or negative.
 *
 * Simplified vs the chain redeem quote (no +1 virtual offset). Acceptable
 * for "estimated value" display; do not use as a withdraw target.
 */
export function previewValueForShares(shares: bigint, ppsScaled: bigint): bigint {
  if (ppsScaled <= 0n) return 0n;
  return (shares * ppsScaled) / SHARE_PRICE_SCALE;
}
