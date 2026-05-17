/**
 * JWT sign/verify with jose (HS256). Tier 0.3 design:
 *   - 1h TTL (gambling service, conservative)
 *   - Optional client IP binding via SHA256(ip + secret) claim; middleware
 *     rejects on mismatch when AUTH_BIND_IP=true.
 *   - `purpose: 'gostop-api'` audience tag — refuse tokens minted for any
 *     other surface even if secret leaks across services.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash } from 'node:crypto';
import { env } from '../../env.js';

const AUDIENCE = 'gostop-api';
const ISSUER = 'gostop-backend';

export type GostopJwtClaims = JWTPayload & {
  wallet: string;
  bind_ip?: string;          // hash of client IP at issue time, if AUTH_BIND_IP
};

function secretKey(): Uint8Array {
  const s = env.auth.jwtSecret;
  if (!s || s.length < 32) {
    throw new Error('[gostop-api] AUTH_JWT_SECRET missing or too short (>=32 bytes required)');
  }
  return new TextEncoder().encode(s);
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(env.auth.jwtSecret + ':' + ip).digest('hex').slice(0, 32);
}

export async function signSession(wallet: string, clientIp: string | null): Promise<string> {
  const claims: GostopJwtClaims = { wallet };
  if (env.auth.bindIp && clientIp) {
    claims.bind_ip = hashIp(clientIp);
  }
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.auth.ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<GostopJwtClaims> {
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return payload as GostopJwtClaims;
}
