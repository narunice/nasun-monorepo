import { describe, test, expect } from 'vitest';
import { URLS, get, post } from './helpers';

const ADMIN = URLS.adminApi;
const LB = URLS.leaderboardV3;

describe('10 — Admin API Authorization (Cognito JWT Required)', () => {
  describe('Admin API endpoints reject unauthenticated requests', () => {
    test('GET /export/genesis without auth returns 401/403', async () => {
      const res = await get(`${ADMIN}/export/genesis?status=ACTIVE`);
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('GET /export/battalion without auth returns 401/403', async () => {
      const res = await get(`${ADMIN}/export/battalion`);
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('GET /export/stats without auth returns 401/403', async () => {
      const res = await get(`${ADMIN}/export/stats`);
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('POST /hidden-proposals without auth returns 401/403', async () => {
      const res = await post(`${ADMIN}/hidden-proposals`, {
        proposalId: 'test-proposal-id',
      });
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('POST /nft-collections without auth returns 401/403', async () => {
      const res = await post(`${ADMIN}/nft-collections`, {
        name: 'Test Collection',
      });
      expect([401, 403].includes(res.status)).toBe(true);
    });
  });

  describe('Leaderboard V3 Admin endpoints reject unauthenticated requests', () => {
    test('GET /v3/admin/stats without auth returns 401/403', async () => {
      const res = await get(`${LB}/v3/admin/stats`);
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('POST /v3/posts without auth returns 401/403', async () => {
      const res = await post(`${LB}/v3/posts`, {
        username: 'test',
        url: 'https://x.com/test/status/123',
      });
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('GET /v3/admin/blacklist without auth returns 401/403', async () => {
      const res = await get(`${LB}/v3/admin/blacklist`);
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('POST /v3/admin/seasons without auth returns 401/403', async () => {
      const res = await post(`${LB}/v3/admin/seasons`, {
        name: 'Test Season',
      });
      expect([401, 403].includes(res.status)).toBe(true);
    });

    test('GET /v3/admin/seasons without auth returns 401/403', async () => {
      const res = await get(`${LB}/v3/admin/seasons`);
      expect([401, 403].includes(res.status)).toBe(true);
    });
  });

  describe('Public endpoints are accessible without auth', () => {
    test('GET /hidden-proposals returns 200 (public list)', async () => {
      const res = await get(`${ADMIN}/hidden-proposals`);
      expect(res.status).toBe(200);
    });

    test('GET /nft-collections returns 200 (public list)', async () => {
      const res = await get(`${ADMIN}/nft-collections`);
      expect(res.status).toBe(200);
    });
  });
});
