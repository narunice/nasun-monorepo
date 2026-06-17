// Incoming-JWT identity verification for the box compute service (C4+: additional-wallet, telegram,
// governance). Mirrors the lambda `_shared/auth/dual-jwks.ts`: post AWS-exit cutover only self-hosted
// nasun issuer tokens (iss nasun-issuer, sub=identityId) are accepted; the legacy Cognito branch was
// dropped after residual Cognito tokens (24h TTL) expired. Routing reads the (unverified) `iss` claim,
// then jwtVerify enforces issuer + audience + signature, so a forged `iss` only selects a key set that
// rejects the forged signature.
//
// Box specifics vs the lambda:
//   - nasun JWKS is fetched over LOOPBACK (http://127.0.0.1:3210/.well-known/jwks.json) -> NO egress.
//   - jwks fetches are timed (AbortSignal) since this is a long-lived process, not a per-invoke lambda.

import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from 'jose';
import { VERIFY } from './config';

// Lazy module-scope singleton (cached across requests; createRemoteJWKSet caches keys internally).
let nasunJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getNasunJwks() {
  if (!nasunJwks) {
    nasunJwks = createRemoteJWKSet(new URL(VERIFY.nasunJwksUrl), {
      timeoutDuration: VERIFY.jwksTimeoutMs,
    });
  }
  return nasunJwks;
}

/**
 * Verify a bare JWT (Bearer prefix already stripped), routing by issuer, returning the full payload.
 * THROWS on any failure (parity with the lambda's verifyIdentityPayload).
 */
async function verifyIdentityPayload(token: string): Promise<JWTPayload> {
  const iss = decodeJwt(token).iss; // throws on a malformed token

  if (iss === VERIFY.nasunIssuerId) {
    const { payload } = await jwtVerify(token, getNasunJwks(), {
      issuer: VERIFY.nasunIssuerId,
      audience: VERIFY.audience,
    });
    return payload;
  }

  throw new Error(`unknown issuer: ${iss}`);
}

/**
 * Verify a Bearer Authorization header and return the identityId (`sub`). Returns undefined on any
 * failure. NEVER throws (parity with the lambda's verifyIdentityFromBearer -> verifyJwtIdentity).
 */
export async function verifyJwtIdentity(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  try {
    const payload = await verifyIdentityPayload(authHeader.slice(7));
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (error) {
    console.error('[compute] JWT verification failed:', error instanceof Error ? error.message : error);
    return undefined;
  }
}
