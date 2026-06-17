/**
 * Identity-token verification for the self-hosted nasun issuer (iss: nasun-issuer).
 *
 * Post AWS-exit cutover the explorer-api accepts only issuer-signed tokens
 * (`sub = identityId`, `aud` = the legacy Cognito Identity Pool id kept as the
 * audience string for identityId continuity). This mirrors the CDK lambda helper
 * apps/nasun-website/cdk/lambda-src/_shared/auth/dual-jwks.ts so node-3 accepts
 * the same tokens the API Gateway lambdas do; without it, issuer-signed logins
 * get 401 on /ecosystem/* and users see 0 points (2026-06-08 incident). The
 * legacy Cognito branch was dropped after residual Cognito tokens (24h TTL)
 * expired; tokens with any other issuer are now rejected.
 *
 * Routing reads the (unverified) `iss` claim; jwtVerify then enforces issuer,
 * audience, and signature against the issuer JWKS, so a forged `iss` only
 * selects a key set that rejects the forged signature.
 *
 * Note: we do NOT pin `algorithms`. The issuer JWKS advertises its keys' `alg`
 * (RS256) and jose refuses any alg not advertised by the matching JWK, so the
 * JWKS itself is the algorithm allowlist.
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

const NASUN_ISS = process.env.NASUN_ISSUER_ID || 'nasun-issuer';
const NASUN_JWKS_URL = process.env.NASUN_ISSUER_JWKS_URL; // required: the issuer JWKS URL

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
    if (iss !== NASUN_ISS) return null; // unknown / legacy issuer (only nasun-issuer accepted post-cutover)

    const jwks = getNasunJwks();
    if (!jwks) return null; // NASUN_ISSUER_JWKS_URL not wired
    // jose accepts a string[] for audience: the claim must match ANY entry.
    const { payload } = await jwtVerify(token, jwks, {
      issuer: NASUN_ISS,
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
