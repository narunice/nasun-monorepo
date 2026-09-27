/**
 * Constants lock for drift-keeper.
 *
 * The full `runDriftKeeperOnce` path is DB + Sui RPC + Telegram HTTP-bound;
 * verification is end-to-end on staging (force unreconciled rows past the
 * stall threshold and confirm telegram delivery + cooldown). Here we just
 * keep the §10.D contract from drifting silently: interval, cooldown, and
 * the two numeric thresholds.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  _DRIFT_KEEPER_CONSTANTS,
  _confirmDivergence,
  _clearPendingDivergence,
} from './drift-keeper.js';
import { applySharesDelta } from './bankroll-reconciler.js';

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

describe('chain-divergence share-affecting scope', () => {
  // The divergence gate counts backlog only in these types. If the constant
  // and applySharesDelta ever disagree, the gate either mutes itself on
  // share-neutral volume (the 2026-09-13 failure, where high-volume
  // open_exposure_snapshot rows kept the backlog non-empty forever and the
  // alert never fired against a 2.74x gap) or pages through legitimate
  // reconciler lag. Derive the truth from the reducer rather than restating
  // the list, so the two cannot drift.
  const ALL_EVENT_TYPES = [
    'liquidity_provided',
    'liquidity_redeemed',
    'shares_seeded',
    'treasury_deposited',
    'bet_refunded',
    'withdraw_requested',
    'cap_updated',
    'open_exposure_snapshot',
  ];

  it('lists exactly the event types that move the share total', () => {
    const mutating = ALL_EVENT_TYPES.filter(
      (t) => applySharesDelta(1_000n, t, 7n) !== 1_000n,
    );
    expect([..._DRIFT_KEEPER_CONSTANTS.SHARE_AFFECTING_EVENT_TYPES].sort()).toEqual(
      mutating.sort(),
    );
  });

  it('excludes open_exposure_snapshot, the highest-volume backlog contributor', () => {
    // One row per collect_bet / pay_winner / refund_bet. Counting it is what
    // made an exactly-empty-backlog gate unreachable on an active pool.
    expect(_DRIFT_KEEPER_CONSTANTS.SHARE_AFFECTING_EVENT_TYPES).not.toContain(
      'open_exposure_snapshot',
    );
    expect(applySharesDelta(1_000n, 'open_exposure_snapshot', 7n)).toBe(1_000n);
  });
});

describe('chain-divergence confirmation', () => {
  // The lagging side is the DB: an event applied on chain may not be inserted
  // into bankroll_event yet, which the backlog gate cannot see because a row
  // that does not exist counts for nothing. An immediate re-read lands
  // milliseconds later and returns the same tail, so confirmation is by time —
  // the same gap has to survive one interval.
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

  it('re-arms instead of paging when the DB has caught up', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    // Indexer inserted and the reconciler filled the tail: no longer a gap, so
    // runRiskKeeperOnce clears the latch rather than calling in again.
    _clearPendingDivergence();
    expect(_confirmDivergence(250n, 250n)).toBe(false);
  });

  it('re-arms when the chain moved between ticks', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    // An active pool: this is a different observation, not a confirmation.
    expect(_confirmDivergence(300n, 100n)).toBe(false);
    expect(_confirmDivergence(300n, 100n)).toBe(true);
  });

  it('re-arms when the DB moved between ticks', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    expect(_confirmDivergence(250n, 180n)).toBe(false);
  });

  it('clearing the latch means the next gap has to arm again', () => {
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    _clearPendingDivergence();
    expect(_confirmDivergence(250n, 100n)).toBe(false);
    expect(_confirmDivergence(250n, 100n)).toBe(true);
  });

  it('confirmation needs a full interval, which exceeds any indexer poll', () => {
    // Documents the property the two-tick rule buys: the window the DB gets to
    // catch up is the keeper interval, not the microseconds a re-read allowed.
    expect(_DRIFT_KEEPER_CONSTANTS.DRIFT_KEEPER_INTERVAL_MS).toBe(5 * 60_000);
  });
});
