// Loopback clients for the two PROVEN sibling box endpoints C3a orchestrates, plus the wallet-proof
// HMAC. Both calls go to 127.0.0.1 (NO egress). They reproduce, byte-for-byte, the calls the login
// lambdas already make today (issuer-mint.ts -> issuer /mint; identity-write.ts authoritative ->
// nasun-identity /profile/upsert), so the box end-state is identical to the lambda path. The only
// difference from the lambda is that compute does NOT also write DynamoDB (the chosen (B) divergence).

import { createHmac } from 'node:crypto';
import { LOGIN, SALT } from './config';

export interface MintResult {
  identityId: string;
  token: string;
}

/**
 * Mint an identity token from the self-hosted issuer (loopback /mint). Parity with
 * _shared/auth/issuer-mint.ts mintViaIssuer: POST { developerUserIdentifier, provider } -> { identityId,
 * token }. THROWS on any failure (the caller maps it to an auth-failed response).
 */
export async function mintIdentity(developerUserIdentifier: string, provider: string): Promise<MintResult> {
  const res = await fetch(LOGIN.issuerMintUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${LOGIN.issuerMintBearer}` },
    body: JSON.stringify({ developerUserIdentifier, provider }),
    signal: AbortSignal.timeout(LOGIN.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`issuer /mint returned HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as Partial<MintResult> | null;
  if (!data || typeof data.identityId !== 'string' || typeof data.token !== 'string') {
    throw new Error('issuer /mint returned an incomplete response');
  }
  return { identityId: data.identityId, token: data.token };
}

/**
 * Upsert the profile to the box PG via nasun-identity (loopback /profile/upsert). Parity with
 * identity-write.ts authoritativeIdentityWrite(IDENTITY_ROUTES.profileUpsert): POST { identityId,
 * walletAddress, provider }. THROWS on failure so the login surfaces a 500 rather than silently
 * diverging the SoT. /profile/upsert is the SAME authoritative endpoint the login lambdas hit today;
 * it is idempotent (full-row UPSERT that preserves existing columns on conflict), so a retry is safe.
 */
export async function upsertProfile(
  identityId: string,
  walletAddress: string,
  provider: string,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(LOGIN.identityUpsertUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${LOGIN.identityWriteBearer}` },
        body: JSON.stringify({ identityId, walletAddress, provider }),
        signal: AbortSignal.timeout(LOGIN.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`identity /profile/upsert returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * HMAC wallet proof, parity with the login lambdas (createHmac('sha256', secret).update(
 * `${walletAddress}:${proofIssuedAt}`)). Battalion NFT register-user validates this.
 */
export function walletProof(walletAddress: string, proofIssuedAt: string): string {
  return createHmac('sha256', LOGIN.walletProofSecret).update(`${walletAddress}:${proofIssuedAt}`).digest('hex');
}

// --- C8 zklogin-salt store (loopback to the box issuer /zklogin/salt; NO egress) ------------------
// Parity with _shared/auth/issuer-salt.ts (the prod-live lambda client): the box issuer is the
// authoritative, append-only salt store keyed by (provider, sub). lookup posts {provider, sub} and
// returns {salt:null} when none is stored yet; create posts {provider, sub, salt, address, ...} and
// returns the authoritative row (a concurrent first-login may win -> isNewUser:false + its salt/address,
// which the caller MUST use, not its candidate). Authenticated with the shared issuer-mint bearer (the
// issuer accepts one bearer for all lambda-facing endpoints, issuer-salt.ts:11-12).

export interface SaltResult {
  salt: string | null;
  address?: string;
  isNewUser?: boolean;
}

// Enforce the box contract (issuer-salt.ts:37-43): salt:null => not stored (no address); a non-null
// salt MUST carry a string address (issuer.zklogin_users.address is NOT NULL). Reject anything else
// loudly rather than letting an undefined address through to the zkLogin flow.
function validateSalt(data: Partial<SaltResult> | null): SaltResult {
  if (!data) throw new Error('issuer /zklogin/salt returned an empty response');
  if (data.salt === null) return { salt: null };
  if (typeof data.salt !== 'string' || typeof data.address !== 'string') {
    throw new Error('issuer /zklogin/salt returned an unexpected response');
  }
  return { salt: data.salt, address: data.address, isNewUser: data.isNewUser };
}

async function saltPost(payload: Record<string, unknown>): Promise<SaltResult> {
  const res = await fetch(SALT.issuerSaltUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${SALT.issuerMintBearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SALT.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`issuer /zklogin/salt returned HTTP ${res.status}`);
  return validateSalt((await res.json().catch(() => null)) as Partial<SaltResult> | null);
}

/** Look up an existing salt by (provider, sub). Returns { salt: null } when none is stored yet. */
export function saltLookup(provider: string, sub: string): Promise<SaltResult> {
  return saltPost({ provider, sub });
}

/** Create-if-absent: persist the candidate salt+address for a first-seen (provider, sub). */
export function saltCreate(args: {
  provider: string;
  sub: string;
  salt: string;
  address: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<SaltResult> {
  return saltPost(args);
}
