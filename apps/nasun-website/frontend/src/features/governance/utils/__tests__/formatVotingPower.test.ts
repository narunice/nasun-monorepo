// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatVotingPower } from '../formatVotingPower';
import type { VotingPowerData } from '../../hooks/useVotingPower';

function power(totalVotingPower: unknown): VotingPowerData {
  return {
    totalVotingPower,
    rank: null,
    breakdown: { base: 0, xLinked: 0, telegram: 0, rankBonus: 0 },
  } as VotingPowerData;
}

describe('formatVotingPower', () => {
  it('shows a loading marker while the request is in flight', () => {
    expect(formatVotingPower(null, true)).toBe('...');
  });

  it('reports a failed fetch as unavailable, not as a made-up figure', () => {
    // The old code did `totalVotingPower || 10`, so a failed fetch showed
    // people 10 votes they may not have.
    expect(formatVotingPower(null, false)).toBe('Unavailable');
  });

  it('keeps a legitimate zero as zero', () => {
    // `|| 10` also turned a real 0 into 10, since 0 is falsy.
    expect(formatVotingPower(power(0), false)).toBe('0');
  });

  it('formats a normal value with thousands separators', () => {
    expect(formatVotingPower(power(1234), false)).toBe('1,234');
    expect(formatVotingPower(power(7), false)).toBe('7');
  });

  it('does not throw when a 200 body is missing the field', () => {
    expect(formatVotingPower(power(undefined), false)).toBe('Unavailable');
    expect(formatVotingPower(power(null), false)).toBe('Unavailable');
    expect(formatVotingPower(power('12'), false)).toBe('Unavailable');
    expect(formatVotingPower(power(Number.NaN), false)).toBe('Unavailable');
  });
});
