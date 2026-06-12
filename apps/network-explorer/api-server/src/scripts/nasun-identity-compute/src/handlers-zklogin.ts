// C8 zklogin-salt handler: POST /auth/zklogin/salt. Ported verbatim from the zklogin-salt lambda's
// handleGetSalt ISSUER-SALT branch (zklogin-salt/src/index.ts:151-193,300-304). The DynamoDB branch is
// intentionally NOT ported: ISSUER_SALT_URL is set in prod (salt persistence already on the box issuer)
// and the box has no DynamoDB access -- so the box always takes the issuer path. Differences from the
// lambda (all intentional): salt persistence over LOOPBACK issuer (clients.saltLookup/saltCreate) and
// the only external call is the Google JWKS fetch (egress).
//
// Parity notes:
//   - verifyJwt: same Google OIDC verification (kid lookup -> importJWK -> jwtVerify issuer
//     accounts.google.com -> ALLOWED_AUD check, empty in prod => skipped).
//   - salt/address are immutable per (provider, sub): the same Google sub always derives the same Sui
//     address, so existing zkLogin users are not orphaned.
//   - error handling mirrors the lambda's broad catch: ANY failure -> 400 { error: message } (this
//     preserves the lambda's status/body for failed JWT verification, the common client-error case).

import { importJWK, jwtVerify, type JWK } from 'jose';
import { randomBytes } from 'node:crypto';
import { jwtToAddress } from '@mysten/sui/zklogin';
import { saltLookup, saltCreate } from './clients';
import { SALT } from './config';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

interface JwtPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  email?: string;
  name?: string;
  picture?: string;
}

interface Result {
  status: number;
  body: Record<string, unknown>;
}

// Verify a Google OIDC JWT (zklogin-salt/src/index.ts:97-127, verbatim).
async function verifyJwt(jwt: string): Promise<JwtPayload> {
  const [headerB64] = jwt.split('.');
  const headerJson = Buffer.from(headerB64, 'base64url').toString();
  const header = JSON.parse(headerJson) as { kid: string; alg: string };

  // The ONLY external (egress) call. Timed (config.SALT.egressTimeoutMs) -- unlike the lambda's untimed
  // per-invoke fetch, the long-lived box process must not let a wedged googleapis socket hang the route.
  const jwksResponse = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(SALT.egressTimeoutMs) });
  const jwks = (await jwksResponse.json()) as { keys: JWK[] };

  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) {
    throw new Error('Invalid JWT: Key not found in JWKS');
  }

  const publicKey = await importJWK(key, header.alg);
  const { payload } = await jwtVerify(jwt, publicKey, {
    issuer: 'https://accounts.google.com',
  });

  if (SALT.allowedAud.length > 0 && !SALT.allowedAud.includes(payload.aud as string)) {
    throw new Error('Invalid JWT: Audience mismatch');
  }

  return payload as unknown as JwtPayload;
}

// 16 random bytes -> BigInt decimal string (zkLogin-compatible) -- index.ts:133-137.
function generateSalt(): string {
  const hexSalt = randomBytes(16).toString('hex');
  return BigInt('0x' + hexSalt).toString();
}

// jwtToAddress handles BigInt correctly, preventing string-type ambiguity -- index.ts:143-146.
function deriveSuiAddress(jwt: string, salt: string): string {
  return jwtToAddress(jwt, BigInt(salt));
}

export async function handleZkLoginSalt(jwt: string): Promise<Result> {
  try {
    const payload = await verifyJwt(jwt);
    const { sub, email, name, picture, iss } = payload;

    let provider = 'unknown';
    if (iss.includes('google')) provider = 'google';
    else if (iss.includes('apple')) provider = 'apple';
    else if (iss.includes('twitch')) provider = 'twitch';

    const found = await saltLookup(provider, sub);
    if (found.salt !== null) {
      return {
        status: 200,
        body: { salt: found.salt, address: found.address, isNewUser: false, provider, email, name, picture },
      };
    }

    // First-seen: generate a salt, derive the address, persist (create-if-absent). A concurrent
    // first-login may win -> use the returned authoritative salt/address, not the candidate.
    const salt = generateSalt();
    const address = deriveSuiAddress(jwt, salt);
    const created = await saltCreate({ provider, sub, salt, address, email, name, picture });
    return {
      status: 200,
      body: {
        salt: created.salt,
        address: created.address,
        isNewUser: created.isNewUser ?? true,
        provider,
        email,
        name,
        picture,
      },
    };
  } catch (err) {
    console.error('[compute] handleZkLoginSalt failed:', err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return { status: 400, body: { error: message } };
  }
}
