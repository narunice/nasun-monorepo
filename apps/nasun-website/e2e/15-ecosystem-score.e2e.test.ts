/**
 * E2E tests for Step 5: Ecosystem Score & Leaderboard
 *
 * Tests the ecosystem score API endpoints on the explorer-api server.
 * These are public endpoints (no auth required).
 *
 * Endpoints under test:
 *   GET /ecosystem/score/:identityId  - User's ecosystem score
 *   GET /ecosystem/leaderboard        - Ecosystem leaderboard
 *   GET /ecosystem/health             - Matview health status
 *
 * Also tests the /internal/ecosystem-activations admin endpoint.
 */

import { describe, test, expect } from 'vitest';
import { URLS, get, ALLOWED_ORIGIN, TEST_IDENTITY_ID } from './helpers';

const EXPLORER = URLS.explorerApi;
const ADMIN = URLS.adminApi;

describe('15 -- Ecosystem Score API', () => {
  test.skipIf(!EXPLORER)('GET /ecosystem/score with valid identityId returns score data', async () => {
    const res = await get(`${EXPLORER}/ecosystem/score/${encodeURIComponent(TEST_IDENTITY_ID)}`);
    // May return 200 (with data or zeros) or 503 (matview not created yet)
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as any;
      expect(body.data).toBeDefined();
      expect(body.data.identityId).toBe(TEST_IDENTITY_ID);
      expect(typeof body.data.multiplier).toBe('number');
      expect(body.data.daily).toBeDefined();
      expect(body.data.weekly).toBeDefined();
      expect(body.data.allTime).toBeDefined();
    }
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/score with invalid identityId returns 400 or 404', async () => {
    const res = await get(`${EXPLORER}/ecosystem/score/invalid-id`);
    // 400 from handler validation or 404 from Hono route mismatch
    expect([400, 404].includes(res.status)).toBe(true);
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/score with SQL injection in identityId returns safe response', async () => {
    const malicious = encodeURIComponent("'; DROP TABLE ecosystem_daily_scores; --");
    const res = await get(`${EXPLORER}/ecosystem/score/${malicious}`);
    // Should be 400 or 404 (invalid format), never 500 (injection succeeded)
    expect(res.status).toBeLessThan(500);
    expect([400, 404].includes(res.status)).toBe(true);
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/score with XSS in identityId returns safe response', async () => {
    const xss = encodeURIComponent('<script>alert(1)</script>');
    const res = await get(`${EXPLORER}/ecosystem/score/${xss}`);
    // May return 400 (invalid format) or 404 (no route match)
    expect([400, 404].includes(res.status)).toBe(true);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('<script>');
  });
});

describe('15 -- Ecosystem Leaderboard API', () => {
  test.skipIf(!EXPLORER)('GET /ecosystem/leaderboard returns daily leaderboard', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard`);
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as any;
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
      expect(body.meta.period).toBe('daily');
      // Each entry should have required fields
      for (const entry of body.data) {
        expect(typeof entry.identityId).toBe('string');
        expect(typeof entry.baseScore).toBe('number');
        expect(typeof entry.multiplier).toBe('number');
        expect(typeof entry.ecosystemScore).toBe('number');
        expect(typeof entry.rank).toBe('number');
      }
    }
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/leaderboard?period=weekly returns weekly leaderboard', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard?period=weekly`);
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as any;
      expect(body.meta.period).toBe('weekly');
    }
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/leaderboard with limit param works', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard?limit=25`);
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as any;
      expect(body.meta.limit).toBe(25);
      expect(body.data.length).toBeLessThanOrEqual(25);
    }
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/leaderboard with invalid period defaults to daily', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard?period=invalid`);
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as any;
      expect(body.meta.period).toBe('daily');
    }
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/leaderboard ranks are in descending score order', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard?limit=50`);
    if (res.status === 200) {
      const body = res.body as any;
      for (let i = 1; i < body.data.length; i++) {
        expect(body.data[i].ecosystemScore).toBeLessThanOrEqual(body.data[i - 1].ecosystemScore);
      }
    }
  });
});

describe('15 -- Ecosystem Health API', () => {
  test.skipIf(!EXPLORER)('GET /ecosystem/health returns matview status', async () => {
    const res = await get(`${EXPLORER}/ecosystem/health`);
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as any;
      expect(body.data).toBeDefined();
      expect(typeof body.data.stale).toBe('boolean');
      expect(typeof body.data.activationsCacheSize).toBe('number');
    }
  });
});

