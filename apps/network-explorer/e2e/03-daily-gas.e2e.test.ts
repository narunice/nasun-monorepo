import { describe, test, expect } from 'vitest';
import { API_BASE, get, assertCacheControl, assertDateString, assertBigIntString } from './helpers';

describe('03 — Daily Gas Endpoint', () => {
  test('GET /stats/daily-gas returns data array with range', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas`);
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[]; range: string };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.range).toBe('7d');
  });

  test('Daily gas has Cache-Control header (max-age=300)', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas`);
    assertCacheControl(res.headers, 300);
  });

  test('Each entry has correct schema', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas`);
    const body = res.body as { data: Array<Record<string, unknown>> };
    for (const entry of body.data) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('totalGasCost');
      expect(entry).toHaveProperty('avgGasPerTx');
      expect(entry).toHaveProperty('txCount');
      assertDateString(entry.date);
      assertBigIntString(entry.totalGasCost);
      // avgGasPerTx is FLOOR()'d to integer in SQL
      assertBigIntString(entry.avgGasPerTx);
      expect(typeof entry.txCount).toBe('number');
      expect(entry.txCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('Dates are sorted in ascending order', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas`);
    const body = res.body as { data: Array<{ date: string }> };
    for (let i = 1; i < body.data.length; i++) {
      expect(body.data[i].date >= body.data[i - 1].date).toBe(true);
    }
  });

  test('totalGasCost is non-negative', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas`);
    const body = res.body as { data: Array<{ totalGasCost: string }> };
    for (const entry of body.data) {
      expect(BigInt(entry.totalGasCost)).toBeGreaterThanOrEqual(0n);
    }
  });

  test('avgGasPerTx is less than or equal to totalGasCost', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas`);
    const body = res.body as { data: Array<{ totalGasCost: string; avgGasPerTx: string; txCount: number }> };
    for (const entry of body.data) {
      if (entry.txCount > 0) {
        expect(BigInt(entry.avgGasPerTx)).toBeLessThanOrEqual(BigInt(entry.totalGasCost));
      }
    }
  });
});

describe('03 — Daily Gas Range Parameter', () => {
  test('range=7d returns 7d and data within 7 days', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas?range=7d`);
    const body = res.body as { data: Array<{ date: string }>; range: string };
    expect(body.range).toBe('7d');
    if (body.data.length > 0) {
      const oldestDate = new Date(body.data[0].date);
      const now = new Date();
      const diffDays = (now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeLessThanOrEqual(8); // 7 days + margin
    }
  });

  test('range=14d returns 14d', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas?range=14d`);
    const body = res.body as { range: string };
    expect(body.range).toBe('14d');
  });

  test('range=30d returns 30d', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas?range=30d`);
    const body = res.body as { range: string };
    expect(body.range).toBe('30d');
  });

  test('Invalid range defaults to 7d', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas?range=999d`);
    const body = res.body as { range: string };
    expect(body.range).toBe('7d');
  });

  test('Empty range defaults to 7d', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas?range=`);
    const body = res.body as { range: string };
    expect(body.range).toBe('7d');
  });

  test('30d returns more data than 7d', async () => {
    const [res7, res30] = await Promise.all([
      get(`${API_BASE}/stats/daily-gas?range=7d`),
      get(`${API_BASE}/stats/daily-gas?range=30d`),
    ]);
    const data7 = (res7.body as { data: unknown[] }).data;
    const data30 = (res30.body as { data: unknown[] }).data;
    expect(data30.length).toBeGreaterThanOrEqual(data7.length);
  });
});
