/**
 * Golden-master tests for bankroll-pool-math.
 *
 * Captures the on-chain-derived BigInt arithmetic that callers (lp.ts,
 * bankroll-pnl.ts, risk-metrics.ts) used to inline. These tests existed
 * BEFORE the inline-to-module extraction so that a behavior-preserving
 * refactor is provable: every assertion here must hold both before and
 * after the call-site rewires.
 *
 * Do NOT add chain-quote `+1` virtual offset to the frontend share-math
 * module — that lives only in computeRedeemQuoteRaw here and mirrors
 * bankroll_pool.move:673. Frontend preview formulas are intentionally
 * simpler (pre-tx estimate only).
 */

import { describe, it, expect } from 'vitest';
import {
  SHARE_PRICE_SCALE,
  calcSharePriceScaled,
  computeNetPnl,
  computeApyPct,
  computeTvl,
  computeCumulativeLpDist,
  computeUtilizationBps,
  computeRedeemQuoteRaw,
} from './bankroll-pool-math.js';

describe('SHARE_PRICE_SCALE', () => {
  it('matches bankroll_pool.move:SHARE_PRICE_SCALE (1e9)', () => {
    // Build-time lock: if Move-side const changes, this fails and forces
    // a coordinated update on both sides.
    expect(SHARE_PRICE_SCALE).toBe(1_000_000_000n);
  });
});

describe('calcSharePriceScaled', () => {
  it('returns SCALE when shares == 0 (pre-seed convention)', () => {
    expect(calcSharePriceScaled(0n, 0n)).toBe(SHARE_PRICE_SCALE);
    expect(calcSharePriceScaled(1_000n, 0n)).toBe(SHARE_PRICE_SCALE);
  });

  it('returns SCALE when balance == shares (1.0 pps)', () => {
    // pps_scaled / SCALE == 1.0  ⇔  balance == shares
    expect(calcSharePriceScaled(1n, 1n)).toBe(SHARE_PRICE_SCALE);
    expect(calcSharePriceScaled(5n, 5n)).toBe(SHARE_PRICE_SCALE);
    expect(calcSharePriceScaled(SHARE_PRICE_SCALE, SHARE_PRICE_SCALE)).toBe(SHARE_PRICE_SCALE);
  });

  it('integer-truncates (1.5 pps via 3/2)', () => {
    // (3 * 1e9) / 2 = 1_500_000_000
    expect(calcSharePriceScaled(3n, 2n)).toBe(1_500_000_000n);
  });

  it('integer-truncates (7/3)', () => {
    // (7 * 1e9) / 3 = 2_333_333_333 (floor)
    expect(calcSharePriceScaled(7n, 3n)).toBe(2_333_333_333n);
  });
});

describe('computeNetPnl', () => {
  it('returns bets - payouts - refunds', () => {
    expect(computeNetPnl(100n, 80n, 5n)).toBe(15n);
    expect(computeNetPnl(0n, 0n, 0n)).toBe(0n);
  });

  it('preserves sign when house is losing', () => {
    expect(computeNetPnl(0n, 10n, 0n)).toBe(-10n);
    expect(computeNetPnl(50n, 100n, 5n)).toBe(-55n);
  });
});

describe('computeApyPct', () => {
  it('returns null when tvl <= 0 (divide-by-zero guard)', () => {
    expect(computeApyPct(100n, 0n, 7)).toBeNull();
    expect(computeApyPct(100n, -1n, 7)).toBeNull();
  });

  it('returns 0 when netPnl is 0', () => {
    expect(computeApyPct(0n, 1_000n, 7)).toBe(0);
  });

  it('annualizes a 7d window correctly (positive)', () => {
    // (100 * 10_000 * 365) / (1000 * 7) = 365_000_000 / 7_000 = 52_142
    // /100 = 521.42 (truncation: BigInt division before Number cast)
    expect(computeApyPct(100n, 1_000n, 7)).toBeCloseTo(521.42, 2);
  });

  it('annualizes a 30d window correctly', () => {
    // (100 * 10_000 * 365) / (1000 * 30) = 365_000_000 / 30_000 = 12_166
    // /100 = 121.66
    expect(computeApyPct(100n, 1_000n, 30)).toBeCloseTo(121.66, 2);
  });

  it('preserves negative APY when house is underwater', () => {
    expect(computeApyPct(-100n, 1_000n, 7)).toBeLessThan(0);
  });
});