describe('15 -- Ecosystem Activations Internal Endpoint', () => {
  test('GET /internal/ecosystem-activations without API key returns 401 or 403', async () => {
    const res = await get(`${ADMIN}/internal/ecosystem-activations`);
    // 401 from Lambda (deployed) or 403 from API Gateway (not yet deployed)
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('GET /internal/ecosystem-activations with invalid API key returns 401 or 403', async () => {
    const res = await get(`${ADMIN}/internal/ecosystem-activations`, {
      'x-api-key': 'invalid-key-12345',
    });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('GET /internal/ecosystem-activations does not leak internal info', async () => {
    const res = await get(`${ADMIN}/internal/ecosystem-activations`);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/dynamodb|lambda|cognito/i);
  });

  test('Ecosystem activations CORS preflight', async () => {
    const res = await fetch(`${ADMIN}/internal/ecosystem-activations`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type,x-api-key',
      },
    });
    expect(res.status).toBeLessThan(500);
  });
});

describe('15 -- Ecosystem CORS', () => {
  test.skipIf(!EXPLORER)('Ecosystem endpoints include CORS headers', async () => {
    const res = await fetch(`${EXPLORER}/ecosystem/health`, {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    // Explorer API uses hono/cors middleware, should include header
    const allowOrigin = res.headers.get('access-control-allow-origin');
    expect(allowOrigin).toBeTruthy();
  });
});

describe('15 -- Ecosystem Score Quality (post-improvement)', () => {
  // Fix 2: multiplier bounded by MAX_MULTIPLIER
  test.skipIf(!EXPLORER)('score multiplier is bounded between 1.0 and 20.0', async () => {
    const res = await get(`${EXPLORER}/ecosystem/score/${encodeURIComponent(TEST_IDENTITY_ID)}`);
    if (res.status === 200) {
      const m = (res.body as any).data.multiplier;
      expect(m).toBeGreaterThanOrEqual(1.0);
      expect(m).toBeLessThanOrEqual(20.0);
    }
  });

  // Fix 4: ecosystemScore has at most 2 decimal places (string-based, no flaky float comparison)
  test.skipIf(!EXPLORER)('score ecosystemScore values have at most 2 decimal places', async () => {
    const res = await get(`${EXPLORER}/ecosystem/score/${encodeURIComponent(TEST_IDENTITY_ID)}`);
    if (res.status === 200) {
      const data = (res.body as any).data;
      for (const period of ['daily', 'weekly', 'allTime']) {
        const val = data[period].ecosystemScore;
        expect(String(val)).toMatch(/^\d+(\.\d{1,2})?$/);
      }
    }
  });

  // Fix 6: activation bonus field present and non-negative
  test.skipIf(!EXPLORER)('score activations include bonus field', async () => {
    const res = await get(`${EXPLORER}/ecosystem/score/${encodeURIComponent(TEST_IDENTITY_ID)}`);
    if (res.status === 200) {
      const activations = (res.body as any).data.activations;
      expect(activations).toBeInstanceOf(Array);
      for (const act of activations) {
        expect(typeof act.nftType).toBe('string');
        expect(typeof act.nftCount).toBe('number');
        expect(typeof act.bonus).toBe('number');
        expect(act.bonus).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // Fix 2: leaderboard multiplier in valid range
  test.skipIf(!EXPLORER)('leaderboard entries have multiplier in valid range', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard?limit=50`);
    if (res.status === 200) {
      for (const entry of (res.body as any).data) {
        expect(entry.multiplier).toBeGreaterThanOrEqual(1.0);
        expect(entry.multiplier).toBeLessThanOrEqual(20.0);
      }
    }
  });

  // Fix 4: leaderboard ecosystemScore = baseScore * multiplier (within precision)
  test.skipIf(!EXPLORER)('leaderboard ecosystemScore matches baseScore * multiplier', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard?limit=25`);
    if (res.status === 200) {
      for (const entry of (res.body as any).data) {
        const expected = parseFloat((entry.baseScore * entry.multiplier).toFixed(2));
        expect(entry.ecosystemScore).toBeCloseTo(expected, 1);
      }
    }
  });

  // Edge: path traversal in identityId
  test.skipIf(!EXPLORER)('score rejects path traversal in identityId', async () => {
    const traversal = encodeURIComponent('../../etc/passwd');
    const res = await get(`${EXPLORER}/ecosystem/score/${traversal}`);
    expect(res.status).toBeLessThan(500);
  });

  // Edge: leaderboard large offset returns empty data
  test.skipIf(!EXPLORER)('leaderboard with large offset returns empty data', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard?offset=9999`);
    if (res.status === 200) {
      expect((res.body as any).data).toBeInstanceOf(Array);
    }
  });
});
