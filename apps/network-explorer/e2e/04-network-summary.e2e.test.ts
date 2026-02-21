import { describe, test, expect } from 'vitest';
import { API_BASE, get, assertCacheControl } from './helpers';

describe('04 — Network Summary Endpoint', () => {
  test('GET /stats/network-summary returns data object', async () => {
    const res = await get(`${API_BASE}/stats/network-summary`);
    expect(res.status).toBe(200);
    const body = res.body as { data: Record<string, unknown> };
    expect(typeof body.data).toBe('object');
    expect(body.data).not.toBeNull();
  });

  test('Network summary has Cache-Control header (max-age=30)', async () => {
    const res = await get(`${API_BASE}/stats/network-summary`);
    assertCacheControl(res.headers, 30);
  });

  test('Summary contains all required fields', async () => {
    const res = await get(`${API_BASE}/stats/network-summary`);
    const body = res.body as { data: Record<string, unknown> };
    const required = [
      'totalTransactions',
      'totalCheckpoints',
      'uniqueAddresses',
      'totalPackages',
      'totalEvents',
      'latestCheckpoint',
      'latestTimestamp',
    ];
    for (const field of required) {
      expect(body.data).toHaveProperty(field);
    }
  });

  test('Core numeric fields are positive', async () => {
    const res = await get(`${API_BASE}/stats/network-summary`);
    const data = (res.body as { data: Record<string, unknown> }).data;
    // These should always be positive (checkpoints/transactions exist since indexer start)
    for (const field of ['totalTransactions', 'totalCheckpoints', 'uniqueAddresses']) {
      expect(typeof data[field]).toBe('number');
      expect(data[field] as number).toBeGreaterThan(0);
    }
    // packages/events may be 0 when indexer recently restarted (only partial data indexed)
    for (const field of ['totalPackages', 'totalEvents']) {
      expect(typeof data[field]).toBe('number');
      expect(data[field] as number).toBeGreaterThanOrEqual(0);
    }
  });

  test('latestCheckpoint is a valid sequence number', async () => {
    const data = ((await get(`${API_BASE}/stats/network-summary`)).body as { data: Record<string, unknown> }).data;
    expect(data.latestCheckpoint).toBeTruthy();
    const latest = Number(data.latestCheckpoint);
    expect(latest).toBeGreaterThan(4665621); // Start checkpoint
  });

  test('latestTimestamp is recent (within 24 hours)', async () => {
    const data = ((await get(`${API_BASE}/stats/network-summary`)).body as { data: Record<string, unknown> }).data;
    expect(data.latestTimestamp).toBeTruthy();
    const ts = Number(data.latestTimestamp);
    const now = Date.now();
    const diffHours = (now - ts) / (1000 * 60 * 60);
    // Indexer should be within 24 hours of real time
    expect(diffHours).toBeLessThan(24);
  });

  test('totalTransactions >= totalCheckpoints (multiple tx per checkpoint)', async () => {
    const data = ((await get(`${API_BASE}/stats/network-summary`)).body as { data: Record<string, unknown> }).data;
    expect(data.totalTransactions as number).toBeGreaterThanOrEqual(data.totalCheckpoints as number);
  });

  test('totalPackages is non-negative (may be 0 if indexer recently restarted)', async () => {
    const data = ((await get(`${API_BASE}/stats/network-summary`)).body as { data: Record<string, unknown> }).data;
    expect(data.totalPackages as number).toBeGreaterThanOrEqual(0);
  });
});
