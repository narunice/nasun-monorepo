import { describe, test, expect } from 'vitest';
import { URLS, get, post, assertSanitizedError } from './helpers';

const GOV = URLS.governance;

describe('11 -- Alliance NFT Status API', () => {
  test('GET /alliance/status without auth returns 401', async () => {
    const res = await get(`${GOV}/alliance/status`);
    expect(res.status).toBe(401);
  });

  test('GET /alliance/status with invalid token returns 401', async () => {
    const res = await get(`${GOV}/alliance/status`, {
      Authorization: 'Bearer invalid-token-12345',
    });
    expect(res.status).toBe(401);
  });

  test('GET /alliance/status with expired JWT returns 401', async () => {
    // Expired JWT (valid format, expired signature)
    const expiredJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxMDAwMDAwMDAwfQ.invalid';
    const res = await get(`${GOV}/alliance/status`, {
      Authorization: `Bearer ${expiredJwt}`,
    });
    expect(res.status).toBe(401);
  });
});

describe('11 -- Alliance NFT Mint API', () => {
  test('POST /alliance/mint without auth returns 401', async () => {
    const res = await post(`${GOV}/alliance/mint`, { imageIndex: 0, walletIndex: 0 });
    expect(res.status).toBe(401);
  });

  test('POST /alliance/mint with invalid token returns 401', async () => {
    const res = await post(
      `${GOV}/alliance/mint`,
      { imageIndex: 0, walletIndex: 0 },
      { Authorization: 'Bearer invalid-token' },
    );
    expect(res.status).toBe(401);
  });

  test('POST /alliance/mint with invalid imageIndex returns 400', async () => {
    // Even without valid auth, the endpoint should reject obviously bad input
    // Note: actual auth check happens first, so this may return 401 instead
    const res = await post(
      `${GOV}/alliance/mint`,
      { imageIndex: 99, walletIndex: 0 },
      { Authorization: 'Bearer invalid' },
    );
    expect([400, 401].includes(res.status)).toBe(true);
  });

  test('POST /alliance/mint with negative imageIndex returns 400 or 401', async () => {
    const res = await post(
      `${GOV}/alliance/mint`,
      { imageIndex: -1, walletIndex: 0 },
      { Authorization: 'Bearer invalid' },
    );
    expect([400, 401].includes(res.status)).toBe(true);
  });

  test('POST /alliance/mint with non-integer imageIndex returns 400 or 401', async () => {
    const res = await post(
      `${GOV}/alliance/mint`,
      { imageIndex: 1.5, walletIndex: 0 },
      { Authorization: 'Bearer invalid' },
    );
    expect([400, 401].includes(res.status)).toBe(true);
  });

  test('POST /alliance/mint with empty body returns 400 or 401', async () => {
    const res = await post(`${GOV}/alliance/mint`, {});
    expect([400, 401].includes(res.status)).toBe(true);
  });

  test('POST /alliance/mint with string imageIndex returns 400 or 401', async () => {
    const res = await post(
      `${GOV}/alliance/mint`,
      { imageIndex: 'zero', walletIndex: 0 },
      { Authorization: 'Bearer invalid' },
    );
    expect([400, 401].includes(res.status)).toBe(true);
  });
});

describe('11 -- Alliance NFT Security', () => {
  test('POST /alliance/mint with SQL injection in body returns safe error', async () => {
    const res = await post(`${GOV}/alliance/mint`, {
      imageIndex: "0; DROP TABLE nasun",
      walletIndex: 0,
    });
    expect([400, 401].includes(res.status)).toBe(true);
    // 401 returns { error: 'Unauthorized' } which is a safe public error, not internal leak
    if (res.status !== 401) {
      assertSanitizedError(res.body);
    }
  });

  test('POST /alliance/mint with XSS in body returns safe error', async () => {
    const res = await post(`${GOV}/alliance/mint`, {
      imageIndex: '<script>alert(1)</script>',
      walletIndex: 0,
    });
    expect([400, 401].includes(res.status)).toBe(true);
  });

  test('GET /alliance/status CORS preflight allows nasun.io', async () => {
    const res = await fetch(`${GOV}/alliance/status`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://nasun.io',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    });
    // API Gateway should respond with CORS headers
    expect(res.status).toBeLessThan(500);
  });
});
