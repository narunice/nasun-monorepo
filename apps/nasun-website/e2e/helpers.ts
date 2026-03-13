/**
 * E2E test helpers - loads env vars and provides shared utilities
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value.replace(/\/$/, ''); // strip trailing slash
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value ? value.replace(/\/$/, '') : undefined;
}

// API base URLs from .env.development
export const URLS = {
  twitterAuth: requireEnv('VITE_TWITTER_AUTH_API'),
  metamaskAuth: requireEnv('VITE_METAMASK_AUTH_API'),
  battalionNft: requireEnv('VITE_BATTALION_NFT_API'),
  userProfile: requireEnv('VITE_USER_PROFILE_API'),
  joinWhitelist: requireEnv('VITE_JOIN_WHITELIST_API'),
  withdrawWhitelist: requireEnv('VITE_WITHDRAW_WHITELIST_API'),
  checkWhitelist: requireEnv('VITE_CHECK_WHITELIST_API'),
  deactivateUser: requireEnv('VITE_DEACTIVATE_USER_API_URL'),
  linkAccount: requireEnv('VITE_LINK_ACCOUNT_API'),
  priceApi: requireEnv('VITE_PRICE_API_ENDPOINT'),
  backupPrice: requireEnv('VITE_BACKUP_API_ENDPOINT'),
  userCount: requireEnv('VITE_USER_COUNT_API'),
  followerCount: requireEnv('VITE_FOLLOWER_COUNT_API'),
  governance: requireEnv('VITE_GOVERNANCE_API_URL'),
  leaderboardV3: requireEnv('VITE_LEADERBOARD_V3_API_URL'),
  adminApi: requireEnv('VITE_ADMIN_API_URL'),
  zkLoginSalt: optionalEnv('VITE_ZKLOGIN_SALT_API_URL'),
  randomImage: requireEnv('VITE_RANDOM_IMAGE_API_ENDPOINT'),
} as const;

// Test wallet addresses (not real - for testing only)
export const TEST_WALLET = '0x0000000000000000000000000000000000000001';
export const TEST_WALLET_REAL = '0xtest0000000000000000000000000000000000000000000000000000000000';
export const TEST_X_USER_ID = '0000000000';
export const TEST_IDENTITY_ID = 'ap-northeast-2:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const TEST_TWITTER_HANDLE = 'test_handle';

// Allowed origins for CORS testing
export const ALLOWED_ORIGIN = 'https://nasun.io';

/**
 * Fetch helper that returns response + parsed body
 */
export async function apiRequest(
  url: string,
  options: RequestInit = {}
): Promise<{ status: number; headers: Headers; body: unknown; raw: Response }> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body: unknown;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: res.status, headers: res.headers, body, raw: res };
}

/**
 * POST helper
 */
export function post(url: string, data: unknown, headers?: Record<string, string>) {
  return apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(data),
    headers,
  });
}

/**
 * GET helper
 */
export function get(url: string, headers?: Record<string, string>) {
  return apiRequest(url, { method: 'GET', headers });
}

/**
 * DELETE helper
 */
export function del(url: string, headers?: Record<string, string>) {
  return apiRequest(url, { method: 'DELETE', headers });
}

/**
 * OPTIONS helper for CORS preflight
 */
export function options(url: string, origin: string = ALLOWED_ORIGIN) {
  return apiRequest(url, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type,Authorization',
    },
  });
}

/**
 * Assert response body has no internal error details
 */
export function assertSanitizedError(body: unknown) {
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    expect(obj).not.toHaveProperty('error');
    expect(obj).not.toHaveProperty('details');
    expect(obj).not.toHaveProperty('stack');
    // message should be generic
    if ('message' in obj && typeof obj.message === 'string') {
      expect(obj.message).not.toMatch(/dynamodb|lambda|cognito|aws-sdk/i);
    }
  }
}
