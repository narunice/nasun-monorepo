import { describe, it, expect } from 'vitest';
import {
  parseRawAmount,
  formatRawAmount,
  computeMaxForMode,
  OWNER_NASUN_GAS_RESERVE_MIST,
} from './transferAmount';

// Mirror of `MIN_GAS_RESERVE_MIST` in agentWithdrawTx; computeNasunMaxWithdraw
// returns `agentNasunRaw > reserve ? agentNasunRaw - reserve : 0n`.
const AGENT_MIN_GAS_RESERVE = 50_000_000n;

const NUSDC_DECIMALS = 6;
const NASUN_DECIMALS = 9;
const NBTC_DECIMALS = 8;

describe('parseRawAmount', () => {
  it('parses whole numbers', () => {
    expect(parseRawAmount('10', NUSDC_DECIMALS)).toBe(10_000_000n);
  });

  it('parses fractional with all decimals', () => {
    expect(parseRawAmount('1.5', NUSDC_DECIMALS)).toBe(1_500_000n);
  });

  it('parses fractional with leading whole', () => {
    expect(parseRawAmount('0.001', NUSDC_DECIMALS)).toBe(1_000n);
  });

  it('truncates extra fractional digits beyond the token decimals', () => {
    expect(parseRawAmount('1.0000001', NUSDC_DECIMALS)).toBe(1_000_000n);
  });

  it('returns 0n for empty string', () => {
    expect(parseRawAmount('', NUSDC_DECIMALS)).toBe(0n);
  });

  it('returns 0n for non-numeric input', () => {
    expect(parseRawAmount('abc', NUSDC_DECIMALS)).toBe(0n);
    expect(parseRawAmount('1.2.3', NUSDC_DECIMALS)).toBe(0n);
    expect(parseRawAmount('-1', NUSDC_DECIMALS)).toBe(0n);
  });

  it('returns 0n for bare dot', () => {
    expect(parseRawAmount('.', NUSDC_DECIMALS)).toBe(0n);
  });

  it('trims whitespace', () => {
    expect(parseRawAmount('  2.5  ', NUSDC_DECIMALS)).toBe(2_500_000n);
  });

  it('handles 9-decimal NASUN', () => {
    expect(parseRawAmount('0.05', NASUN_DECIMALS)).toBe(50_000_000n);
  });
});

describe('formatRawAmount', () => {
  it('formats whole numbers without trailing zeros', () => {
    expect(formatRawAmount(10_000_000n, NUSDC_DECIMALS)).toBe('10');
  });

  it('formats fractional and strips trailing zeros', () => {
    expect(formatRawAmount(1_500_000n, NUSDC_DECIMALS)).toBe('1.5');
  });

  it('formats small fractional', () => {
    expect(formatRawAmount(1_000n, NUSDC_DECIMALS)).toBe('0.001');
  });

  it('formats zero', () => {
    expect(formatRawAmount(0n, NUSDC_DECIMALS)).toBe('0');
  });

  it('round-trips with parseRawAmount', () => {
    const samples = ['0', '1', '12.34', '0.05', '0.000001'];
    for (const s of samples) {
      const raw = parseRawAmount(s, NUSDC_DECIMALS);
      expect(formatRawAmount(raw, NUSDC_DECIMALS)).toBe(s === '0.000001' ? '0.000001' : s);
    }
  });

  it('formats NASUN reserve cleanly', () => {
    expect(formatRawAmount(OWNER_NASUN_GAS_RESERVE_MIST, NASUN_DECIMALS)).toBe('0.05');
  });
});

