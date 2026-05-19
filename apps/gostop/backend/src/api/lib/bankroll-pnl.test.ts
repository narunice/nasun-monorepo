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
  it("returns 'fresh' when chain is reachable AND unreconciled rows are few", () => {
    expect(classifyDataQuality(0, 0, true)).toBe('fresh');
    expect(classifyDataQuality(60_000, 50, true)).toBe('fresh');
    // PnL streams are sparse — cursor lag is NOT a freshness input even at
    // very large values. Live indexer with sparse streams legitimately sees
    // last_ts_ms of "1 week ago" for TreasuryDeposited etc.
    expect(classifyDataQuality(7 * 86_400_000, 0, true)).toBe('fresh');
  });

  it("returns 'lagging' when unreconciled rows cross 100", () => {
    expect(classifyDataQuality(0, 101, true)).toBe('lagging');
    expect(classifyDataQuality(0, 999, true)).toBe('lagging');
  });

  it("returns 'unreliable' when unreconciled rows cross 1000", () => {
    expect(classifyDataQuality(0, 1001, true)).toBe('unreliable');
    expect(classifyDataQuality(0, 5000, true)).toBe('unreliable');
  });

  it("returns 'unreliable' whenever the chain read fails, regardless of other inputs", () => {
    // share_price_current depends on a successful sui_getObject. Without it
    // the result is incomplete by definition; UI must hide the numeric pps.
    expect(classifyDataQuality(0, 0, false)).toBe('unreliable');
    expect(classifyDataQuality(60_000, 50, false)).toBe('unreliable');
  });
});
