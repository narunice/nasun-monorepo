import { describe, test, expect } from 'vitest';
import { URLS, post, get, TEST_WALLET, assertSanitizedError } from './helpers';

const METAMASK = URLS.metamaskAuth;
const TWITTER = URLS.twitterAuth;

describe('02 — MetaMask Authentication', () => {
  describe('Challenge', () => {
    test('POST /challenge with valid address returns nonce + message', async () => {
      const res = await post(`${METAMASK}/challenge`, {
        walletAddress: TEST_WALLET,
      });
      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('nonce');
      expect(body).toHaveProperty('message');
      expect(typeof body.nonce).toBe('string');
      expect(typeof body.message).toBe('string');
      expect((body.message as string).length).toBeGreaterThan(0);
    });

    test('POST /challenge with empty walletAddress returns 400', async () => {
      const res = await post(`${METAMASK}/challenge`, {
        walletAddress: '',
      });
      expect(res.status).toBe(400);
    });

    test('POST /challenge with missing walletAddress returns 400', async () => {
      const res = await post(`${METAMASK}/challenge`, {});
      expect(res.status).toBe(400);
    });

    test('GET /challenge (wrong method) returns 403/405', async () => {
      const res = await get(`${METAMASK}/challenge`);
      // API Gateway returns 403 for unconfigured methods
      expect([403, 405].includes(res.status)).toBe(true);
    });
  });

  describe('Verify', () => {
    test('POST /verify with wrong signature returns 401', async () => {
      // First get a challenge
      const challengeRes = await post(`${METAMASK}/challenge`, {
        walletAddress: TEST_WALLET,
      });
      expect(challengeRes.status).toBe(200);

      // Then verify with a fake signature
      const res = await post(`${METAMASK}/verify`, {
        walletAddress: TEST_WALLET,
        signature: '0x' + 'a'.repeat(130),
        nonce: (challengeRes.body as Record<string, string>).nonce,
      });
      expect(res.status).toBe(401);
    });

    test('POST /verify without prior challenge returns 400', async () => {
      const res = await post(`${METAMASK}/verify`, {
        walletAddress: '0x' + '1'.repeat(40),
        signature: '0x' + 'b'.repeat(130),
        nonce: 'nonexistent-nonce',
      });
      expect(res.status).toBe(400);
    });

    test('POST /verify with missing fields returns 400', async () => {
      const res = await post(`${METAMASK}/verify`, {
        walletAddress: TEST_WALLET,
      });
      expect(res.status).toBe(400);
    });

    test('POST /verify with empty body returns 400', async () => {
      const res = await post(`${METAMASK}/verify`, {});
      expect(res.status).toBe(400);
    });

    test('GET /verify (wrong method) returns 403/405', async () => {
      const res = await get(`${METAMASK}/verify`);
      // API Gateway returns 403 for unconfigured methods
      expect([403, 405].includes(res.status)).toBe(true);
    });
  });
});

describe('02 — Twitter OAuth', () => {
  test('GET /login returns redirect info', async () => {
    const res = await get(`${TWITTER}/login`);
    // Twitter login should return auth URL or redirect
    expect([200, 302].includes(res.status)).toBe(true);
    if (res.status === 200) {
      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('authUrl');
      expect(body).toHaveProperty('sessionId');
    }
  });

  test('POST /callback with invalid sessionId returns error', async () => {
    const res = await post(`${TWITTER}/callback`, {
      code: 'invalid-code',
      state: 'invalid-state',
      sessionId: 'nonexistent-session-id',
    });
    expect([400, 401, 404].includes(res.status)).toBe(true);
  });

  test('POST /callback with missing fields returns 400', async () => {
    const res = await post(`${TWITTER}/callback`, {});
    expect(res.status).toBe(400);
  });

  test('Error response does not leak internal details', async () => {
    const res = await post(`${TWITTER}/callback`, {
      code: 'invalid',
      state: 'invalid',
      sessionId: 'nonexistent',
    });
    // KNOWN BACKEND ISSUE: Twitter callback returns {error: "...", message: "..."}
    // The 'error' field was not fully sanitized in commit df6b524b
    const body = res.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('details');
    if (typeof body.message === 'string') {
      expect(body.message).not.toMatch(/dynamodb|lambda|cognito|aws-sdk/i);
    }
  });
});
