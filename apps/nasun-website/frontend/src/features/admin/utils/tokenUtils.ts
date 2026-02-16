import { parseJwt } from '@/utils/authUtils';

const EXPIRY_BUFFER_SECONDS = 60;

/**
 * Check if a Cognito OIDC JWT token is expired or about to expire.
 * Returns true if the token is invalid, expired, or within the buffer window.
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;

  const payload = parseJwt(token);
  if (!payload || typeof payload.exp !== 'number') return true;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds >= payload.exp - EXPIRY_BUFFER_SECONDS;
}

/**
 * Get remaining seconds until token expires. Returns 0 if expired or invalid.
 */
export function getTokenRemainingSeconds(token: string | null | undefined): number {
  if (!token) return 0;

  const payload = parseJwt(token);
  if (!payload || typeof payload.exp !== 'number') return 0;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.max(0, payload.exp - nowSeconds);
}
