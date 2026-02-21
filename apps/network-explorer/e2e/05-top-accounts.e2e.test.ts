import { describe, test, expect } from 'vitest';
import { API_BASE, ZERO_ADDRESS, get, assertCacheControl, assertBigIntString } from './helpers';

describe('05 — Top Accounts Endpoint', () => {
  test('GET /stats/top-accounts returns data array with count', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[]; count: number };
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.count).toBe('number');
    expect(body.count).toBe(body.data.length);
  });

  test('Top accounts has Cache-Control header (max-age=60)', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    assertCacheControl(res.headers, 60);
  });

  test('Default limit returns <= 50 accounts', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    const body = res.body as { data: unknown[] };
    expect(body.data.length).toBeLessThanOrEqual(50);
  });

  test('Each account has address, balance, coinCount', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    const body = res.body as { data: Array<Record<string, unknown>> };
    for (const account of body.data) {
      expect(account).toHaveProperty('address');
      expect(account).toHaveProperty('balance');
      expect(account).toHaveProperty('coinCount');
      expect(typeof account.address).toBe('string');
      expect((account.address as string).startsWith('0x')).toBe(true);
      assertBigIntString(account.balance);
      expect(typeof account.coinCount).toBe('number');
    }
  });

  test('Balances are sorted in descending order', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    const body = res.body as { data: Array<{ balance: string }> };
    for (let i = 1; i < body.data.length; i++) {
      expect(BigInt(body.data[i - 1].balance)).toBeGreaterThanOrEqual(BigInt(body.data[i].balance));
    }
  });

  test('No zero-balance accounts in results', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    const body = res.body as { data: Array<{ balance: string }> };
    for (const account of body.data) {
      expect(BigInt(account.balance)).toBeGreaterThan(0n);
    }
  });

  test('Zero address is excluded', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    const body = res.body as { data: Array<{ address: string }> };
    const addresses = body.data.map((a) => a.address);
    expect(addresses).not.toContain(ZERO_ADDRESS);
  });

  test('No duplicate addresses', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts`);
    const body = res.body as { data: Array<{ address: string }> };
    const addresses = body.data.map((a) => a.address);
    expect(addresses.length).toBe(new Set(addresses).size);
  });
});

describe('05 — Top Accounts Limit Parameter', () => {
  test('limit=25 returns at most 25 accounts', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=25`);
    const body = res.body as { data: unknown[] };
    expect(body.data.length).toBeLessThanOrEqual(25);
  });

  test('limit=100 returns at most 100 accounts', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=100`);
    const body = res.body as { data: unknown[] };
    expect(body.data.length).toBeLessThanOrEqual(100);
  });

  test('Invalid limit snaps to nearest allowed value', async () => {
    // limit=35 should snap to 25 or 50
    const res = await get(`${API_BASE}/stats/top-accounts?limit=35`);
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(body.data.length).toBeLessThanOrEqual(50);
  });

  test('limit=0 or negative defaults gracefully', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=0`);
    expect(res.status).toBe(200);
  });

  test('limit=abc (non-numeric) defaults gracefully', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=abc`);
    expect(res.status).toBe(200);
  });
});
