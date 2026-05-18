import { describe, expect, it } from 'vitest';
import { decodeLotterySessionId, normalizeSessionHex } from './sessionId';

describe('decodeLotterySessionId', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(decodeLotterySessionId(undefined)).toBeNull();
    expect(decodeLotterySessionId(null)).toBeNull();
    expect(decodeLotterySessionId('')).toBeNull();
  });

  it('decodes a 16-byte input without 0x prefix (little-endian)', () => {
    // round=1, ticket=2 in u64 LE byte order.
    const hex = '01000000000000000200000000000000';
    expect(decodeLotterySessionId(hex)).toEqual({
      roundNumber: 1n,
      ticketId: 2n,
    });
  });

  it('decodes the same payload with 0x prefix', () => {
    const hex = '0x01000000000000000200000000000000';
    expect(decodeLotterySessionId(hex)).toEqual({
      roundNumber: 1n,
      ticketId: 2n,
    });
  });

  it('decodes uppercase hex digits when the 0x prefix is lowercase', () => {
    // round = 0xAB, ticket = 0xCD, in LE u64 byte order. The decoder regex
    // requires a lowercase `0x` prefix (or none) but allows mixed-case digits.
    expect(decodeLotterySessionId('0xAB00000000000000CD00000000000000')).toEqual({
      roundNumber: 0xabn,
      ticketId: 0xcdn,
    });
  });

  it('rejects an uppercase 0X prefix (current regex is lowercase-only)', () => {
    // Documents the strict-lowercase prefix invariant. session_id values
    // surfaced by the indexer are always lowercase hex, so the URL path
    // should never carry 0X.
    expect(decodeLotterySessionId('0XAB00000000000000CD00000000000000')).toBeNull();
  });

  it('decodes the maximum u64 in both halves', () => {
    const u64Max = 'ffffffffffffffff';
    expect(decodeLotterySessionId(u64Max + u64Max)).toEqual({
      roundNumber: 0xffffffffffffffffn,
      ticketId: 0xffffffffffffffffn,
    });
  });

  it('returns null for input shorter than 16 bytes', () => {
    expect(decodeLotterySessionId('0100000000000000')).toBeNull(); // 8 bytes
    expect(decodeLotterySessionId('0x0100')).toBeNull();
  });

  it('returns null for input longer than 16 bytes', () => {
    const tooLong = '01000000000000000200000000000000aa';
    expect(decodeLotterySessionId(tooLong)).toBeNull();
  });

  it('returns null for odd-length hex (after 0x strip)', () => {
    // 33-char body after 0x → odd; readU64LE would mis-slice.
    expect(decodeLotterySessionId('0x0' + '01000000000000000200000000000000')).toBeNull();
  });

  it('returns null for non-hex characters', () => {
    expect(decodeLotterySessionId('zz000000000000000200000000000000')).toBeNull();
    expect(decodeLotterySessionId('0xZZ000000000000000200000000000000')).toBeNull();
  });
});

describe('normalizeSessionHex', () => {
  it('strips a leading 0x and lowercases', () => {
    expect(normalizeSessionHex('0xABcd')).toBe('abcd');
    expect(normalizeSessionHex('abcd')).toBe('abcd');
  });

  it('rejects empty body after 0x or odd-length input', () => {
    expect(normalizeSessionHex('0x')).toBeNull();
    expect(normalizeSessionHex('abc')).toBeNull();
  });

  it('rejects non-hex input', () => {
    expect(normalizeSessionHex('abcg')).toBeNull();
    expect(normalizeSessionHex('0x!!')).toBeNull();
  });
});
