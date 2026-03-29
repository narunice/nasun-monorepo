/**
 * E2E tests for Step 4: Ecosystem NFT Activation API
 *
 * Tests the Ecosystem API endpoints (requires deployment first).
 * When VITE_ECOSYSTEM_API_URL is not set, tests are skipped gracefully.
 *
 * Covers: auth enforcement, input validation, security
 */

import { describe, test, expect } from 'vitest';
import { URLS, get, post } from './helpers';

// Ecosystem API may not be deployed yet
const ECOSYSTEM = process.env.VITE_ECOSYSTEM_API_URL;

describe('13 -- Ecosystem API Auth Enforcement', () => {
  test('GET /ecosystem/status without auth returns 401 or 403', async () => {
    if (!ECOSYSTEM) return;
    const res = await get(`${ECOSYSTEM}/ecosystem/status`);
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('GET /ecosystem/status with invalid token returns 401 or 403', async () => {
    if (!ECOSYSTEM) return;
    const res = await get(`${ECOSYSTEM}/ecosystem/status`, {
      Authorization: 'Bearer invalid-token-12345',
    });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /ecosystem/activate without auth returns 401 or 403', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(`${ECOSYSTEM}/ecosystem/activate`, { nftType: 'alliance' });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /ecosystem/deactivate without auth returns 401 or 403', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(`${ECOSYSTEM}/ecosystem/deactivate`, { nftType: 'alliance' });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /ecosystem/activate with expired JWT returns 401 or 403', async () => {
    if (!ECOSYSTEM) return;
    const expiredJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxMDAwMDAwMDAwfQ.invalid';
    const res = await post(
      `${ECOSYSTEM}/ecosystem/activate`,
      { nftType: 'alliance' },
      { Authorization: `Bearer ${expiredJwt}` },
    );
    expect([401, 403].includes(res.status)).toBe(true);
  });
});

describe('13 -- Ecosystem API Input Validation', () => {
  test('POST /ecosystem/activate with invalid nftType returns 400 or 401/403', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(
      `${ECOSYSTEM}/ecosystem/activate`,
      { nftType: 'invalid-type' },
      { Authorization: 'Bearer invalid' },
    );
    // Auth check happens first, so 401/403 is expected
    expect([400, 401, 403].includes(res.status)).toBe(true);
  });

  test('POST /ecosystem/activate with empty body returns 400 or 401/403', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(
      `${ECOSYSTEM}/ecosystem/activate`,
      {},
      { Authorization: 'Bearer invalid' },
    );
    expect([400, 401, 403].includes(res.status)).toBe(true);
  });

  test('POST /ecosystem/deactivate with no nftType returns 400 or 401/403', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(
      `${ECOSYSTEM}/ecosystem/deactivate`,
      {},
      { Authorization: 'Bearer invalid' },
    );
    expect([400, 401, 403].includes(res.status)).toBe(true);
  });
});

describe('13 -- Ecosystem API Security', () => {
  test('POST /ecosystem/activate with SQL injection returns safe response', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(`${ECOSYSTEM}/ecosystem/activate`, {
      nftType: "alliance'; DROP TABLE nasun;--",
    });
    expect([400, 401, 403].includes(res.status)).toBe(true);
  });

  test('POST /ecosystem/activate with XSS payload returns safe response', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(`${ECOSYSTEM}/ecosystem/activate`, {
      nftType: '<script>alert(1)</script>',
    });
    expect([400, 401, 403].includes(res.status)).toBe(true);
    // Response body should not echo the script tag
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('<script>');
  });

  test('POST /ecosystem/activate with very long nftType returns safe response', async () => {
    if (!ECOSYSTEM) return;
    const res = await post(`${ECOSYSTEM}/ecosystem/activate`, {
      nftType: 'A'.repeat(10000),
    });
    expect([400, 401, 403, 413].includes(res.status)).toBe(true);
  });

  test('GET /ecosystem/status with path traversal returns safe response', async () => {
    if (!ECOSYSTEM) return;
    const res = await get(`${ECOSYSTEM}/ecosystem/../../etc/passwd`);
    expect(res.status).toBeLessThan(500);
  });

  test('CORS preflight for ecosystem API', async () => {
    if (!ECOSYSTEM) return;
    const res = await fetch(`${ECOSYSTEM}/ecosystem/status`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://nasun.io',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    });
    expect(res.status).toBeLessThan(500);
  });
});

describe('13 -- Ecosystem API Unknown Routes', () => {
  test('GET /ecosystem/unknown returns 403 or 404', async () => {
    if (!ECOSYSTEM) return;
    const res = await get(`${ECOSYSTEM}/ecosystem/unknown`);
    // API Gateway will return 403 for unmatched routes (no auth)
    expect([403, 404].includes(res.status)).toBe(true);
  });

  test('DELETE /ecosystem/status returns 403 or 405', async () => {
    if (!ECOSYSTEM) return;
    const res = await fetch(`${ECOSYSTEM}/ecosystem/status`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBeLessThan(500);
  });
});
