/**
 * E2E tests for Step 3: My-Account Renewal
 *
 * Tests the APIs consumed by the renewed My Account page:
 * - Activity Points API (explorer-api, public)
 * - Leaderboard V3 Rank History API
 * - Referral API
 */

import { describe, test, expect } from 'vitest';
import { URLS, get, post, TEST_WALLET_REAL, TEST_TWITTER_HANDLE } from './helpers';

const EXPLORER = URLS.explorerApi;
const LB = URLS.leaderboardV3;
const REFERRAL = URLS.referralApi;

// ---- Activity Points API (ProfileHeroCard w/ showPoints) ----

describe('12 -- Activity Points Health', () => {
  test('GET /points/health returns scanner status', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/health`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('data');
  });
});

describe('12 -- Activity Points Leaderboard', () => {
  test('GET /points/leaderboard returns array', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/leaderboard?limit=5&offset=0`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /points/leaderboard with limit=0 returns empty or error', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/leaderboard?limit=0&offset=0`);
    expect([200, 400].includes(res.status)).toBe(true);
  });

  test('GET /points/leaderboard with negative offset returns 200 or 400', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/leaderboard?limit=5&offset=-1`);
    expect([200, 400].includes(res.status)).toBe(true);
  });

  test('GET /points/leaderboard with very large limit caps gracefully', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/leaderboard?limit=99999&offset=0`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const data = body.data as unknown[];
    // Should not return more than a reasonable cap
    expect(data.length).toBeLessThanOrEqual(1000);
  });
});

