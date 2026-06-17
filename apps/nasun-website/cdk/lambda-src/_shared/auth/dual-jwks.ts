/**
 * Identity-token verification for the self-hosted nasun issuer (iss: nasun-issuer).
 *
 * Post AWS-exit cutover: every login path mints issuer tokens (`sub = identityId`, `aud` = the legacy
 * Cognito Identity Pool id kept as the audience string for identityId continuity). The legacy
 * Cognito-token branch was dropped after residual Cognito tokens (24h TTL) had expired; tokens with
 * any other issuer are now rejected as unknown.
 *
 * Routing reads the (unverified) `iss` claim, then jwtVerify enforces issuer + audience + signature
 * against the issuer JWKS, so a forged `iss` only selects a key set that rejects the forged signature.
 *
 * Two entry points: verifyIdentityId (never throws, returns sub|undefined) for the simple call sites,
 * and verifyIdentityPayload (throws jose errors, preserving codes like ERR_JWT_EXPIRED) for the few
 * sites that differentiate error messages to the client. All verify sites delegate here instead of
 * copy-pasting the JWKS singleton + jwtVerify block.
 */

import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from 'jose';

const NASUN_ISS = process.env.NASUN_ISSUER_ID || 'nasun-issuer';
const NASUN_JWKS_URL = process.env.NASUN_ISSUER_JWKS_URL; // public URL of the nasun issuer's JWKS
const AUDIENCE = process.env.COGNITO_IDENTITY_POOL_ID;    // identityId audience string (continuity; not a live pool)

// JWKS fetcher is a lazy module-scope singleton (cached across Lambda invocations).
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
