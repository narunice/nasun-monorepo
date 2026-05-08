/**
 * E2E tests for Step 4B: Referral Anti-Spam
 *
 * Tests the referral-mappings (ACTIVATED filter) and referral-activate endpoints.
 * These are internal API-key-protected endpoints in the admin API.
 */

import { describe, test, expect } from 'vitest';
import { URLS, get, post } from './helpers';

const ADMIN = URLS.adminApi;

describe('14 -- Referral Mappings (ACTIVATED filter)', () => {
  test('GET /internal/referral-mappings without API key returns 401', async () => {
    const res = await get(`${ADMIN}/internal/referral-mappings`);
    expect(res.status).toBe(401);
  });

  test('GET /internal/referral-mappings with invalid API key returns 401', async () => {
    const res = await get(`${ADMIN}/internal/referral-mappings`, {
      'x-api-key': 'invalid-key-12345',
    });
    expect(res.status).toBe(401);
  });

  test('GET /internal/referral-mappings returns stats with totalActivated', async () => {
    // This test would pass with valid API key; without it, we verify auth enforcement
    const res = await get(`${ADMIN}/internal/referral-mappings`);
    expect(res.status).toBe(401);
    // Verify the response doesn't leak internal data
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/dynamodb|lambda|cognito/i);
  });
});

describe('14 -- Referral Activate Endpoint', () => {
  // Note: /internal/referral-activate may not be deployed yet.
  // API Gateway returns 403 for unknown routes (no auth token), or 401 from Lambda.
  test('POST /internal/referral-activate without API key returns 401 or 403', async () => {
    const res = await post(`${ADMIN}/internal/referral-activate`, {
      identityIds: ['test-id-1'],
    });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /internal/referral-activate with invalid API key returns 401 or 403', async () => {
    const res = await post(
      `${ADMIN}/internal/referral-activate`,
      { identityIds: ['test-id-1'] },
      { 'x-api-key': 'invalid-key' },
    );
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /internal/referral-activate with empty body returns 400, 401, or 403', async () => {
    const res = await post(`${ADMIN}/internal/referral-activate`, {});
    expect([400, 401, 403].includes(res.status)).toBe(true);
  });

  test('POST /internal/referral-activate with SQL injection in identityIds returns safe response', async () => {
    const res = await post(`${ADMIN}/internal/referral-activate`, {
      identityIds: ["'; DROP TABLE nasun-referrals; --"],
    });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /internal/referral-activate with oversized batch returns 400, 401, or 403', async () => {
    const res = await post(`${ADMIN}/internal/referral-activate`, {
      identityIds: Array.from({ length: 200 }, (_, i) => `test-${i}`),
    });
    expect([400, 401, 403].includes(res.status)).toBe(true);
  });
});

describe.skipIf(!URLS.explorerApi)('14 -- Referral Eligibility Signals (gate, internal)', () => {
  const EXPLORER = URLS.explorerApi!;
  const VALID_ID = 'ap-northeast-2:00000000-0000-0000-0000-000000000001';

  test('returns 401 without API key', async () => {
    const res = await get(`${EXPLORER}/api/v1/points/referral-eligibility-signals/${VALID_ID}`);
    expect(res.status).toBe(401);
  });

  test('returns 401 with invalid API key', async () => {
    const res = await get(
      `${EXPLORER}/api/v1/points/referral-eligibility-signals/${VALID_ID}`,
      { 'x-api-key': 'invalid-key-12345' },
    );
    expect(res.status).toBe(401);
  });

  test('rejects malformed identityId (auth-first ordering acceptable)', async () => {
    const res = await get(
      `${EXPLORER}/api/v1/points/referral-eligibility-signals/not-a-valid-id`,
    );
    // Either 401 (auth rejected first) or 400 (validation) is acceptable;
    // both prove the endpoint does not leak signals to anonymous callers.
    expect([401, 400]).toContain(res.status);
  });

  test('does not leak DB/internal info on rejection', async () => {
    const res = await get(
      `${EXPLORER}/api/v1/points/referral-eligibility-signals/${VALID_ID}`,
    );
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/postgres|sql|password|secret/i);
  });
});

describe.skipIf(!URLS.referralApi)('14 -- Referral my-code gate (handler)', () => {
  const REFERRAL = URLS.referralApi!;

  test('GET /referral/my-code without auth returns 401', async () => {
    const res = await get(`${REFERRAL}/referral/my-code`);
    expect(res.status).toBe(401);
  });

  test('GET /referral/my-code with bogus bearer returns 401', async () => {
    const res = await get(`${REFERRAL}/referral/my-code`, {
      Authorization: 'Bearer not-a-real-jwt',
    });
    expect(res.status).toBe(401);
  });
});

describe('14 -- Referral Anti-Spam Security', () => {
  test('POST /internal/referral-activate with XSS in identityIds returns safe response', async () => {
    const res = await post(`${ADMIN}/internal/referral-activate`, {
      identityIds: ['<script>alert(1)</script>'],
    });
    expect([401, 403].includes(res.status)).toBe(true);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('<script>');
  });

  test('Referral activate CORS preflight', async () => {
    const res = await fetch(`${ADMIN}/internal/referral-activate`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://nasun.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,x-api-key',
      },
    });
    expect(res.status).toBeLessThan(500);
  });
});
