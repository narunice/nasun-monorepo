import { describe, it, expect } from 'vitest';
import { computeWeeklyVolumePoints, POINTS } from '../leaderboard-types.js';

// volumeRaw is NUSDC in 6-decimal raw units, so $1 === 1_000_000n.
const usd = (dollars: number): bigint => BigInt(Math.round(dollars * 1_000_000));

describe('computeWeeklyVolumePoints', () => {
  it('is zero at zero volume', () => {
    expect(computeWeeklyVolumePoints(0n)).toBe(0);
  });

  it('is continuous below $500 (old floored version returned 0 for all of these)', () => {
    // The bug this fixes: every sub-$500 trader used to collapse onto 0 points,
    // producing the largest low-end score ties.
    expect(computeWeeklyVolumePoints(usd(28))).toBe(0.056);
    expect(computeWeeklyVolumePoints(usd(450))).toBe(0.9);
    expect(computeWeeklyVolumePoints(usd(499))).toBe(0.998);
    // Distinct volumes must yield distinct scores (no bucketing).
    expect(computeWeeklyVolumePoints(usd(28)))
      .not.toBe(computeWeeklyVolumePoints(usd(450)));
  });

  it('keeps the linear scale (1pt per $500) at and above $500', () => {
    expect(computeWeeklyVolumePoints(usd(500))).toBe(1);
    expect(computeWeeklyVolumePoints(usd(750))).toBe(1.5);
    expect(computeWeeklyVolumePoints(usd(1_000))).toBe(2);
  });

  it('reaches the linear max at the soft cap', () => {
    const linearMax = (POINTS.VOLUME_LINEAR_SOFT_CAP_USD / 500) * POINTS.PER_500_VOLUME;
    expect(computeWeeklyVolumePoints(usd(POINTS.VOLUME_LINEAR_SOFT_CAP_USD))).toBe(linearMax);
  });

  it('grows logarithmically above the soft cap', () => {
    const linearMax = (POINTS.VOLUME_LINEAR_SOFT_CAP_USD / 500) * POINTS.PER_500_VOLUME;
    // $2M = 2x soft cap -> linearMax + K*log10(2)
    const expected = linearMax + POINTS.VOLUME_LOG_K * Math.log10(2);
    expect(computeWeeklyVolumePoints(usd(2 * POINTS.VOLUME_LINEAR_SOFT_CAP_USD)))
      .toBeCloseTo(Math.round(expected * 1000) / 1000, 3);
  });

  it('never exceeds the weekly volume cap', () => {
    expect(computeWeeklyVolumePoints(usd(200_000_000)))
      .toBe(POINTS.WEEKLY_VOLUME_SCORE_CAP);
  });

  it('returns at most 3 decimal places', () => {
    const v = computeWeeklyVolumePoints(usd(333));
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(Math.round(v * 1000) / 1000);
  });
});
