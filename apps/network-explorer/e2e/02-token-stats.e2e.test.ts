import { describe, test, expect } from 'vitest';
import { API_BASE, COIN_TYPES, get, assertCacheControl, assertBigIntString } from './helpers';

describe('02 — Token Stats Endpoint', () => {
  test('GET /stats/tokens returns data array', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('Token stats has Cache-Control header (max-age=300)', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    assertCacheControl(res.headers, 300);
  });

  test('NSN (0x2::sui::SUI) appears in token stats', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<{ coinType: string; holders: number; circulatingSupply: string | null }> };
    const nsn = body.data.find((t) => t.coinType === COIN_TYPES.NSN);
    // NSN should always have holders (validators + genesis accounts)
    expect(nsn).toBeDefined();
    expect(nsn!.holders).toBeGreaterThan(0);
  });

  test('NSN circulatingSupply is a valid BigInt string', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<{ coinType: string; circulatingSupply: string | null }> };
    const nsn = body.data.find((t) => t.coinType === COIN_TYPES.NSN);
    expect(nsn).toBeDefined();
    if (nsn?.circulatingSupply) {
      assertBigIntString(nsn.circulatingSupply);
      // NSN supply should be positive
      expect(BigInt(nsn.circulatingSupply)).toBeGreaterThan(0n);
    }
  });

  test('Token stats uses short-form coin types (not zero-padded)', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<{ coinType: string }> };
    for (const token of body.data) {
      // Coin types should NOT have zero-padded addresses like 0x0000...0002
      expect(token.coinType).not.toMatch(/^0x0{10,}/);
      // Should start with 0x followed by a non-zero hex digit (short form)
      expect(token.coinType).toMatch(/^0x[1-9a-f]/);
    }
  });

  test('Each token has correct schema (coinType, holders, circulatingSupply)', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<Record<string, unknown>> };
    for (const token of body.data) {
      expect(token).toHaveProperty('coinType');
      expect(token).toHaveProperty('holders');
      expect(token).toHaveProperty('circulatingSupply');
      expect(typeof token.coinType).toBe('string');
      expect(typeof token.holders).toBe('number');
      expect(token.holders).toBeGreaterThanOrEqual(0);
      // circulatingSupply is string or null
      if (token.circulatingSupply !== null) {
        expect(typeof token.circulatingSupply).toBe('string');
      }
    }
  });

  test('Only known coin types appear in response', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<{ coinType: string }> };
    const knownTypes = Object.values(COIN_TYPES);
    for (const token of body.data) {
      expect(knownTypes).toContain(token.coinType);
    }
  });

  test('Holders count is non-negative integer', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<{ holders: number }> };
    for (const token of body.data) {
      expect(Number.isInteger(token.holders)).toBe(true);
      expect(token.holders).toBeGreaterThanOrEqual(0);
    }
  });

  test('No duplicate coin types in response', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<{ coinType: string }> };
    const types = body.data.map((t) => t.coinType);
    const uniqueTypes = new Set(types);
    expect(types.length).toBe(uniqueTypes.size);
  });
});
