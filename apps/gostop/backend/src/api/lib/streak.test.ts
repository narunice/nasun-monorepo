import { describe, expect, it } from 'vitest';
import { reduceStreak, type StreakRoundInput } from './streak.js';

function row(payout: bigint, bet: bigint, ts: number): StreakRoundInput {
  return { payout, bet_amount: bet, timestamp_ms: ts };
}

describe('reduceStreak', () => {
  it('returns null result for empty input', () => {
    expect(reduceStreak([])).toEqual({ kind: null, length: 0, started_ts_ms: null });
  });

  it('returns null when the most-recent row is a push', () => {
    // Head push terminates regardless of subsequent rows; we never label a
    // streak that didn't actually start with a definite win or loss.
    const rows = [row(100n, 100n, 3000), row(200n, 100n, 2000), row(300n, 100n, 1000)];
    expect(reduceStreak(rows)).toEqual({ kind: null, length: 0, started_ts_ms: null });
  });

  it('counts a single win', () => {
    expect(reduceStreak([row(200n, 100n, 1000)])).toEqual({
      kind: 'win',
      length: 1,
      started_ts_ms: 1000,
    });
  });

  it('counts a single loss', () => {
    expect(reduceStreak([row(50n, 100n, 1000)])).toEqual({
      kind: 'loss',
      length: 1,
      started_ts_ms: 1000,
    });
  });

  it('extends a win streak until the first non-win row, oldest ts is started_ts_ms', () => {
    // Rows are DESC by ts; the streak runs from the head down until broken.
    const rows = [
      row(200n, 100n, 5000),
      row(150n, 100n, 4000),
      row(110n, 100n, 3000),
      row(50n, 100n, 2000), // loss breaks
      row(300n, 100n, 1000),
    ];
    expect(reduceStreak(rows)).toEqual({ kind: 'win', length: 3, started_ts_ms: 3000 });
  });

  it('extends a loss streak until the first non-loss row', () => {
    const rows = [
      row(50n, 100n, 5000),
      row(60n, 100n, 4000),
      row(200n, 100n, 3000), // win breaks
    ];
    expect(reduceStreak(rows)).toEqual({ kind: 'loss', length: 2, started_ts_ms: 4000 });
  });

  it('treats a push as a break even when subsequent rows match the head kind', () => {
    // win, push, win → length 1; the intervening push does not let the streak
    // jump over and re-extend.
    const rows = [
      row(200n, 100n, 5000), // win
      row(100n, 100n, 4000), // push
      row(300n, 100n, 3000), // win, not counted
    ];
    expect(reduceStreak(rows)).toEqual({ kind: 'win', length: 1, started_ts_ms: 5000 });
  });

  it('counts every row when the entire lookback window is one kind', () => {
    const rows = [
      row(200n, 100n, 4000),
      row(300n, 100n, 3000),
      row(150n, 100n, 2000),
      row(110n, 100n, 1000),
    ];
    expect(reduceStreak(rows)).toEqual({ kind: 'win', length: 4, started_ts_ms: 1000 });
  });
});
