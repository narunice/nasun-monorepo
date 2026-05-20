/**
 * Pure BigInt arithmetic for the BankrollPool surface.
 *
 * Single home for share-price / TVL / PnL / APY / redeem-quote math so
 * lp.ts, bankroll-pnl.ts and risk-metrics.ts cannot drift independently.
 *
 * All functions are side-effect free and deterministic. No I/O, no env reads,
 * no module-level state beyond the SCALE constant. Safe to import from any
 * layer (route, indexer, test) without dragging env-required modules.
 *
 * Matches Move module `bankroll_pool::*`
 * (apps/gostop/contracts-bankroll-pool/sources/bankroll_pool.move).
 */

/**
 * Share-price scale factor. Matches bankroll_pool.move:SHARE_PRICE_SCALE.
 * pps_scaled / SCALE = human share price. Tested as a hard constant so a
 * silent edit on either side fails the build.
 */
export const SHARE_PRICE_SCALE = 1_000_000_000n;

/**
 * Chain pps formula: (pool.balance * SCALE) / pool.total_shares.
 *
 * `shares == 0` returns SCALE (1.0 pps) — pre-seed convention from
 * bankroll_pool.move:606 share_price_scaled().
 */
export function calcSharePriceScaled(balance: bigint, shares: bigint): bigint {
  if (shares === 0n) return SHARE_PRICE_SCALE;
  return (balance * SHARE_PRICE_SCALE) / shares;
}

/**
 * Net house PnL for a window: bets - payouts - refunds (game_id 2..6).
 * Treasury inflows are NOT PnL (capital, not earnings) and excluded by caller.
 */
export function computeNetPnl(bets: bigint, payouts: bigint, refunds: bigint): bigint {
  return bets - payouts - refunds;
}

/**
 * Annualized APY in percent (2-decimal precision via *100/100 round-trip).
 *
 * Returns null when tvl <= 0 (would be divide-by-zero or sign-flip).
 * NOTE: This is the only function in the module that returns number rather
 * than bigint — the final cast is unavoidable for a percentage display.
 *
 * Caller is responsible for upstream data-quality gating (e.g. the route
 * should not call this when pnl.data_quality !== 'fresh').
 *
 * windowDays is the annualization basis. Route owns the window choice.
 */
export function computeApyPct(netPnl: bigint, tvl: bigint, windowDays: number): number | null {
  if (tvl <= 0n) return null;
  const apyPctTimes100 = (netPnl * 10_000n * 365n) / (tvl * BigInt(windowDays));
  return Number(apyPctTimes100) / 100;
}

/**
 * TVL_raw = (pps_scaled * total_shares) / SCALE.
 */
export function computeTvl(ppsScaled: bigint, totalShares: bigint): bigint {
  return (ppsScaled * totalShares) / SHARE_PRICE_SCALE;
}

/**
 * Cumulative LP distributions ≈ (pps - 1.0) × total_shares / SCALE.
 * Signed — negative when the pool is underwater. UI clamps to zero;
 * the API stays honest.
 */
export function computeCumulativeLpDist(ppsScaled: bigint, totalShares: bigint): bigint {
  const ppsExcess = ppsScaled - SHARE_PRICE_SCALE;
  return (ppsExcess * totalShares) / SHARE_PRICE_SCALE;
}

/**
 * Utilization in basis points: exposure / tvl, expressed as int bps.
 * Returns 0 when tvl <= 0 (matches risk-metrics convention).
 */
export function computeUtilizationBps(exposureRaw: bigint, tvlRaw: bigint): number {
  if (tvlRaw <= 0n) return 0;
  return Number((exposureRaw * 10_000n) / tvlRaw);
}

/**
 * Mirrors Move bankroll_pool::redeem_liquidity quote (bankroll_pool.move:673):
 *   shares * (poolBalance + 1) / (poolShares + 1)
 *
 * The +1 virtual offset is ERC4626-style inflation-attack mitigation
 * (see bankroll_pool.move:9-12). It MUST be preserved — without it the
 * UI quote diverges from what redeem would actually pay.
 *
 * poolShares == 0 returns 0n (no redeem possible against an empty pool).
 *
 * NOT to be used for deposit preview — use previewSharesForDeposit on the
 * frontend (simplified formula, acceptable for pre-tx preview only).
 */
export function computeRedeemQuoteRaw(
  shares: bigint,
  poolBalance: bigint,
  poolShares: bigint,
): bigint {
  if (poolShares <= 0n) return 0n;
  return (shares * (poolBalance + 1n)) / (poolShares + 1n);
}
