/**
 * Pure-function tests for bankroll-pnl staleness classification.
 *
 * The DB-bound `bankrollPnl()` is exercised via end-to-end verification on
 * node-3 after PR-B deploy (transparency endpoint response shape contract).
 * Here we lock the only piece of logic that is feasible to unit-test without
 * spinning up Postgres + Sui RPC: the data_quality threshold table.
 */

import { describe, expect, it } from 'vitest';
import { classifyDataQuality } from './bankroll-pnl.js';

describe('classifyDataQuality', () => {
  it("returns 'fresh' when lag is small AND unreconciled rows are few AND chain is reachable", () => {
    expect(classifyDataQuality(0, 0, true)).toBe('fresh');
    expect(classifyDataQuality(60_000, 50, true)).toBe('fresh');
    // Just under both thresholds.
    expect(classifyDataQuality(5 * 60_000 - 1, 100, true)).toBe('fresh');
  });

  it("returns 'lagging' when cursor lag crosses 5min OR unreconciled crosses 100", () => {
    expect(classifyDataQuality(5 * 60_000 + 1, 0, true)).toBe('lagging');
    expect(classifyDataQuality(0, 101, true)).toBe('lagging');
    // Still in 'lagging' range under the unreliable thresholds.
    expect(classifyDataQuality(29 * 60_000, 999, true)).toBe('lagging');
  });

  it("returns 'unreliable' once cursor lag crosses 30min OR unreconciled crosses 1000", () => {
    expect(classifyDataQuality(30 * 60_000 + 1, 0, true)).toBe('unreliable');
    expect(classifyDataQuality(0, 1001, true)).toBe('unreliable');
    expect(classifyDataQuality(60 * 60_000, 5000, true)).toBe('unreliable');
  });

  it("returns 'unreliable' whenever the chain read fails, regardless of cursor health", () => {
    // share_price_current depends on a successful sui_getObject. Without it
    // the result is incomplete by definition; UI must hide the numeric pps.
    expect(classifyDataQuality(0, 0, false)).toBe('unreliable');
    expect(classifyDataQuality(60_000, 50, false)).toBe('unreliable');
  });
});
