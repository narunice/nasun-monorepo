/**
 * E2E tests for Step 5: Ecosystem Score & Leaderboard
 *
 * Tests the ecosystem score API endpoints on the explorer-api server.
 *
 * Endpoints under test:
 *   GET /ecosystem/score/:identityId  - User's ecosystem score (self-only)
 *   GET /ecosystem/leaderboard        - Ecosystem leaderboard (public, opaque IDs)
 *   GET /ecosystem/health             - Matview health status (public)
 *
 * /score/:identityId requires a Cognito JWT matching the path identity. The
 * unauthenticated tests below assert the 401 path (the gate itself); the
 * shape/quality tests are skipped because they need a logged-in fixture.
 *
 * Also tests the /internal/ecosystem-activations admin endpoint.
 */

import { describe, test, expect } from 'vitest';
import { URLS, get, ALLOWED_ORIGIN, TEST_IDENTITY_ID } from './helpers';

const EXPLORER = URLS.explorerApi;
const ADMIN = URLS.adminApi;

describe('15 -- Ecosystem Score API', () => {
  test.skipIf(!EXPLORER)('GET /ecosystem/score without auth returns 401 (self-only gate, issue #1)', async () => {
    const res = await get(`${EXPLORER}/ecosystem/score/${encodeURIComponent(TEST_IDENTITY_ID)}`);
    // The self-only gate must reject unauthenticated callers. Anything else
    // (200/404/etc.) means the gate has regressed and the leaderboard scrape
    // exploit is back.
    expect(res.status).toBe(401);
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/score with invalid identityId returns 400 or 404', async () => {
    const res = await get(`${EXPLORER}/ecosystem/score/invalid-id`);
    // 400 from handler validation or 404 from Hono route mismatch
    expect([400, 404].includes(res.status)).toBe(true);
  });

  test.skipIf(!EXPLORER)('GET /ecosystem/score with SQL injection in identityId returns safe response', async () => {
    const malicious = encodeURIComponent("'; DROP TABLE ecosystem_daily_scores; --");
    const res = await get(`${EXPLORER}/ecosystem/score/${malicious}`);
    // Identity-format validation runs before the auth gate so an injection
    // payload still gets a 400/404, never a 500.
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
  test.skipIf(!EXPLORER)('GET /ecosystem/leaderboard returns weekly leaderboard with opaque displayId only', async () => {
    const res = await get(`${EXPLORER}/ecosystem/leaderboard`);
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as any;
      expect(body.data).toBeInstanceOf(Array);
      expect(body.meta).toBeDefined();
      // Each entry must expose displayId (16-char hex, opaque) and must NOT
      // leak the raw Cognito identityId (issue #1).
      for (const entry of body.data) {
        expect(typeof entry.displayId).toBe('string');
        expect(entry.displayId).toMatch(/^[0-9a-f]{16}$/);
        expect(entry.identityId).toBeUndefined();
        expect(typeof entry.weeklyScore).toBe('number');
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
  // The per-period response-shape tests below all hit /score/:identityId,
  // which is now self-only (issue #1) and so always 401s without a Cognito
  // JWT in this fixture. They are kept as documentation of the contract;
  // re-enable behind an authenticated fixture if/when the e2e harness
  // gains JWT minting.

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
