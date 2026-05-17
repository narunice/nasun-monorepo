/**
 * Hono middleware: requires a valid `Authorization: Bearer <jwt>` minted by
 * routes/auth.ts. When AUTH_BIND_IP=true and the token carries a bind_ip
 * claim, also verifies the request client IP matches the issuer fingerprint.
 *
 * Exposes the verified wallet on `c.var.wallet` for downstream handlers.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { env } from '../../env.js';
import { hashIp, verifySession, type GostopJwtClaims } from './jwt.js';

export type AuthVars = {
  wallet: string;
  claims: GostopJwtClaims;
};

/**
 * Extract client IP, honoring reverse-proxy headers we trust (nginx on
 * node-3 / prod EC2 sets x-forwarded-for). Falls back to socket address.
 */
export function clientIp(c: Context): string | null {
  const xff = c.req.header('x-forwarded-for');
  if (xff) {
    // x-forwarded-for: client, proxy1, proxy2  — first is the real client.
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  // Hono on @hono/node-server exposes remote addr via env (varies by adapter).
  // Without a guaranteed source we return null and let bind-ip skip checking.
  return null;
}

export const requireAuth: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const header = c.req.header('authorization') ?? c.req.header('Authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return c.json({ error: 'unauthorized', reason: 'missing_token' }, 401);
  }
  const token = header.slice(7).trim();
  if (!token) {
    return c.json({ error: 'unauthorized', reason: 'missing_token' }, 401);
  }

  let claims: GostopJwtClaims;
  try {
    claims = await verifySession(token);
  } catch {
    return c.json({ error: 'unauthorized', reason: 'invalid_token' }, 401);
  }

  if (env.auth.bindIp && claims.bind_ip) {
    const ip = clientIp(c);
    if (!ip || hashIp(ip) !== claims.bind_ip) {
      return c.json({ error: 'unauthorized', reason: 'ip_mismatch' }, 401);
    }
  }

  if (typeof claims.wallet !== 'string' || claims.wallet.length === 0) {
    return c.json({ error: 'unauthorized', reason: 'malformed_claims' }, 401);
  }

  c.set('wallet', claims.wallet);
  c.set('claims', claims);
  await next();
};