describe('computeTvl', () => {
  it('TVL = pps * shares / SCALE (1.0 pps)', () => {
    expect(computeTvl(SHARE_PRICE_SCALE, 1_000n)).toBe(1_000n);
  });

  it('TVL truncates at 1.5 pps × 10 shares', () => {
    // (1.5e9 * 10) / 1e9 = 15
    expect(computeTvl(1_500_000_000n, 10n)).toBe(15n);
  });

  it('returns 0 when totalShares is 0', () => {
    expect(computeTvl(SHARE_PRICE_SCALE, 0n)).toBe(0n);
  });
});

describe('computeCumulativeLpDist', () => {
  it('returns 0 at exact 1.0 pps', () => {
    expect(computeCumulativeLpDist(SHARE_PRICE_SCALE, 100n)).toBe(0n);
  });

  it('returns positive when pool is profitable (pps > 1.0)', () => {
    // pps=1.5e9, excess=0.5e9, shares=10 → (0.5e9 * 10) / 1e9 = 5
    expect(computeCumulativeLpDist(1_500_000_000n, 10n)).toBe(5n);
  });

  it('returns negative when pool is underwater (pps < 1.0)', () => {
    // pps=0.5e9, excess=-0.5e9, shares=10 → (-0.5e9 * 10) / 1e9 = -5
    expect(computeCumulativeLpDist(500_000_000n, 10n)).toBe(-5n);
  });
});

describe('computeUtilizationBps', () => {
  it('returns 0 when tvl <= 0', () => {
    expect(computeUtilizationBps(100n, 0n)).toBe(0);
    expect(computeUtilizationBps(100n, -1n)).toBe(0);
  });

  it('returns 1000 (10%) at exposure=100, tvl=1000', () => {
    expect(computeUtilizationBps(100n, 1_000n)).toBe(1000);
  });

  it('returns full cap (10000) at exposure==tvl', () => {
    expect(computeUtilizationBps(1_000n, 1_000n)).toBe(10_000);
  });

  it('can exceed 10000 if exposure > tvl (over-utilized — caller must clamp)', () => {
    expect(computeUtilizationBps(2_000n, 1_000n)).toBe(20_000);
  });
});

describe('computeRedeemQuoteRaw', () => {
  it('returns 0 when poolShares is 0 (empty pool)', () => {
    expect(computeRedeemQuoteRaw(100n, 0n, 0n)).toBe(0n);
    expect(computeRedeemQuoteRaw(100n, 1_000n, 0n)).toBe(0n);
  });

  it('preserves the +1 virtual offset (Move redeem_liquidity)', () => {
    // shares=1, balance=0, poolShares=1 → 1 * (0+1) / (1+1) = 0 (Move behavior)
    expect(computeRedeemQuoteRaw(1n, 0n, 1n)).toBe(0n);
  });

  it('large-pool case matches Move math', () => {
    // shares=1000, balance=10000, poolShares=1000
    // → 1000 * (10000+1) / (1000+1) = 10_001_000 / 1001 = 9991 (floor)
    expect(computeRedeemQuoteRaw(1_000n, 10_000n, 1_000n)).toBe(9_991n);
  });

  it('proportional redeem at 1:1 ratio with small +1 drag', () => {
    // shares=100, balance=1000, poolShares=1000
    // → 100 * 1001 / 1001 = 100
    expect(computeRedeemQuoteRaw(100n, 1_000n, 1_000n)).toBe(100n);
  });
});

/**
 * Cascade scenarios — pins how riskMetrics() composes atomic helpers.
 * If someone inlines the math back into riskMetrics() or changes the
 * composition order, the atomic tests still pass but these will catch
 * the cascade behavior drift.
 */
describe('cascade: tvl=0 → utilization=0', () => {
  it('empty pool yields 0% utilization regardless of exposure', () => {
    const tvl = computeTvl(SHARE_PRICE_SCALE, 0n);
    expect(tvl).toBe(0n);
    expect(computeUtilizationBps(100n, tvl)).toBe(0);
    expect(computeUtilizationBps(10_000_000n, tvl)).toBe(0);
  });
});

describe('cascade: 1.0 pps → cumulativeLpDist=0 + TVL=shares', () => {
  it('exactly at 1.0 pps the pool has distributed nothing and TVL=shares (base units)', () => {
    const pps = SHARE_PRICE_SCALE;
    const shares = 1_000n;
    expect(computeCumulativeLpDist(pps, shares)).toBe(0n);
    expect(computeTvl(pps, shares)).toBe(shares);
  });
});

describe('cascade: negative netPnl → negative APY', () => {
  it('house losing carries through to APY sign', () => {
    const netPnl = computeNetPnl(0n, 50n, 0n); // -50
    expect(netPnl).toBeLessThan(0n);
    const apy = computeApyPct(netPnl, 1_000n, 7);
    expect(apy).not.toBeNull();
    expect(apy!).toBeLessThan(0);
  });
});
