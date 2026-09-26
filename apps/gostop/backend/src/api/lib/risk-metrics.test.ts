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
  // Fresh enough for the excess to be attributable rather than a sampling
  // artifact. Withholding does not depend on this; only the claim does.
  const FRESH = 60_000;
  const STALE = _RISK_METRICS_CONSTANTS.EXPOSURE_COMMENSURATE_MAX_AGE_MS + 1;

  it('leaves a normal live reading alone', () => {
    expect(classifyExposureStatus('live', 100n, 1_000n, FRESH).status).toBe('live');
  });

  it('treats exposure exactly equal to the balance as still live', () => {
    // Equality is full utilization, not excess: the ledger is consistent with
    // a pool that has reserved every last unit it holds.
    expect(classifyExposureStatus('live', 1_000n, 1_000n, FRESH).status).toBe('live');
  });

  it("downgrades to 'degraded' the moment exposure exceeds the balance", () => {
    expect(classifyExposureStatus('live', 1_001n, 1_000n, FRESH).status).toBe('degraded');
    // Production reading on 2026-09-13 that motivated this gate.
    expect(
      classifyExposureStatus('live', 14_489_000_000_000n, 13_244_136_481_922n, FRESH).status,
    ).toBe('degraded');
  });

  it('withholds regardless of snapshot age — staleness changes the cause, not the usability', () => {
    // Gating the withholding on freshness would republish the broken value as
    // 'live' for 55 of every 60 minutes.
    expect(classifyExposureStatus('live', 1_001n, 1_000n, STALE).status).toBe('degraded');
    expect(classifyExposureStatus('live', 1_001n, 1_000n, null).status).toBe('degraded');
  });

  it('reports commensurability separately from the status', () => {
    expect(classifyExposureStatus('live', 1_001n, 1_000n, FRESH).commensurate).toBe(true);
    expect(classifyExposureStatus('live', 1_001n, 1_000n, STALE).commensurate).toBe(false);
    expect(classifyExposureStatus('live', 1_001n, 1_000n, null).commensurate).toBe(false);
  });

  it('marks the exact freshness boundary as commensurate', () => {
    expect(
      classifyExposureStatus(
        'live',
        1_001n,
        1_000n,
        _RISK_METRICS_CONSTANTS.EXPOSURE_COMMENSURATE_MAX_AGE_MS,
      ).commensurate,
    ).toBe(true);
  });

  it("never overrides 'dormant' — one reason for an unusable value is enough", () => {
    expect(classifyExposureStatus('dormant', 1_001n, 1_000n, FRESH).status).toBe('dormant');
    expect(classifyExposureStatus('dormant', 0n, 1_000n, FRESH).status).toBe('dormant');
  });

  it('declines when the chain balance is unreadable rather than calling it an excess', () => {
    // A failed chain read arrives as null and already shows up as
    // data_quality='unreliable'; it must not masquerade as an excess.
    expect(classifyExposureStatus('live', 1_000n, null, FRESH).status).toBe('live');
  });

  it("calls a drained pool that still carries reservations 'degraded'", () => {
    // Zero is a real reading, not a missing one. Nothing backs the
    // reservations at all.
    expect(classifyExposureStatus('live', 1_000n, 0n, FRESH).status).toBe('degraded');
  });

  it('leaves a genuinely empty pool alone when nothing is reserved against it', () => {
    expect(classifyExposureStatus('live', 0n, 0n, FRESH).status).toBe('live');
  });
});
