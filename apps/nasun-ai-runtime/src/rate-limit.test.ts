/**
 * Tests for the sliding-window RateLimiter used by wake-router to throttle
 * `user_message` wakes shared between chat + analyst presets.
 *
 * Time is injected as `now` so we don't rely on real clocks or fake timers.
 */

import { describe, it, expect } from 'vitest';

import { RateLimiter, DEFAULT_RATE_LIMITS } from './rate-limit.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('RateLimiter — per-sid minute window', () => {
  it('allows up to perSidPerMinute hits inside a minute', () => {
    const rl = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < DEFAULT_RATE_LIMITS.perSidPerMinute; i++) {
      expect(rl.checkAndConsume('sid-a', t0 + i).allowed).toBe(true);
    }
    const d = rl.checkAndConsume('sid-a', t0 + 100);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe('per_sid');
    expect(d.window).toBe('minute');
    expect(d.retryAfterSec).toBeGreaterThan(0);
  });

  it('releases capacity after the minute window slides past', () => {
    const rl = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < DEFAULT_RATE_LIMITS.perSidPerMinute; i++) {
      rl.checkAndConsume('sid-a', t0 + i);
    }
    // 61s later the first hit has expired -> one slot free.
    const later = t0 + MIN + 1_000;
    expect(rl.checkAndConsume('sid-a', later).allowed).toBe(true);
  });

  it('does not consume a slot when denied', () => {
    const rl = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < DEFAULT_RATE_LIMITS.perSidPerMinute; i++) {
      rl.checkAndConsume('sid-a', t0 + i);
    }
    // Denied hit at t0+100 must not push the oldest hit further out.
    const denied = rl.checkAndConsume('sid-a', t0 + 100);
    expect(denied.allowed).toBe(false);
    // Window should still slide based on the original t0, not t0+100.
    const later = t0 + MIN + 1;
    expect(rl.checkAndConsume('sid-a', later).allowed).toBe(true);
  });
});

describe('RateLimiter — per-sid isolation', () => {
  it('one sid hitting its cap does not block another sid', () => {
    const rl = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < DEFAULT_RATE_LIMITS.perSidPerMinute; i++) {
      rl.checkAndConsume('sid-a', t0 + i);
    }
    expect(rl.checkAndConsume('sid-a', t0 + 100).allowed).toBe(false);
    expect(rl.checkAndConsume('sid-b', t0 + 100).allowed).toBe(true);
  });
});

describe('RateLimiter — global window', () => {
  it('global minute cap denies even when per-sid is under limit', () => {
    const rl = new RateLimiter({
      ...DEFAULT_RATE_LIMITS,
      perSidPerMinute: 1000,
      globalPerMinute: 3,
    });
    const t0 = 1_000_000;
    expect(rl.checkAndConsume('a', t0 + 1).allowed).toBe(true);
    expect(rl.checkAndConsume('b', t0 + 2).allowed).toBe(true);
    expect(rl.checkAndConsume('c', t0 + 3).allowed).toBe(true);
    const d = rl.checkAndConsume('d', t0 + 4);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe('global');
    expect(d.window).toBe('minute');
  });
});

describe('RateLimiter — hour and day windows', () => {
  it('per-sid hour cap trips after minute caps roll over', () => {
    const rl = new RateLimiter({
      ...DEFAULT_RATE_LIMITS,
      perSidPerMinute: 5,
      perSidPerHour: 7,
    });
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) rl.checkAndConsume('sid', t0 + i);
    for (let i = 0; i < 2; i++) rl.checkAndConsume('sid', t0 + MIN + i);
    const d = rl.checkAndConsume('sid', t0 + MIN + 2);
    expect(d.allowed).toBe(false);
    expect(d.window).toBe('hour');
  });

  it('day cap applies independently of hour cap', () => {
    const rl = new RateLimiter({
      ...DEFAULT_RATE_LIMITS,
      perSidPerMinute: 1000,
      perSidPerHour: 1000,
      perSidPerDay: 2,
    });
    const t0 = 1_000_000;
    expect(rl.checkAndConsume('sid', t0).allowed).toBe(true);
    expect(rl.checkAndConsume('sid', t0 + HOUR + 1).allowed).toBe(true);
    const d = rl.checkAndConsume('sid', t0 + 2 * HOUR + 1);
    expect(d.allowed).toBe(false);
    expect(d.window).toBe('day');
  });

  it('day cap releases after 24h', () => {
    const rl = new RateLimiter({
      ...DEFAULT_RATE_LIMITS,
      perSidPerDay: 1,
    });
    const t0 = 1_000_000;
    rl.checkAndConsume('sid', t0);
    expect(rl.checkAndConsume('sid', t0 + DAY + 1).allowed).toBe(true);
  });
});

describe('RateLimiter — check/consume split', () => {
  it('check does not mutate state', () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMITS, perSidPerMinute: 1 });
    const t0 = 1_000_000;
    rl.check('sid', t0);
    rl.check('sid', t0);
    expect(rl.checkAndConsume('sid', t0).allowed).toBe(true);
  });

  it('consume increments without check', () => {
    const rl = new RateLimiter({ ...DEFAULT_RATE_LIMITS, perSidPerMinute: 1 });
    const t0 = 1_000_000;
    rl.consume('sid', t0);
    expect(rl.check('sid', t0).allowed).toBe(false);
  });
});
