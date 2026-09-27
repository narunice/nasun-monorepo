/**
 * Constants lock and two-tick latch tests for drift-keeper.
 *
 * `runDriftKeeperOnce` is DB + Sui RPC + Telegram bound, so the tick itself is
 * verified end to end on the box. Here we pin the cadence contract and the latch
 * that separates indexer lag from a real miss.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  _clearPendingDivergence,
  _confirmDivergence,
  _DRIFT_KEEPER_CONSTANTS,
} from './drift-keeper.js';

describe('drift-keeper constants', () => {
  it('interval is 5 minutes, matching the risk-alert cadence', () => {
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_INTERVAL_MS).toBe(5 * 60_000);
  });

  it('cooldown is 6 hours, because an unresolved gap keeps reporting', () => {
    // The checkpoint never advances over a gap, so a real miss re-fires every
    // cooldown until someone reconciles it, and reconciling needs a reindex
    // rather than half an hour. The retired 30 min value taught the operator to
    // skim the channel, which is how cursor_lag_severe paged 48 times a day
    // about a state nobody could clear.
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_COOLDOWN_MS).toBe(6 * 3_600_000);
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_COOLDOWN_MS).toBeGreaterThan(
      12 * _DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_INTERVAL_MS,
    );
  });
});

describe('chain-divergence confirmation', () => {
  // The lagging side is the ledger: a share event applied on chain may not be
  // indexed yet, so the delta sum is short and the chain looks ahead. What
  // separates that from a miss is that lag resolves, so the next tick's pair
  // differs, while a miss reproduces the same pair because the checkpoint does
  // not advance and the delta never arrives. Confirmation is therefore by time,
  // one full interval, not by an immediate re-read.
  beforeEach(() => {
    _clearPendingDivergence();
  });

  it('does not page on the first sighting, only arms', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
  });

  it('pages when the identical gap is still there on the next tick', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    expect(_confirmDivergence(250n, 100n)).toBe(true);
  });

  it('re-arms instead of paging once the ledger has caught up', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    // Deltas landed, so the tick agrees and clears rather than calling in.
    _clearPendingDivergence();
    expect(_confirmDivergence(250n, 250n)).toBe(false);
  });

  it('re-arms when the chain moved between ticks', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    // An active pool: a different observation, not a confirmation.
    expect(_confirmDivergence(300n, 100n)).toBe(false);
    expect(_confirmDivergence(300n, 100n)).toBe(true);
  });

  it('re-arms when the expected total moved between ticks', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    expect(_confirmDivergence(250n, 180n)).toBe(false);
  });

  it('clearing the latch means the next gap has to arm again', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    _clearPendingDivergence();
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    expect(_confirmDivergence(250n, 100n)).toBe(true);
  });

  it('confirms a negative gap too, where the ledger is ahead of chain', () => {
    // Over-counting is as much a miss as under-counting: a duplicated insert or
    // a chain rollback both land here, and neither is indexer lag.
    expect(_confirmDivergence(100n, 250n)).toBe(false);
    expect(_confirmDivergence(100n, 250n)).toBe(true);
  });
});
