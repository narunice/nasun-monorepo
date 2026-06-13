// Incoming-JWT identity verification for the box compute service (C4+: additional-wallet, telegram,
// governance). Port of the lambda `_shared/auth/dual-jwks.ts`: during the AWS-exit grace window two
// identity-token kinds coexist -- legacy Cognito (iss https://cognito-identity.amazonaws.com) and the
// self-hosted nasun issuer (iss nasun-issuer). Both mint sub=identityId, so a caller resolves the SAME
// identityId regardless of which credential the user logged in with. Routing is by the (unverified)
// `iss` claim, then jwtVerify enforces issuer + audience + signature, so a forged `iss` only selects a
// key set that rejects the forged signature.
//
// Box specifics vs the lambda:
//   - nasun JWKS is fetched over LOOPBACK (http://127.0.0.1:3210/.well-known/jwks.json) -> NO egress
//     for the nasun branch. The Cognito branch fetches cognito-identity.amazonaws.com (egress, allowed
//     since the C8 unit relaxation).
//   - jwks fetches are timed (AbortSignal) since this is a long-lived process, not a per-invoke lambda.

import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from 'jose';
import { VERIFY } from './config';

const COGNITO_ISS = 'https://cognito-identity.amazonaws.com';
const COGNITO_JWKS_URI = `${COGNITO_ISS}/.well-known/jwks_uri`;

// Lazy module-scope singletons (cached across requests; createRemoteJWKSet caches keys internally).
let cognitoJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getCognitoJwks() {
  if (!cognitoJwks) {
    cognitoJwks = createRemoteJWKSet(new URL(COGNITO_JWKS_URI), {
      timeoutDuration: VERIFY.jwksTimeoutMs,
    });
  }
  return cognitoJwks;
}

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

  if (iss === COGNITO_ISS) {
    const { payload } = await jwtVerify(token, getCognitoJwks(), {
      issuer: COGNITO_ISS,
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
