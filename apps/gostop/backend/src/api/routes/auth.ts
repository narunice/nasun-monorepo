/**
 * Auth routes:
 *   POST /api/gostop/auth/challenge      -> { challenge }
 *   POST /api/gostop/auth/verify         -> { token, expires_in }
 *
 * Flow:
 *   1. Client POSTs nothing to /challenge; server returns a one-time string.
 *   2. Client signs the challenge with their Sui wallet (personal_sign).
 *   3. Client POSTs { challenge, signature, wallet } to /verify; on success
 *      receives a Bearer JWT (1h TTL, optionally IP-bound).
 */

import { Hono } from 'hono';
import { generateChallenge, verifyChallengeSignature } from '../auth/wallet-sig.js';
import { signSession } from '../auth/jwt.js';
import { clientIp } from '../auth/middleware.js';
import { env } from '../../env.js';

export const authRoutes = new Hono();

authRoutes.post('/challenge', (c) => {
  const challenge = generateChallenge();
  if (!challenge) {
    return c.json({ error: 'challenge_capacity' }, 503);
  }
  return c.json({ challenge });
});

authRoutes.post('/verify', async (c) => {
  let body: { challenge?: unknown; signature?: unknown; wallet?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', reason: 'invalid_json' }, 400);
  }
  const { challenge, signature, wallet } = body;
  if (typeof challenge !== 'string' || typeof signature !== 'string' || typeof wallet !== 'string') {
    return c.json({ error: 'bad_request', reason: 'missing_fields' }, 400);
  }

  const result = await verifyChallengeSignature(challenge, signature, wallet);
  if (!result.ok) {
    return c.json({ error: 'unauthorized', reason: result.reason }, 401);
  }

  const ip = env.auth.bindIp ? clientIp(c) : null;
  const token = await signSession(result.address, ip);
  return c.json({ token, expires_in: env.auth.ttlSeconds });
});