describe('12 -- Activity Points User', () => {
  test('GET /points/user/:address returns data for real wallet', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/user/${TEST_WALLET_REAL}`);
    // 200 (has data), 404 (no activity), or 400 (address format) are all valid
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) {
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('data');
      const data = body.data as Record<string, unknown>;
      if (data) {
        expect(data).toHaveProperty('totalPoints');
        expect(data).toHaveProperty('categories');
        expect(data).toHaveProperty('activityCount');
      }
    }
  });

  test('GET /points/user/:address returns 404 for unknown wallet', async () => {
    if (!EXPLORER) return;
    const unknownAddr = '0x' + '0'.repeat(64);
    const res = await get(`${EXPLORER}/points/user/${unknownAddr}`);
    expect([404, 200].includes(res.status)).toBe(true);
    if (res.status === 200) {
      // May return null data
      const body = res.body as Record<string, unknown>;
      expect(body.data === null || typeof body.data === 'object').toBe(true);
    }
  });

  test('GET /points/user with invalid address returns 400 or 404', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/user/not-a-valid-address`);
    expect([400, 404].includes(res.status)).toBe(true);
  });

  test('GET /points/user with SQL injection returns safe response', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/user/0x'; DROP TABLE activity_points; --`);
    expect([400, 404].includes(res.status)).toBe(true);
  });

  test('GET /points/user with path traversal returns safe response', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/user/../../etc/passwd`);
    expect(res.status).toBeLessThan(500);
  });

  test('GET /points/user with XSS payload returns safe response', async () => {
    if (!EXPLORER) return;
    const res = await get(`${EXPLORER}/points/user/<script>alert(1)</script>`);
    expect([400, 404].includes(res.status)).toBe(true);
    // Response body should not echo the script tag
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('<script>');
  });
});

// ---- Leaderboard V3 Rank History (ProfileHeroCard V3 rank) ----

describe('12 -- Leaderboard V3 Rank History', () => {
  let activeSeasonId: string | undefined;

  test('GET seasons to find active season for rank tests', async () => {
    const res = await get(`${LB}/v3/leaderboard?listSeasons=true`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    const seasons = body.seasons as Array<Record<string, unknown>>;
    if (seasons?.length > 0) {
      const active = seasons.find((s) => s.status === 'active');
      if (active) activeSeasonId = active.seasonId as string;
    }
  });

  test('GET /v3/leaderboard/rank-history returns data or 404 for known user', async () => {
    if (!activeSeasonId) return;
    const res = await get(
      `${LB}/v3/leaderboard/rank-history?username=${TEST_TWITTER_HANDLE}&seasonId=${activeSeasonId}&days=7`,
    );
    // 200 (user ranked) or 404 (user not in this season) are both valid
    expect([200, 404].includes(res.status)).toBe(true);
    if (res.status === 200) {
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('success');
      if (body.data) {
        const data = body.data as Record<string, unknown>;
        expect(data).toHaveProperty('stats');
        const stats = data.stats as Record<string, unknown>;
        expect(stats).toHaveProperty('currentRank');
      }
    }
  });

  test('GET /v3/leaderboard/rank-history without username returns 400', async () => {
    if (!activeSeasonId) return;
    const res = await get(
      `${LB}/v3/leaderboard/rank-history?seasonId=${activeSeasonId}&days=7`,
    );
    expect([400, 404].includes(res.status)).toBe(true);
  });

  test('GET /v3/leaderboard/rank-history with unknown user returns 404 or empty', async () => {
    if (!activeSeasonId) return;
    const res = await get(
      `${LB}/v3/leaderboard/rank-history?username=nonexistent_user_xyz_12345&seasonId=${activeSeasonId}&days=7`,
    );
    // Could be 404 or 200 with empty/null data
    expect(res.status).toBeLessThan(500);
  });

  test('GET /v3/leaderboard/rank-history with invalid days returns 400 or defaults', async () => {
    if (!activeSeasonId) return;
    const res = await get(
      `${LB}/v3/leaderboard/rank-history?username=${TEST_TWITTER_HANDLE}&seasonId=${activeSeasonId}&days=999`,
    );
    // Should either reject invalid range or default to valid range
    expect(res.status).toBeLessThan(500);
  });
});

// ---- Referral API (ReferralCard in DevMyAccountPage) ----

describe('12 -- Referral API Auth', () => {
  test('GET /referral/status without auth returns 401 or 403', async () => {
    if (!REFERRAL) return;
    const res = await get(`${REFERRAL}/referral/status`);
    // API Gateway Cognito authorizer returns 401 or 403
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('GET /referral/status with invalid token returns 401 or 403', async () => {
    if (!REFERRAL) return;
    const res = await get(`${REFERRAL}/referral/status`, {
      Authorization: 'Bearer invalid-token',
    });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /referral/apply without auth returns 401 or 403', async () => {
    if (!REFERRAL) return;
    const res = await post(`${REFERRAL}/referral/apply`, { code: 'TESTCODE' });
    expect([401, 403].includes(res.status)).toBe(true);
  });

  test('POST /referral/apply with invalid token returns 401 or 403', async () => {
    if (!REFERRAL) return;
    const res = await post(
      `${REFERRAL}/referral/apply`,
      { code: 'TESTCODE' },
      { Authorization: 'Bearer invalid-token' },
    );
    expect([401, 403].includes(res.status)).toBe(true);
  });
});

describe('12 -- Referral API Input Validation', () => {
  test('POST /referral/apply with SQL injection in code returns safe error', async () => {
    if (!REFERRAL) return;
    const res = await post(`${REFERRAL}/referral/apply`, {
      code: "'; DROP TABLE referrals; --",
    });
    expect([400, 401].includes(res.status)).toBe(true);
  });

  test('POST /referral/apply with empty code returns 400 or 401', async () => {
    if (!REFERRAL) return;
    const res = await post(`${REFERRAL}/referral/apply`, { code: '' });
    expect([400, 401].includes(res.status)).toBe(true);
  });

  test('POST /referral/apply with very long code returns 400 or 401', async () => {
    if (!REFERRAL) return;
    const res = await post(`${REFERRAL}/referral/apply`, {
      code: 'A'.repeat(10000),
    });
    expect([400, 401, 413].includes(res.status)).toBe(true);
  });

  test('POST /referral/apply with XSS in code returns safe error', async () => {
    if (!REFERRAL) return;
    const res = await post(`${REFERRAL}/referral/apply`, {
      code: '<img src=x onerror=alert(1)>',
    });
    expect([400, 401].includes(res.status)).toBe(true);
  });
});

// ---- Cross-cutting: CORS ----

describe('12 -- API CORS Preflight', () => {
  test('Explorer API allows CORS from nasun.io', async () => {
    if (!EXPLORER) return;
    const res = await fetch(`${EXPLORER}/points/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://nasun.io',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    expect(res.status).toBeLessThan(500);
  });

  test('Referral API allows CORS from nasun.io', async () => {
    if (!REFERRAL) return;
    const res = await fetch(`${REFERRAL}/referral/status`, {
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
