/**
 * confirmPersistentMissing — the debounce that stops PM2-drift alert flapping.
 *
 * A "missing" candidate (SQL says desired-running, pm2 lacks the process) only
 * alerts after it has been observed for ALERT_MIN_STREAK consecutive ticks.
 * filterDesiredRunning defensively keeps a candidate whenever the on-chain /
 * SQLite snapshot throws for one tick, so a dead agent whose profile is gone
 * used to flap alert<->clear every tick. Persistence separates a real down
 * agent (missing every tick) from a transient single-tick blip.
 */

import { describe, it, expect } from 'vitest';
import { confirmPersistentMissing } from '../agent-pm2-monitor.js';

const MIN = 2;

describe('confirmPersistentMissing', () => {
  it('does not confirm on the first tick', () => {
    const streak = new Map<string, number>();
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual([]);
  });

  it('confirms once a name persists for minStreak consecutive ticks', () => {
    const streak = new Map<string, number>();
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual([]);
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual(['a']);
    // Still confirmed while it stays missing.
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual(['a']);
  });

  it('never confirms a single-tick blip that clears the next tick', () => {
    const streak = new Map<string, number>();
    // Flapping: present, gone, present, gone ...
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual([]);
    expect(confirmPersistentMissing([], streak, MIN)).toEqual([]);
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual([]);
    expect(confirmPersistentMissing([], streak, MIN)).toEqual([]);
    // Streak was reset each time it disappeared, so it never reaches MIN.
    expect(streak.size).toBe(0);
  });

  it('resets a name\'s streak to zero after it disappears for a tick', () => {
    const streak = new Map<string, number>();
    confirmPersistentMissing(['a'], streak, MIN); // streak a=1
    confirmPersistentMissing([], streak, MIN); // a dropped
    // Back again but counting restarts: not confirmed on its first tick again.
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual([]);
    expect(confirmPersistentMissing(['a'], streak, MIN)).toEqual(['a']);
  });

  it('tracks names independently and returns confirmed set sorted', () => {
    const streak = new Map<string, number>();
    confirmPersistentMissing(['b', 'a'], streak, MIN); // both at 1
    // 'a' persists to confirmation; 'c' is brand new this tick.
    expect(confirmPersistentMissing(['a', 'c'], streak, MIN)).toEqual(['a']);
    // 'b' was dropped (absent last tick), so it is gone from the streak map.
    expect(streak.has('b')).toBe(false);
  });

  it('honors a minStreak of 1 (confirm immediately)', () => {
    const streak = new Map<string, number>();
    expect(confirmPersistentMissing(['a'], streak, 1)).toEqual(['a']);
  });
});
