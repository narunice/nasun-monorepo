// Admin authentication for the box leaderboard write/admin handlers. Ports _shared/auth/dual-jwks.ts
// (verify the nasun-issuer JWT against the loopback issuer JWKS + identityId audience) + the lambda
// utils/admin-auth.ts admin-role check (box user_profiles attributes->>'role' = 'ADMIN').

import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import { AUTH } from './config';
import { sql } from './db';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(AUTH.nasunJwksUrl));
  return jwks;
}

// Verify a Bearer header -> identityId (sub). Returns undefined on any failure (never throws). The
// forged-iss path is safe: jwtVerify enforces issuer + audience + signature against the issuer JWKS.
export async function verifyIdentityFromBearer(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);
  try {
    if (!AUTH.audience) return undefined;
    const iss = decodeJwt(token).iss;
    if (iss !== AUTH.nasunIss) return undefined;
    const { payload } = await jwtVerify(token, getJwks(), { issuer: AUTH.nasunIss, audience: AUTH.audience });
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (e) {
    console.error('[leaderboard] JWT verify failed:', e instanceof Error ? e.message : e);
    return undefined;
  }
}

export interface AdminUser {
  identityId: string;
  email?: string;
  username?: string;
  role: string;
}

// Verify JWT + box ADMIN role (read via the compute_ro pool). role/email/username live in user_profiles
// attributes jsonb (no promoted columns for them in the box mirror).
export async function authenticateAdmin(authHeader: string | undefined): Promise<AdminUser | null> {
  const identityId = await verifyIdentityFromBearer(authHeader);
  if (!identityId) return null;
  const rows = await sql<{ role: string | null; email: string | null; username: string | null }[]>`
    SELECT attributes->>'role' AS role, attributes->>'email' AS email, attributes->>'username' AS username
    FROM user_profiles WHERE identity_id = ${identityId} LIMIT 1`;
  if (!rows.length || rows[0].role !== 'ADMIN') return null;
  return { identityId, email: rows[0].email ?? undefined, username: rows[0].username ?? undefined, role: 'ADMIN' };
}
