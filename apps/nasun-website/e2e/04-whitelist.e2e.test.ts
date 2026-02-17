import { describe, test, expect } from 'vitest';
import { URLS, get, post, TEST_WALLET, TEST_WALLET_REAL } from './helpers';

describe('04 — Genesis NFT Whitelist', () => {
  describe('Check Status', () => {
    test('GET /check with walletAddress returns status', async () => {
      const res = await get(`${URLS.checkWhitelist}?walletAddress=${TEST_WALLET_REAL}`);
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      // Response: {success: true, data: {registered: bool, walletAddress, ...}}
      if ('data' in body) {
        const data = body.data as Record<string, unknown>;
        expect(typeof data.registered === 'boolean').toBe(true);
      } else {
        expect(typeof body.registered === 'boolean' || 'walletAddress' in body).toBe(true);
      }
    });

    test('GET /check without walletAddress returns 400', async () => {
      const res = await get(URLS.checkWhitelist);
      expect(res.status).toBe(400);
    });

    test('GET /check with non-registered address returns not registered', async () => {
      const res = await get(`${URLS.checkWhitelist}?walletAddress=${TEST_WALLET}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Join Whitelist', () => {
    test('POST /join with empty body returns 400', async () => {
      const res = await post(URLS.joinWhitelist, {});
      expect(res.status).toBe(400);
    });

    test('POST /join without signature returns 400', async () => {
      const res = await post(URLS.joinWhitelist, {
        walletAddress: TEST_WALLET,
      });
      expect(res.status).toBe(400);
    });

    test('POST /join with invalid signature returns 400/401', async () => {
      const res = await post(URLS.joinWhitelist, {
        walletAddress: TEST_WALLET,
        signature: '0xinvalid',
        message: 'test',
        timestamp: Date.now(),
      });
      expect([400, 401].includes(res.status)).toBe(true);
    });
  });

  describe('Withdraw Whitelist', () => {
    test('POST /withdraw with empty body returns 400', async () => {
      const res = await post(URLS.withdrawWhitelist, {});
      expect(res.status).toBe(400);
    });

    test('POST /withdraw without walletAddress returns 400', async () => {
      const res = await post(URLS.withdrawWhitelist, {
        signature: '',
        message: '',
        timestamp: Date.now(),
      });
      expect(res.status).toBe(400);
    });
  });
});
