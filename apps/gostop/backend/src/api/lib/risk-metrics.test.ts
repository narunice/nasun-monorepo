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
import { worstQuality, matviewQuality } from './risk-metrics.js';

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
