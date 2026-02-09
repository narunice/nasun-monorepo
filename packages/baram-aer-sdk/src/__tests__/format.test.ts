import { describe, it, expect } from 'vitest';
import {
  formatNusdc,
  formatNusdcValue,
  formatNasun,
  formatTimestamp,
  truncateHash,
  truncateAddress,
  formatDuration,
} from '../utils/format';

describe('formatNusdc', () => {
  it('formats 6-decimal raw amount with unit', () => {
    expect(formatNusdc(5_000_000)).toBe('5.00 NUSDC');
    expect(formatNusdc(1_234_567)).toBe('1.23 NUSDC');
    expect(formatNusdc(0)).toBe('0.00 NUSDC');
  });
});

describe('formatNusdcValue', () => {
  it('formats without unit', () => {
    expect(formatNusdcValue(5_000_000)).toBe('5.00');
    expect(formatNusdcValue(500_000)).toBe('0.50');
  });
});

describe('formatNasun', () => {
  it('formats 9-decimal raw amount with unit', () => {
    expect(formatNasun(1_000_000_000)).toBe('1 NASUN');
    expect(formatNasun(0)).toBe('0 NASUN');
  });
});

describe('formatTimestamp', () => {
  it('returns dash for zero', () => {
    expect(formatTimestamp(0)).toBe('-');
  });
  it('formats a real timestamp', () => {
    const result = formatTimestamp(1700000001500);
    expect(result).toContain('2023');
    expect(typeof result).toBe('string');
  });
});

describe('truncateHash', () => {
  it('returns dash for empty/null', () => {
    expect(truncateHash('')).toBe('-');
  });
  it('returns short hash as-is', () => {
    expect(truncateHash('abcdef')).toBe('abcdef');
  });
  it('truncates long hash', () => {
    const hash = '0x' + 'a'.repeat(64);
    const result = truncateHash(hash);
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(hash.length);
  });
  it('respects custom chars parameter', () => {
    const hash = '0x' + 'b'.repeat(64);
    const result = truncateHash(hash, 4);
    expect(result).toBe('0xbb...bbbb');
  });
});

describe('truncateAddress', () => {
  it('returns dash for empty', () => {
    expect(truncateAddress('')).toBe('-');
  });
  it('returns short address as-is', () => {
    expect(truncateAddress('0xabcd')).toBe('0xabcd');
  });
  it('truncates long address', () => {
    const addr = '0x' + 'a'.repeat(64);
    const result = truncateAddress(addr);
    expect(result).toBe('0xaaaa...aaaa');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });
  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(30_000)).toBe('30.0s');
  });
  it('formats minutes', () => {
    expect(formatDuration(90_000)).toBe('1.5m');
    expect(formatDuration(300_000)).toBe('5.0m');
  });
});
