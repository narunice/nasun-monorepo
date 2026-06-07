/**
 * Dual-JWKS identity-token verification (AWS-exit grace window, Stage 2 §A.2).
 *
 * During the migration grace window two kinds of identity tokens coexist:
 *   - legacy Cognito Identity tokens  (iss: https://cognito-identity.amazonaws.com)
 *   - new self-hosted issuer tokens    (iss: nasun-issuer)
 * Both mint `sub = identityId` (re-key 0), so a caller resolves the SAME identityId regardless of
 * which credential the user logged in with.
 *
 * Routing is by the (unverified) `iss` claim, then the token is cryptographically verified against
 * the matching JWKS with the expected issuer + audience. Reading `iss` before verification is safe:
 * the subsequent jwtVerify enforces issuer, audience, and signature, so a forged `iss` only selects a
 * key set that will reject the forged signature.
 *
 * Grace toggle: the nasun branch is active only when NASUN_ISSUER_JWKS_URL is set. While it is unset
 * (pre-cutover) this helper is equivalent to the previous Cognito-only verification, so deploying it is
 * a no-op until the env var is wired at cutover, and removing the env var rolls back. After the grace
 * window, drop the cognito branch (or its env) to finish the cutover.
 *
 * Two entry points: verifyIdentityId (never throws, returns sub|undefined) for the simple call sites,
 * and verifyIdentityPayload (throws jose errors, preserving codes like ERR_JWT_EXPIRED) for the few
 * sites that differentiate error messages to the client. All 14 verify sites delegate here instead of
 * copy-pasting the JWKS singleton + jwtVerify block.
 */

import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from 'jose';

const COGNITO_ISS = 'https://cognito-identity.amazonaws.com';
const COGNITO_JWKS_URI = `${COGNITO_ISS}/.well-known/jwks_uri`;

const NASUN_ISS = process.env.NASUN_ISSUER_ID || 'nasun-issuer';
const NASUN_JWKS_URL = process.env.NASUN_ISSUER_JWKS_URL; // public URL of the nasun issuer's JWKS (cutover)
const AUDIENCE = process.env.COGNITO_IDENTITY_POOL_ID;    // shared aud for both issuers (continuity)

// JWKS fetchers are lazy module-scope singletons (cached across Lambda invocations).
let cognitoJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getCognitoJwks() {
  if (!cognitoJwks) cognitoJwks = createRemoteJWKSet(new URL(COGNITO_JWKS_URI));
  return cognitoJwks;
}

let nasunJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getNasunJwks() {
  if (!NASUN_JWKS_URL) return null;
  if (!nasunJwks) nasunJwks = createRemoteJWKSet(new URL(NASUN_JWKS_URL));
  return nasunJwks;
}

/**
 * Verify a bare JWT (Bearer prefix already stripped), routing by issuer, and return the full payload.
 * THROWS on any failure, preserving jose error codes (e.g. ERR_JWT_EXPIRED) for callers that map them
 * to client-facing messages.
 */
export async function verifyIdentityPayload(token: string): Promise<JWTPayload> {
  if (!AUDIENCE) throw new Error('COGNITO_IDENTITY_POOL_ID is not set');

  const iss = decodeJwt(token).iss; // throws on malformed token

  if (iss === NASUN_ISS) {
    const jwks = getNasunJwks();
    if (!jwks) throw new Error('nasun-issuer token received but NASUN_ISSUER_JWKS_URL is unset');
    const { payload } = await jwtVerify(token, jwks, { issuer: NASUN_ISS, audience: AUDIENCE });
    return payload;
  }

  if (iss === COGNITO_ISS) {
    const { payload } = await jwtVerify(token, getCognitoJwks(), { issuer: COGNITO_ISS, audience: AUDIENCE });
    return payload;
  }

  throw new Error(`unknown issuer: ${iss}`);
}

/**
 * Verify a bare JWT and return the identityId (`sub`). Returns undefined on any failure. Never throws.
 */
export async function verifyIdentityId(token: string): Promise<string | undefined> {
  try {
    const payload = await verifyIdentityPayload(token);
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (error) {
    console.error('[dual-jwks] JWT verification failed:', error instanceof Error ? error.message : error);
    return undefined;
  }
}

/**
 * Verify a Bearer Authorization header and return the identityId (`sub`). Returns undefined on failure.
 * Convenience wrapper over verifyIdentityId for the handler-style call sites.
 */
export async function verifyIdentityFromBearer(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  return verifyIdentityId(authHeader.slice(7));
}
