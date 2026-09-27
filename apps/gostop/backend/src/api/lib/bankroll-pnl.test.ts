/**
 * Pure-function tests for bankroll-pnl staleness classification.
 *
 * The DB-bound `bankrollPnl()` is verified end to end on the box against the
 * transparency endpoint's response shape. Here we lock the only logic feasible
 * to unit test without Postgres and Sui RPC: the data_quality threshold table.
 */

import { describe, expect, it } from 'vitest';
import { classifyDataQuality } from './bankroll-pnl.js';

describe('classifyDataQuality', () => {
  it("returns 'fresh' while the chain agreement is recent", () => {
    expect(classifyDataQuality(0, true)).toBe('fresh');
    expect(classifyDataQuality(59 * 60_000, true)).toBe('fresh');
  });

  it("returns 'fresh' before any checkpoint exists", () => {
    // First tick after a fresh genesis. Nothing is known to be wrong yet, and
    // reporting the whole history as a gap would be the old running total's
    // mistake all over again.
    expect(classifyDataQuality(null, true)).toBe('fresh');
  });

  it("returns 'lagging' once the agreement is over an hour old", () => {
    // drift-keeper advances the checkpoint every 5 minutes when chain and
    // ledger agree, so an hour without one means twelve ticks failed to agree
    // or to run.
    expect(classifyDataQuality(61 * 60_000, true)).toBe('lagging');
    expect(classifyDataQuality(5 * 3_600_000, true)).toBe('lagging');
  });

  it("returns 'unreliable' once the agreement is over six hours old", () => {
    expect(classifyDataQuality(6 * 3_600_000 + 1, true)).toBe('unreliable');
    expect(classifyDataQuality(7 * 86_400_000, true)).toBe('unreliable');
  });

  it('degrades on a standing divergence, because the checkpoint stops advancing', () => {
    // The checkpoint only moves on agreement, so a real gap ages it. That is
    // the intended coupling: a ledger known to disagree with chain must not
    // publish confidently.
    expect(classifyDataQuality(CHECKPOINT_STALE_AFTER_DIVERGENCE_MS, true)).toBe('unreliable');
  });

  it("returns 'unreliable' whenever the chain read fails, whatever the age", () => {
    // share_price_current depends on a successful sui_getObject. Without it the
    // result is incomplete by definition and the UI must hide the numeric pps.
    expect(classifyDataQuality(0, false)).toBe('unreliable');
    expect(classifyDataQuality(null, false)).toBe('unreliable');
  });
});

/** Six hours plus a tick: what a divergence unresolved past one cooldown looks like. */
const CHECKPOINT_STALE_AFTER_DIVERGENCE_MS = 6 * 3_600_000 + 5 * 60_000;
