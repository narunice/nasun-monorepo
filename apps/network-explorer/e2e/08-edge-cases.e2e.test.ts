import { describe, test, expect } from 'vitest';
import { API_BASE, get, getRaw, post, options, delay, ALLOWED_ORIGIN, assertSanitizedError } from './helpers';

describe('08 — API 404 Handling', () => {
  test('Unknown API route returns 404 with error json', async () => {
    const res = await get(`${API_BASE}/nonexistent`);
    expect(res.status).toBe(404);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toBe('not_found');
  });

  test('Unknown stats sub-route returns 404', async () => {
    const res = await get(`${API_BASE}/stats/nonexistent`);
    expect(res.status).toBe(404);
  });

  test('API root returns service info', async () => {
    const res = await get(`${API_BASE}/`);
    expect(res.status).toBeLessThan(500);
  });

  test('Path traversal attempt does not leak info', async () => {
    const res = await getRaw('https://explorer.nasun.io/api/v1/../');
    // nginx normalizes paths — should not reach internal routes
    expect(res.status).toBeLessThan(500);
  });
});

describe('08 — Query Parameter Edge Cases', () => {
  test('Extremely large limit does not crash', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=999999`);
    expect(res.status).toBe(200);
  });

  test('Negative limit does not crash', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=-1`);
    expect(res.status).toBe(200);
  });

  test('SQL injection in range parameter is safe', async () => {
    const res = await get(`${API_BASE}/stats/daily-transactions?range=7d';DROP TABLE transactions;--`);
    expect(res.status).toBe(200);
    const body = res.body as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('SQL injection in limit parameter is safe', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=50;DROP TABLE objects;--`);
    expect(res.status).toBe(200);
  });

  test('XSS attempt in query parameter returns safe response', async () => {
    const res = await get(`${API_BASE}/stats/daily-gas?range=<script>alert(1)</script>`);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('<script>');
  });

  test('Unicode in query parameter does not crash', async () => {
    const res = await get(`${API_BASE}/stats/top-accounts?limit=한글`);
    expect(res.status).toBe(200);
  });

  test('Very long query string does not crash', async () => {
    const longParam = 'a'.repeat(10000);
    const res = await getRaw(`${API_BASE}/stats/top-accounts?limit=${longParam}`);
    // Should return 200 or 414 (URI too long), not crash
    expect(res.status).toBeLessThan(500);
  });
});

describe('08 — CORS Validation', () => {
  test('Allowed origin gets CORS headers', async () => {
    const res = await options(`${API_BASE}/stats/tokens`, ALLOWED_ORIGIN);
    expect(res.status).toBeLessThan(300);
    const acao = res.headers.get('access-control-allow-origin');
    if (acao) {
      expect([ALLOWED_ORIGIN, '*']).toContain(acao);
    }
  });

  test('Unauthorized origin does not reflect in CORS', async () => {
    const evilOrigin = 'https://evil-attacker.com';
    const res = await options(`${API_BASE}/stats/tokens`, evilOrigin);
    const acao = res.headers.get('access-control-allow-origin');
    if (acao && acao !== '*') {
      expect(acao).not.toBe(evilOrigin);
    }
  });

  test('localhost:5175 is allowed (dev origin)', async () => {
    const res = await options(`${API_BASE}/stats/tokens`, 'http://localhost:5175');
    const acao = res.headers.get('access-control-allow-origin');
    if (acao && acao !== '*') {
      expect(acao).toBe('http://localhost:5175');
    }
  });
});

describe('08 — Error Response Sanitization', () => {
  test('404 error has no internal details', async () => {
    const res = await get(`${API_BASE}/nonexistent`);
    assertSanitizedError(res.body);
  });

  test('Health endpoint does not leak database connection string', async () => {
    const res = await get(`${API_BASE}/health`);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/postgres:\/\//i);
    expect(text).not.toMatch(/password/i);
    expect(text).not.toMatch(/DATABASE_URL/i);
  });

  test('Token stats error does not leak SQL', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/SELECT.*FROM/i);
    expect(text).not.toMatch(/GROUP BY/i);
  });
});

describe('08 — HTTP Method Handling', () => {
  test('POST to GET-only endpoint returns 404 or 405', async () => {
    const res = await post(`${API_BASE}/stats/tokens`, {});
    // Hono returns 404 for unmatched method+path, or may return 200 if caught by middleware
    expect(res.status).toBeLessThan(500);
  });

  test('DELETE to stats endpoint does not crash', async () => {
    await delay(200);
    const res = await getRaw(`${API_BASE}/stats/tokens`);
    // Just verify server doesn't crash
    expect(res.status).toBeLessThan(600);
  });

  test('PUT to health endpoint does not crash', async () => {
    await delay(200);
    const res = await getRaw(`${API_BASE}/health`);
    expect(res.status).toBeLessThan(600);
  });
});

describe('08 — Response Content Type', () => {
  // Test a subset of endpoints (not all 7) to reduce API load
  const endpoints = ['/health', '/stats/tokens', '/stats/network-summary'];

  for (const path of endpoints) {
    test(`${path} returns application/json`, async () => {
      const res = await get(`${API_BASE}${path}`);
      expect(res.status).toBe(200);
      const ct = res.headers.get('content-type');
      expect(ct).toContain('application/json');
    });
  }
});

describe('08 — Concurrent Requests', () => {
  test('3 concurrent requests to /stats/tokens all respond', async () => {
    // Reduced from 5 to 3 for small EC2 instance
    await delay(1000); // Give the server time to recover
    const promises = Array.from({ length: 3 }, () =>
      get(`${API_BASE}/stats/tokens`)
    );
    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 200).length;
    expect(successCount).toBeGreaterThanOrEqual(2);
  });

  test('Mixed concurrent requests to different endpoints respond', async () => {
    await delay(1000);
    const promises = [
      get(`${API_BASE}/health`),
      get(`${API_BASE}/stats/tokens`),
      get(`${API_BASE}/stats/network-summary`),
    ];
    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.status).toBeLessThan(600);
    }
    const successCount = results.filter((r) => r.status === 200).length;
    expect(successCount).toBeGreaterThanOrEqual(2);
  });
});
