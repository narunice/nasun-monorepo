/**
 * Cognito Identity Pool JWT verification.
 *
 * Mirrors the airdrop-authorizer pattern (apps/nasun-website/cdk/lambda-src/airdrop/authorizer/src/index.ts):
 *   - JWKS from https://cognito-identity.amazonaws.com/.well-known/jwks_uri
 *   - issuer: https://cognito-identity.amazonaws.com
 *   - audience: COGNITO_IDENTITY_POOL_ID
 *   - sub claim = identityId (e.g., "ap-northeast-2:6cb1e654-...")
 *
 * Note: we do NOT pin `algorithms` here. Cognito Identity Pool's JWKS
 * publishes keys with their own `alg` (observed: RS512), and jose already
 * refuses any signature alg not advertised by the matching JWK, so the
 * JWKS itself is the algorithm allowlist. Pinning to RS256 incorrectly
 * rejected real tokens.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';

// Accepts one or more Cognito Identity Pool IDs, comma-separated. The
// explorer-api is shared between staging and production frontends, which
// sign in against different Identity Pools, so both audiences must be
// accepted as valid for JWT verification.
const IDENTITY_POOL_IDS = (process.env.COGNITO_IDENTITY_POOL_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (IDENTITY_POOL_IDS.length === 0) {
  throw new Error('COGNITO_IDENTITY_POOL_ID environment variable is required');
}

const JWKS = createRemoteJWKSet(
  new URL('https://cognito-identity.amazonaws.com/.well-known/jwks_uri'),
);

export interface AuthContext {
  identityId: string;
}

export async function verifyCognitoToken(token: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://cognito-identity.amazonaws.com',
      // jose accepts a string[] here: audience claim must match ANY entry.
      audience: IDENTITY_POOL_IDS,
    });
    const identityId = payload.sub;
    if (!identityId) return null;
    return { identityId };
  } catch {
    return null;
  }
}

/**
 * Hono middleware: verifies Bearer token and sets `auth` on the context.
 * Use `c.get('auth')` in the handler. The handler app should be typed
 * with `new Hono<{ Variables: { auth: AuthContext } }>()`.
 */
export const requireCognitoAuth: MiddlewareHandler<{
  Variables: { auth: AuthContext };
}> = async (c, next) => {
  const header = c.req.header('authorization') || c.req.header('Authorization');
  const token = header?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const auth = await verifyCognitoToken(token);
  if (!auth) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  c.set('auth', auth);
  await next();
};
