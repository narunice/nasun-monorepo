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
import {
  _DRIFT_KEEPER_CONSTANTS,
  _confirmDivergence,
  type DbDriftStats,
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
  // The DB and chain sides are read at different instants, so a share event
  // already on chain but not yet inserted looks identical to real divergence.
  // The DB is the lagging side, so confirmation re-reads the DB — re-reading
  // the chain would just return the same new value and confirm its own false
  // positive.
  const db = (over: Partial<DbDriftStats> = {}): DbDriftStats => ({
    unreconciledRows: 0,
    unreconciledShareRows: 0,
    oldestUnreconciledAgeMs: 0,
    latestReconciledTotalShares: 100n,
    ...over,
  });

  it('does not confirm once the DB tail has caught up to the chain', async () => {
    expect(
      await _confirmDivergence(250n, async () => db({ latestReconciledTotalShares: 250n })),
    ).toBe(false);
  });

  it('confirms when the tail still disagrees on the second look', async () => {
    expect(
      await _confirmDivergence(250n, async () => db({ latestReconciledTotalShares: 100n })),
    ).toBe(true);
  });

  it('does not confirm while a share-affecting row is in flight', async () => {
    expect(
      await _confirmDivergence(250n, async () => db({ unreconciledShareRows: 1 })),
    ).toBe(false);
  });

  it('does not confirm when the re-read finds no reconciled tail', async () => {
    expect(
      await _confirmDivergence(250n, async () => db({ latestReconciledTotalShares: null })),
    ).toBe(false);
  });

  it('does not confirm when the re-read throws — defer rather than page blind', async () => {
    expect(
      await _confirmDivergence(250n, async () => {
        throw new Error('db down');
      }),
    ).toBe(false);
  });
});
