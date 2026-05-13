import { describe, expect, it } from 'vitest';

import {
  intentIdFromBytes,
  intentIdTimestamp,
  intentIdToBytes,
  isValidIntentId,
  newIntentId,
} from '../intent-ids';

describe('intent-ids', () => {
  it('produces 26-char Crockford base32 ULIDs', () => {
    const id = newIntentId();
    expect(id).toHaveLength(26);
    expect(isValidIntentId(id)).toBe(true);
  });

  it('encodes wall-clock time in the leading 10 chars', () => {
    const t = 1_700_000_000_000;
    const id = newIntentId(t);
    expect(intentIdTimestamp(id)).toBe(t);
  });

  it('rejects malformed ids', () => {
    expect(isValidIntentId('not-a-ulid')).toBe(false);
    expect(isValidIntentId('01HV0000000000000000000000')).toBe(true);
    expect(isValidIntentId('01HV000000000000000000000I')).toBe(false); // 'I' is excluded
    expect(isValidIntentId('01HV000000000000000000000l')).toBe(false); // lowercase 'l' excluded
  });

  it('round-trips between string and 16-byte representation', () => {
    for (let i = 0; i < 50; i++) {
      const id = newIntentId();
      const bytes = intentIdToBytes(id);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(16);
      const back = intentIdFromBytes(bytes);
      expect(back).toBe(id);
    }
  });

  it('throws on invalid byte length', () => {
    expect(() => intentIdFromBytes(new Uint8Array(15))).toThrow();
    expect(() => intentIdFromBytes(new Uint8Array(17))).toThrow();
  });

  it('time-sorts lexicographically when generated in sequence', () => {
    const a = newIntentId(1000);
    const b = newIntentId(2000);
    expect(a < b).toBe(true);
  });
});
