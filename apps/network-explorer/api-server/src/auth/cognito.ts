/**
 * Identity-token verification (dual-JWKS, AWS-exit grace window — Stage 2 §A.2).
 *
 * During the issuer cutover two kinds of identity tokens coexist:
 *   - legacy Cognito Identity tokens  (iss: https://cognito-identity.amazonaws.com)
 *   - self-hosted issuer tokens       (iss: nasun-issuer)
 * Both mint `sub = identityId` with the SAME Cognito Identity Pool id as `aud`
 * (re-key 0, audience continuity), so a caller resolves the same identityId
 * regardless of which credential the user logged in with. This mirrors the CDK
 * lambda helper apps/nasun-website/cdk/lambda-src/_shared/auth/dual-jwks.ts so
 * the node-3 explorer-api accepts the same tokens the API Gateway lambdas do.
 * Without this, post-cutover logins (issuer-signed) get 401 on /ecosystem/* and
 * users see 0 points (2026-06-08 incident).
 *
 * Routing is by the (unverified) `iss` claim; jwtVerify then enforces issuer,
 * audience, and signature against the matching JWKS, so a forged `iss` only
 * selects a key set that rejects the forged signature.
 *
 * Grace toggle: the nasun branch is active only when NASUN_ISSUER_JWKS_URL is
 * set. Unset = Cognito-only (previous behaviour), so this is additive; removing
 * the env var rolls back. After grace, drop the Cognito branch to finish cutover.
 *
 * Note: we do NOT pin `algorithms`. Each JWKS advertises its keys' `alg`
 * (Cognito: RS512; issuer: RS256) and jose refuses any alg not advertised by the
 * matching JWK, so the JWKS itself is the algorithm allowlist.
 */

import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import type { MiddlewareHandler } from 'hono';

// Accepts one or more Cognito Identity Pool IDs, comma-separated. The
// explorer-api is shared between staging and production frontends, which
// sign in against different Identity Pools, so both audiences must be
// accepted as valid for JWT verification. The self-hosted issuer mints with
// the prod pool id as `aud`, so it is covered by this same list.
const IDENTITY_POOL_IDS = (process.env.COGNITO_IDENTITY_POOL_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (IDENTITY_POOL_IDS.length === 0) {
  throw new Error('COGNITO_IDENTITY_POOL_ID environment variable is required');
}

const COGNITO_ISS = 'https://cognito-identity.amazonaws.com';
const NASUN_ISS = process.env.NASUN_ISSUER_ID || 'nasun-issuer';
const NASUN_JWKS_URL = process.env.NASUN_ISSUER_JWKS_URL; // grace toggle: unset = Cognito-only

let cognitoJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getCognitoJwks() {
  if (!cognitoJwks) {
    cognitoJwks = createRemoteJWKSet(new URL(`${COGNITO_ISS}/.well-known/jwks_uri`));
  }
  return cognitoJwks;
}

let nasunJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getNasunJwks() {
  if (!NASUN_JWKS_URL) return null;
  if (!nasunJwks) nasunJwks = createRemoteJWKSet(new URL(NASUN_JWKS_URL));
  return nasunJwks;
}

export interface AuthContext {
  identityId: string;
}

export async function verifyCognitoToken(token: string): Promise<AuthContext | null> {
  try {
    const iss = decodeJwt(token).iss; // throws on malformed token

    let payload;
    if (iss === NASUN_ISS) {
      const jwks = getNasunJwks();
      if (!jwks) return null; // issuer token received but grace branch not wired
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: NASUN_ISS,
        audience: IDENTITY_POOL_IDS,
      }));
    } else if (iss === COGNITO_ISS) {
      ({ payload } = await jwtVerify(token, getCognitoJwks(), {
        issuer: COGNITO_ISS,
        // jose accepts a string[] here: audience claim must match ANY entry.
        audience: IDENTITY_POOL_IDS,
      }));
    } else {
      return null; // unknown issuer
    }

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
