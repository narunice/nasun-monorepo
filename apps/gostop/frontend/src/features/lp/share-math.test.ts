/**
 * Golden-master tests for LP preview math.
 *
 * Pre-tx PREVIEW only — these formulas are intentionally simpler than
 * Move's compute_shares_to_mint / redeem_liquidity. Do NOT add the +1
 * virtual offset here; that lives in the backend module
 * (bankroll-pool-math.computeRedeemQuoteRaw) and mirrors chain authority.
 */

import { describe, it, expect } from 'vitest';
import {
  SHARE_PRICE_SCALE,
  previewSharesForDeposit,
  previewValueForShares,
} from './share-math';

describe('SHARE_PRICE_SCALE', () => {
  it('matches backend SHARE_PRICE_SCALE (1e9)', () => {
    // Build-time lock: if Move or backend changes the scale, this fails and
    // forces a coordinated update on both TS sides.
    expect(SHARE_PRICE_SCALE).toBe(1_000_000_000n);
  });
});

describe('previewSharesForDeposit', () => {
  it('returns 0n when pps is zero (pre-seed)', () => {
    expect(previewSharesForDeposit(1_000n, 0n)).toBe(0n);
  });

  it('returns 0n when pps is negative (defensive)', () => {
    expect(previewSharesForDeposit(1_000n, -1n)).toBe(0n);
  });

  it('returns amount unchanged at 1.0 pps', () => {
    // pps == SCALE → shares == amount * SCALE / SCALE == amount
    expect(previewSharesForDeposit(1_000_000n, SHARE_PRICE_SCALE)).toBe(1_000_000n);
  });

  it('halves shares when pps doubles', () => {
    // pps = 2.0 → shares = amount / 2
    expect(previewSharesForDeposit(1_000_000n, 2n * SHARE_PRICE_SCALE)).toBe(500_000n);
  });

  it('integer-truncates on uneven division', () => {
    // pps = 3.0 → shares = 1000 / 3 = 333 (floor)
    expect(previewSharesForDeposit(1_000n, 3n * SHARE_PRICE_SCALE)).toBe(333n);
  });
});

describe('previewValueForShares', () => {
  it('returns 0n when pps is zero', () => {
    expect(previewValueForShares(1_000n, 0n)).toBe(0n);
  });

  it('returns 0n when pps is negative (defensive)', () => {
    expect(previewValueForShares(1_000n, -1n)).toBe(0n);
  });

  it('returns shares unchanged at 1.0 pps', () => {
    expect(previewValueForShares(1_000n, SHARE_PRICE_SCALE)).toBe(1_000n);
  });

  it('doubles value when pps doubles', () => {
    expect(previewValueForShares(1_000n, 2n * SHARE_PRICE_SCALE)).toBe(2_000n);
  });

  it('halves value when pps halves (truncation)', () => {
    // pps = 0.5 → value = 1000 * 0.5e9 / 1e9 = 500
    expect(previewValueForShares(1_000n, SHARE_PRICE_SCALE / 2n)).toBe(500n);
  });
});

describe('round-trip', () => {
  it('deposit→value at constant pps is approximately identity (small truncation)', () => {
    const amount = 10_000_000n;
    const pps = 1_500_000_000n; // 1.5 pps
    const shares = previewSharesForDeposit(amount, pps);
    const value = previewValueForShares(shares, pps);
    // Truncation in shares×pps/SCALE; difference ≤ pps/SCALE (1.5n)
    expect(value).toBeGreaterThanOrEqual(amount - 2n);
    expect(value).toBeLessThanOrEqual(amount);
  });
});
