// Loopback clients for the two PROVEN sibling box endpoints C3a orchestrates, plus the wallet-proof
// HMAC. Both calls go to 127.0.0.1 (NO egress). They reproduce, byte-for-byte, the calls the login
// lambdas already make today (issuer-mint.ts -> issuer /mint; identity-write.ts authoritative ->
// nasun-identity /profile/upsert), so the box end-state is identical to the lambda path. The only
// difference from the lambda is that compute does NOT also write DynamoDB (the chosen (B) divergence).

import { createHmac } from 'node:crypto';
import { LOGIN } from './config';

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
