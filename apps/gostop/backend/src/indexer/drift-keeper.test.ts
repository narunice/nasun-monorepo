/**
 * Constants lock for drift-keeper.
 *
 * The full `runDriftKeeperOnce` path is DB + Sui RPC + Telegram HTTP-bound;
 * verification is end-to-end on staging (force unreconciled rows past the
 * stall threshold and confirm telegram delivery + cooldown). Here we just
 * keep the §10.D contract from drifting silently: interval, cooldown, and
 * the two numeric thresholds.
 */

import { describe, expect, it } from 'vitest';
import { _DRIFT_KEEPER_CONSTANTS } from './drift-keeper.js';

describe('drift-keeper constants (§10.D contract)', () => {
  it('interval is 5 minutes (matches risk-alert cadence)', () => {
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_INTERVAL_MS).toBe(5 * 60_000);
  });

  it('cooldown is 30 minutes — at least 5x the interval', () => {
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_COOLDOWN_MS).toBe(30 * 60_000);
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_COOLDOWN_MS).toBeGreaterThanOrEqual(
      5 * _DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_INTERVAL_MS,
    );
  });

  it('reconciler stall threshold (500) sits between bankroll-pnl lagging (100) and unreliable (1000)', () => {
    // The Risk Dashboard data_quality enum already publicly degrades at 100
    // (lagging) and 1000 (unreliable). Operators should be paged BEFORE the
    // public UI flips to unreliable but AFTER transient bursts have time to
    // self-clear. 500 satisfies both.
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_RECONCILER_STALL_THRESHOLD).toBe(500);
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_RECONCILER_STALL_THRESHOLD).toBeGreaterThan(100);
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_RECONCILER_STALL_THRESHOLD).toBeLessThan(1000);
  });

  it('oldest-row age threshold is 1 hour', () => {
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_OLDEST_ROW_AGE_MS).toBe(60 * 60_000);
  });
});