describe('computeMaxForMode: deposit', () => {
  const base = {
    mode: 'deposit' as const,
    ownerNusdcRaw: 0n,
    agentNasunRaw: 0n,
    agentSelectedRaw: 0n,
  };

  it('NUSDC deposit returns full owner NUSDC balance', () => {
    const max = computeMaxForMode({ ...base, effectiveCoin: 'NUSDC', ownerSelectedRaw: 100_000_000n });
    expect(max).toBe(100_000_000n);
  });

  it('NBTC deposit returns full owner NBTC balance', () => {
    const max = computeMaxForMode({ ...base, effectiveCoin: 'NBTC', ownerSelectedRaw: 5_00000000n });
    expect(max).toBe(5_00000000n);
  });

  it('NASUN deposit subtracts the gas reserve', () => {
    const ownerNasun = 1_000_000_000n; // 1 NASUN
    const max = computeMaxForMode({ ...base, effectiveCoin: 'NASUN', ownerSelectedRaw: ownerNasun });
    expect(max).toBe(ownerNasun - OWNER_NASUN_GAS_RESERVE_MIST);
  });

  it('NASUN deposit returns 0n when owner balance equals exactly the reserve', () => {
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NASUN',
      ownerSelectedRaw: OWNER_NASUN_GAS_RESERVE_MIST,
    });
    expect(max).toBe(0n);
  });

  it('NASUN deposit returns 0n when owner is below reserve (no negative)', () => {
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NASUN',
      ownerSelectedRaw: OWNER_NASUN_GAS_RESERVE_MIST - 1n,
    });
    expect(max).toBe(0n);
  });

  it('NASUN deposit returns 1n when owner is reserve + 1', () => {
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NASUN',
      ownerSelectedRaw: OWNER_NASUN_GAS_RESERVE_MIST + 1n,
    });
    expect(max).toBe(1n);
  });
});

describe('computeMaxForMode: top-up-inference', () => {
  it('always returns owner NUSDC balance regardless of effectiveCoin', () => {
    const max = computeMaxForMode({
      mode: 'top-up-inference',
      effectiveCoin: 'NUSDC',
      ownerSelectedRaw: 0n,
      ownerNusdcRaw: 100_000_000n,
      agentNasunRaw: 0n,
      agentSelectedRaw: 0n,
    });
    expect(max).toBe(100_000_000n);
  });
});

describe('computeMaxForMode: withdraw-trading', () => {
  const base = {
    mode: 'withdraw-trading' as const,
    ownerSelectedRaw: 0n,
    ownerNusdcRaw: 0n,
  };

  it('NUSDC withdraw returns full agent balance', () => {
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NUSDC',
      agentNasunRaw: 0n,
      agentSelectedRaw: 1_000_000_000_000n,
    });
    expect(max).toBe(1_000_000_000_000n);
  });

  it('NASUN withdraw subtracts agent-side gas reserve via computeNasunMaxWithdraw', () => {
    const agentNasun = 1_000_000_000n;
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NASUN',
      agentNasunRaw: agentNasun,
      agentSelectedRaw: agentNasun,
    });
    expect(max).toBe(agentNasun - AGENT_MIN_GAS_RESERVE);
  });

  it('NASUN withdraw returns 0n when agent has dust below the reserve (H-3)', () => {
    // This is the dust dead-end case: agent has some NASUN but less than the
    // reserve. Max must be 0n so the Submit gate disables; previously this
    // path left Submit enabled and the user was stuck.
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NASUN',
      agentNasunRaw: AGENT_MIN_GAS_RESERVE - 1n,
      agentSelectedRaw: AGENT_MIN_GAS_RESERVE - 1n,
    });
    expect(max).toBe(0n);
  });

  it('NASUN withdraw returns 0n when agent has exactly the reserve', () => {
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NASUN',
      agentNasunRaw: AGENT_MIN_GAS_RESERVE,
      agentSelectedRaw: AGENT_MIN_GAS_RESERVE,
    });
    expect(max).toBe(0n);
  });

  it('non-NASUN withdraw returns 0n when agent has no balance', () => {
    const max = computeMaxForMode({
      ...base,
      effectiveCoin: 'NUSDC',
      agentNasunRaw: 100_000_000n, // has gas, just no NUSDC
      agentSelectedRaw: 0n,
    });
    expect(max).toBe(0n);
  });
});
