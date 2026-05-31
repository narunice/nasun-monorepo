import { describe, it, expect } from 'vitest';
import {
  TIER_2_THRESHOLD,
  TIER_3_THRESHOLD,
  nsiToTier,
  applyGpFloor,
  nextThreshold,
  monotoneUpDisplayTier,
} from '../index.js';

describe('nsiToTier — boundary conditions', () => {
  it('maps below T2 threshold to tier 1', () => {
    expect(nsiToTier(0)).toBe(1);
    expect(nsiToTier(249)).toBe(1);
    expect(nsiToTier(TIER_2_THRESHOLD - 1)).toBe(1);
  });

  it('maps T2 inclusive lower bound to tier 2', () => {
    expect(nsiToTier(TIER_2_THRESHOLD)).toBe(2);
    expect(nsiToTier(250)).toBe(2);
  });

  it('maps T2 inclusive upper bound (just under T3) to tier 2', () => {
    expect(nsiToTier(499)).toBe(2);
    expect(nsiToTier(TIER_3_THRESHOLD - 1)).toBe(2);
  });

  it('maps T3 inclusive lower bound to tier 3', () => {
    // This is the drift-blocker assertion: nsiToTier(500) === 3, NOT 2.
    // If TIER_3_THRESHOLD ever reverts to 600 without updating the test,
    // CI catches it here.
    expect(nsiToTier(TIER_3_THRESHOLD)).toBe(3);
    expect(nsiToTier(500)).toBe(3);
    expect(nsiToTier(999)).toBe(3);
  });

  it('defends against malformed input', () => {
    // Negative, NaN, and Infinity are all treated as bad data and default to
    // tier 1 — better to under-promote on garbage input than silently mint a
    // tier 3 from an upstream bug.
    expect(nsiToTier(-1)).toBe(1);
    expect(nsiToTier(Number.NaN)).toBe(1);
    expect(nsiToTier(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('applyGpFloor', () => {
  it('non-GP holders see their raw NSI tier', () => {
    expect(applyGpFloor(1, false)).toBe(1);
    expect(applyGpFloor(2, false)).toBe(2);
    expect(applyGpFloor(3, false)).toBe(3);
  });

  it('GP holders are floored at tier 2', () => {
    expect(applyGpFloor(1, true)).toBe(2);
  });

  it('GP holders keep higher tiers when earned', () => {
    expect(applyGpFloor(2, true)).toBe(2);
    expect(applyGpFloor(3, true)).toBe(3);
  });
});

describe('nextThreshold', () => {
  it('tier 1 advertises T2 cutoff', () => {
    expect(nextThreshold(1)).toBe(TIER_2_THRESHOLD);
  });

  it('tier 2 advertises T3 cutoff', () => {
    expect(nextThreshold(2)).toBe(TIER_3_THRESHOLD);
  });

  it('tier 3 has no next', () => {
    expect(nextThreshold(3)).toBeNull();
  });
});

describe('monotoneUpDisplayTier', () => {
  const now = new Date('2026-05-25T00:00:00Z');
  const insideWindow = new Date('2026-05-29T00:00:00Z');
  const expiredWindow = new Date('2026-05-22T00:00:00Z');

  it('returns current tier when no window is set', () => {
    expect(monotoneUpDisplayTier(1, 2, null, now)).toBe(1);
    expect(monotoneUpDisplayTier(2, 3, null, now)).toBe(2);
  });

  it('returns current tier when window has expired', () => {
    expect(monotoneUpDisplayTier(1, 3, expiredWindow, now)).toBe(1);
  });

  it('floors at max_seen during active window', () => {
    expect(monotoneUpDisplayTier(1, 3, insideWindow, now)).toBe(3);
    expect(monotoneUpDisplayTier(2, 3, insideWindow, now)).toBe(3);
  });

  it('returns current tier when it exceeds max_seen during active window', () => {
    expect(monotoneUpDisplayTier(3, 2, insideWindow, now)).toBe(3);
  });

  it('treats exact expiry instant as expired', () => {
    expect(monotoneUpDisplayTier(1, 3, now, now)).toBe(1);
  });
});
