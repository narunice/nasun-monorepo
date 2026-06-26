// Authentication for the box bug-report service.
//  - verifyIdentityFromBearer: the USER routes (submit / my-reports / upload-url / reply / creator-post
//    submit+my) -> identityId. Ports _shared/auth/dual-jwks.ts (nasun-issuer JWT verified against the loopback
//    issuer JWKS + audience), same as the lambda TokenAuthorizer's verifyIdentityId.
//  - authenticateAdmin: the ADMIN routes -> verify JWT + box user_profiles ADMIN role (compute_ro read).
//    Ports the referral/leaderboard box auth.ts (attributes->>'role'='ADMIN'), parity with the lambda
//    authenticateAdmin (UserProfiles role === 'ADMIN').

import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { AUTH, ADMIN_SERVICE_KEY } from './config';
import { getAdminRole } from './db';

// Constant-time match of the operator service key (the `x-internal-key` header) against the configured
// ADMIN_SERVICE_KEY. Returns false when the key is unset (fail-safe: the admin routes then require the
// dual-jwks JWT) or on any length/value mismatch. Length-guards before timingSafeEqual, which throws on
// unequal buffer lengths. This is an additive, scoped path -- the JWT + ADMIN-role check
// (authenticateAdmin) is unchanged and remains the only auth for the human admin UI.
export function serviceKeyMatches(provided: string | undefined): boolean {
  if (!provided || !ADMIN_SERVICE_KEY) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(ADMIN_SERVICE_KEY);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(AUTH.nasunJwksUrl));
  return jwks;
}

// Verify an Authorization header -> identityId (sub). Returns undefined on any failure (never throws). The
// lambda authorizer stripped an OPTIONAL "Bearer " prefix, so accept both forms. jwtVerify enforces issuer +
// audience + signature against the issuer JWKS, so a forged iss is rejected.
export async function verifyIdentityFromBearer(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader) return undefined;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return undefined;
  try {
    if (!AUTH.audience) return undefined;
    const iss = decodeJwt(token).iss;
    if (iss !== AUTH.nasunIss) return undefined;
    const { payload } = await jwtVerify(token, getJwks(), { issuer: AUTH.nasunIss, audience: AUTH.audience });
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (e) {
    console.error('[bug-report] JWT verify failed:', e instanceof Error ? e.message : e);
    return undefined;
  }
}

// Verify JWT + box ADMIN role. Returns the adminId (identityId) or null. role lives in user_profiles
// attributes jsonb (no promoted column in the box mirror).
export async function authenticateAdmin(authHeader: string | undefined): Promise<string | null> {
  const identityId = await verifyIdentityFromBearer(authHeader);
  if (!identityId) return null;
  const row = await getAdminRole(identityId);
  if (!row || row.role !== 'ADMIN') return null;
  return identityId;
}
