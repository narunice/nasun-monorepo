/**
 * Pure-function tests for risk-metrics helpers.
 *
 * As with bankroll-pnl.test.ts, the DB-bound `riskMetrics()` is exercised via
 * end-to-end verification on node-3 after PR-D deploy (transparency endpoint
 * `risk` block response shape + sanity-check vs `/transparency` raw). Here we
 * cover the only logic feasible to unit-test without Postgres + Sui RPC: the
 * quality-aggregation ladder and matview-age classification.
 */

import { describe, expect, it } from 'vitest';
import {
  worstQuality,
  matviewQuality,
  maskAddress,
  walletHash,
  classifyExposureStatus,
  exposureExceedsBalance,
  _RISK_METRICS_CONSTANTS,
} from './risk-metrics.js';

describe('worstQuality', () => {
  it('returns fresh when both inputs are fresh', () => {
    expect(worstQuality('fresh', 'fresh')).toBe('fresh');
  });

  it('propagates the worse of two enums', () => {
    expect(worstQuality('fresh', 'lagging')).toBe('lagging');
    expect(worstQuality('lagging', 'fresh')).toBe('lagging');
    expect(worstQuality('fresh', 'unreliable')).toBe('unreliable');
    expect(worstQuality('lagging', 'unreliable')).toBe('unreliable');
    expect(worstQuality('unreliable', 'fresh')).toBe('unreliable');
  });

  it('is associative across more than two inputs (chained)', () => {
    expect(
      worstQuality(worstQuality('fresh', 'lagging'), 'unreliable'),
    ).toBe('unreliable');
    expect(
      worstQuality(worstQuality('fresh', 'fresh'), 'lagging'),
    ).toBe('lagging');
  });
});

describe('matviewQuality', () => {
  it("returns 'fresh' inside the 30-minute budget", () => {
    expect(matviewQuality(0)).toBe('fresh');
    expect(matviewQuality(29 * 60_000)).toBe('fresh');
    expect(matviewQuality(30 * 60_000)).toBe('fresh');
  });

  it("returns 'lagging' between 30 min and 6 h", () => {
    expect(matviewQuality(31 * 60_000)).toBe('lagging');
    expect(matviewQuality(60 * 60_000)).toBe('lagging');
    expect(matviewQuality(6 * 3_600_000)).toBe('lagging');
  });

  it("returns 'unreliable' beyond 6 h", () => {
    expect(matviewQuality(6 * 3_600_000 + 1)).toBe('unreliable');
    expect(matviewQuality(24 * 3_600_000)).toBe('unreliable');
  });

  it('handles a freshly-empty matview (age=now) as unreliable', () => {
    // When the matview has no rows, the SQL clamps age to now()-now()=0 (see
    // matviewStats COALESCE branch) — caller passes 0, which is fresh. The
    // unreliable case here represents indexer stalled for > 6h, NOT empty
    // matview at boot. Documented to avoid future regression interpretation.
    expect(matviewQuality(24 * 60 * 60_000)).toBe('unreliable');
  });
});

