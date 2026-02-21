import { describe, test, expect } from 'vitest';
import { API_BASE, get, assertCacheControl, assertDateString } from './helpers';

describe('06 — Daily Transactions Endpoint', () => {
  test('GET /stats/daily-transactions returns data array with range', async () => {
    const res = await get(`${API_BASE}/stats/daily-transactions`);
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[]; range: string };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.range).toBe('7d');
  });

  test('Has Cache-Control header (max-age=300)', async () => {
    const res = await get(`${API_BASE}/stats/daily-transactions`);
    assertCacheControl(res.headers, 300);
  });

  test('Each entry has date and transactions', async () => {
    const res = await get(`${API_BASE}/stats/daily-transactions?range=7d`);
    const body = res.body as { data: Array<Record<string, unknown>> };
    for (const entry of body.data) {
      assertDateString(entry.date);
      expect(typeof entry.transactions).toBe('number');
      expect(entry.transactions as number).toBeGreaterThanOrEqual(0);
    }
  });

  test('Dates are sorted ascending', async () => {
    const res = await get(`${API_BASE}/stats/daily-transactions?range=7d`);
    const body = res.body as { data: Array<{ date: string }> };
    for (let i = 1; i < body.data.length; i++) {
      expect(body.data[i].date >= body.data[i - 1].date).toBe(true);
    }
  });

  test('No negative transaction counts', async () => {
    const res = await get(`${API_BASE}/stats/daily-transactions?range=30d`);
    const body = res.body as { data: Array<{ transactions: number }> };
    for (const entry of body.data) {
      expect(entry.transactions).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('06 — Active Addresses Endpoint', () => {
  test('GET /stats/active-addresses returns data array with range', async () => {
    const res = await get(`${API_BASE}/stats/active-addresses`);
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[]; range: string };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.range).toBe('7d');
  });

  test('Has Cache-Control header (max-age=300)', async () => {
    const res = await get(`${API_BASE}/stats/active-addresses`);
    assertCacheControl(res.headers, 300);
  });

  test('Each entry has date and activeAddresses', async () => {
    const res = await get(`${API_BASE}/stats/active-addresses?range=7d`);
    const body = res.body as { data: Array<Record<string, unknown>> };
    for (const entry of body.data) {
      assertDateString(entry.date);
      expect(typeof entry.activeAddresses).toBe('number');
      expect(entry.activeAddresses as number).toBeGreaterThanOrEqual(0);
    }
  });

  test('Active addresses <= total transactions for each day', async () => {
    const [addrRes, txRes] = await Promise.all([
      get(`${API_BASE}/stats/active-addresses?range=7d`),
      get(`${API_BASE}/stats/daily-transactions?range=7d`),
    ]);
    const addrData = (addrRes.body as { data: Array<{ date: string; activeAddresses: number }> }).data;
    const txData = (txRes.body as { data: Array<{ date: string; transactions: number }> }).data;

    // Build lookup by date
    const txMap = new Map(txData.map((d) => [d.date, d.transactions]));
    for (const entry of addrData) {
      const txCount = txMap.get(entry.date);
      if (txCount !== undefined) {
        // Active addresses cannot exceed total transactions
        expect(entry.activeAddresses).toBeLessThanOrEqual(txCount);
      }
    }
  });
});

describe('06 — Range Parameter Consistency', () => {
  const endpoints = ['daily-transactions', 'active-addresses', 'daily-gas'];

  for (const ep of endpoints) {
    test(`${ep}: invalid range defaults to 7d`, async () => {
      const res = await get(`${API_BASE}/stats/${ep}?range=invalid`);
      expect(res.status).toBe(200);
      const body = res.body as { range: string };
      expect(body.range).toBe('7d');
    });

    test(`${ep}: range=30d returns 30d`, async () => {
      const res = await get(`${API_BASE}/stats/${ep}?range=30d`);
      const body = res.body as { range: string };
      expect(body.range).toBe('30d');
    });
  }
});
