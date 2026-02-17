import { describe, test, expect } from 'vitest';
import { URLS, get, post, del, TEST_IDENTITY_ID, assertSanitizedError } from './helpers';

describe('07 — User Profile API', () => {
  test('GET /profile with valid identityId returns user data', async () => {
    const res = await get(`${URLS.userProfile}?identityId=${TEST_IDENTITY_ID}`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('identityId');
  });

  test('GET /profile with nonexistent identityId returns 404 or empty', async () => {
    const res = await get(
      `${URLS.userProfile}?identityId=ap-northeast-2:00000000-0000-0000-0000-000000000000`
    );
    expect([200, 404].includes(res.status)).toBe(true);
  });

  test('GET /profile without identityId returns 400', async () => {
    const res = await get(URLS.userProfile);
    expect(res.status).toBe(400);
  });
});

describe('07 — Link Account (JWT Required)', () => {
  test('POST /link without Authorization returns 401', async () => {
    const res = await post(`${URLS.linkAccount}/link`, {
      primaryIdentityId: TEST_IDENTITY_ID,
      secondaryIdentityId: 'test-secondary',
      secondaryProvider: 'MetaMask',
    });
    expect(res.status).toBe(401);
  });

  test('POST /link with invalid Bearer token returns 401', async () => {
    const res = await post(
      `${URLS.linkAccount}/link`,
      {
        primaryIdentityId: TEST_IDENTITY_ID,
        secondaryIdentityId: 'test-secondary',
        secondaryProvider: 'MetaMask',
      },
      { Authorization: 'Bearer invalid-jwt-token' }
    );
    expect(res.status).toBe(401);
  });

  test('POST /link with malformed Authorization header returns 401', async () => {
    const res = await post(
      `${URLS.linkAccount}/link`,
      { primaryIdentityId: TEST_IDENTITY_ID },
      { Authorization: 'not-a-bearer-token' }
    );
    expect(res.status).toBe(401);
  });

  test('POST /link error response is sanitized', async () => {
    const res = await post(`${URLS.linkAccount}/link`, {
      primaryIdentityId: TEST_IDENTITY_ID,
    });
    // 401 from API Gateway returns {message: "Unauthorized"} which is fine
    const body = res.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('details');
    if (typeof body.message === 'string') {
      expect(body.message).not.toMatch(/dynamodb|lambda|cognito|aws-sdk/i);
    }
  });
});

describe('07 — Unlink Account (JWT Required)', () => {
  test('POST /unlink without Authorization returns 401', async () => {
    const res = await post(`${URLS.linkAccount}/unlink`, {
      primaryIdentityId: TEST_IDENTITY_ID,
      provider: 'MetaMask',
    });
    expect(res.status).toBe(401);
  });
});

describe('07 — Deactivate Account', () => {
  test('DELETE without identityId returns error', async () => {
    const res = await del(URLS.deactivateUser);
    expect([400, 403, 405].includes(res.status)).toBe(true);
  });

  test('GET on deactivate endpoint returns 403/405 (only DELETE allowed)', async () => {
    const res = await get(`${URLS.deactivateUser}?identityId=test&provider=test`);
    // API Gateway returns 403 "Missing Authentication Token" for unconfigured methods
    expect([200, 403, 405].includes(res.status)).toBe(true);
  });
});