describe('maskAddress (N7 compliance)', () => {
  it('renders 6-prefix + 4-suffix with an ellipsis', () => {
    expect(maskAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
  });

  it('falls back gracefully on too-short inputs (defensive, should not happen for Sui)', () => {
    expect(maskAddress('0xabc')).toBe('0x…');
    expect(maskAddress('')).toBe('0x…');
  });

  it('handles non-string inputs without throwing', () => {
    // The Postgres reader sometimes returns NUMERIC fields as strings but
    // text fields can be null on bad joins. Mask must degrade, not crash.
    expect(maskAddress(null as unknown as string)).toBe('0x…');
    expect(maskAddress(undefined as unknown as string)).toBe('0x…');
  });
});

describe('walletHash (frontend self-match key)', () => {
  it('is deterministic and 16 hex chars', () => {
    const h = walletHash('0xabc');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(walletHash('0xabc')).toBe(h);
  });

  it('is case-insensitive on the input wallet (Sui addresses are typically lowercase but normalize)', () => {
    expect(walletHash('0xABC')).toBe(walletHash('0xabc'));
  });

  it('distinguishes different wallets', () => {
    expect(walletHash('0xaaa')).not.toBe(walletHash('0xbbb'));
  });
});

describe('classifyExposureStatus', () => {
  it('withholds every live reading while the reservation ledger does not pair', () => {
    // The defect is a property of the deployed packages, not of the value, so
    // the status does not track the number. Withholding only above the balance
    // published a ~91x overstatement whenever the overstatement happened to
    // stay under it, and flipped the public page between a figure and a
    // placeholder as the two drifted past each other.
    expect(classifyExposureStatus('live', 100n, 1_000n)).toBe('degraded');
    expect(classifyExposureStatus('live', 1_000n, 1_000n)).toBe('degraded');
    expect(classifyExposureStatus('live', 1_001n, 1_000n)).toBe('degraded');
    expect(classifyExposureStatus('live', 0n, 0n)).toBe('degraded');
    expect(classifyExposureStatus('live', 1_000n, null)).toBe('degraded');
  });

  it('withholds the production reading that is well below its balance', () => {
    // 2026-09-27: exposure 13,720,500 against a 14,181,332 balance, so the
    // old exceeds-the-balance gate called this 'live' and published it. True
    // in-flight liability at that moment was at most 150,000.
    expect(
      classifyExposureStatus('live', 13_720_500_000_000n, 14_181_332_551_413n),
    ).toBe('degraded');
  });

  it("never overrides 'dormant' — one reason for an unusable value is enough", () => {
    expect(classifyExposureStatus('dormant', 1_001n, 1_000n)).toBe('dormant');
    expect(classifyExposureStatus('dormant', 0n, 1_000n)).toBe('dormant');
  });

  it('keeps the pairing flag false so the gate cannot be flipped by accident', () => {
    // Flipping this is a claim about redeployed contracts plus a reset
    // open_exposure, which needs a bankroll_pool upgrade. Locking it here
    // makes that an explicit edit rather than a silent one.
    expect(_RISK_METRICS_CONSTANTS.RESERVATION_LEDGER_PAIRS_EXACTLY).toBe(false);
  });
});

describe('exposureExceedsBalance', () => {
  // Gated out of classifyExposureStatus by the pairing flag today, so it is
  // tested directly. It becomes the live check the moment that flag flips.
  it('is false below and at the balance', () => {
    expect(exposureExceedsBalance(100n, 1_000n)).toBe(false);
    // Equality is full utilization, not an excess: consistent with a pool that
    // has reserved every unit it holds.
    expect(exposureExceedsBalance(1_000n, 1_000n)).toBe(false);
  });

  it('is true one unit above the balance', () => {
    expect(exposureExceedsBalance(1_001n, 1_000n)).toBe(true);
    // 2026-09-13 production reading that first surfaced the condition.
    expect(exposureExceedsBalance(14_489_000_000_000n, 13_244_136_481_922n)).toBe(true);
  });

  it('declines an unreadable balance rather than calling it an excess', () => {
    // A failed chain read arrives as null and already shows up as
    // data_quality='unreliable'; it must not masquerade as an excess.
    expect(exposureExceedsBalance(1_000n, null)).toBe(false);
    expect(exposureExceedsBalance(0n, null)).toBe(false);
  });

  it('treats a drained pool carrying any reservation as an excess', () => {
    expect(exposureExceedsBalance(1n, 0n)).toBe(true);
    expect(exposureExceedsBalance(1_000n, 0n)).toBe(true);
  });

  it('leaves a genuinely empty pool alone when nothing is reserved against it', () => {
    expect(exposureExceedsBalance(0n, 0n)).toBe(false);
  });
});
