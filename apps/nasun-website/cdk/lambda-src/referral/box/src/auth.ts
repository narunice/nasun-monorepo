// Authentication for the box referral service.
//  - verifyIdentityFromBearer: the 5 USER routes (my-code/apply/my-stats/my-referees/appeal) -> identityId.
//    Ports _shared/auth/dual-jwks.ts (nasun-issuer JWT verified against the loopback issuer JWKS + audience),
//    same as the lambda TokenAuthorizer's verifyIdentityId.
//  - authenticateAdmin: the 4 ADMIN routes -> verify JWT + box user_profiles ADMIN role (compute_ro read).
//    Ports the leaderboard box auth.ts verbatim (attributes->>'role'='ADMIN').
//  - requireInternalApiKey: the 1 INTERNAL route (/internal/referral-mappings, consumed cross-host by the
//    node-3 explorer-api scanner) -> x-api-key timingSafeEqual. NOT loopback-only (cross-host caller).

import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { AUTH } from './config';
import { getAdminRole } from './db';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(AUTH.nasunJwksUrl));
  return jwks;
}

// Verify an Authorization header -> identityId (sub). Returns undefined on any failure (never throws). The
// lambda authorizer stripped an OPTIONAL "Bearer " prefix (authorizer/index.ts:43), so accept both forms.
// jwtVerify enforces issuer + audience + signature against the issuer JWKS, so a forged iss is rejected.
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
    console.error('[referral] JWT verify failed:', e instanceof Error ? e.message : e);
    return undefined;
  }
}

export interface AdminUser {
  identityId: string;
  email?: string;
  username?: string;
  role: string;
}

// Verify JWT + box ADMIN role. role/email/username live in user_profiles attributes jsonb (no promoted
// columns in the box mirror) -- parity with the leaderboard box auth.ts + the lambda verifyAdminRole.
export async function authenticateAdmin(authHeader: string | undefined): Promise<AdminUser | null> {
  const identityId = await verifyIdentityFromBearer(authHeader);
  if (!identityId) return null;
  const row = await getAdminRole(identityId);
  if (!row || row.role !== 'ADMIN') return null;
  return { identityId, email: row.email ?? undefined, username: row.username ?? undefined, role: 'ADMIN' };
}

// Constant-time x-api-key check (parity with the lambda requireInternalApiKey / export-whitelist timingSafeEqual).
export function checkInternalApiKey(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided || provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
