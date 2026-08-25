// Self-issued HS256 address-book JWT (sub=walletAddress). Ports the wallet-api lambda utils/auth.ts
// issueAddressBookToken / verifyAddressBookToken byte-for-byte (same issuer 'nasun-ab', audience
// 'address-book', 1h TTL, HS256), but the signing key is read from the systemd-credential (jwt-key) instead
// of generated/fetched from Secrets Manager. The key is the SAME addressBookJwtKey value ported from
// WALLET_PROOF_SECRET_NAME, so tokens issued by the live lambda remain valid across the cutover.
//
// This auth domain is COMPLETELY separate from the dual-jwks identity JWT (register/list/remove). No identity
// verification here.

import { jwtVerify, SignJWT } from 'jose';
import { addressBookJwtKey } from './config';

const AB_JWT_ISSUER = 'nasun-ab';
const AB_JWT_AUDIENCE = 'address-book';
const AB_JWT_TTL_SECONDS = 3600; // 1 hour

let cachedKey: Uint8Array | null = null;

// Lazy-load + cache the HS256 key. Returns null if the credential is not provisioned (service started inert
// without the key) -- callers then fail closed (verify -> undefined/401, issue -> throw/500).
function getKey(): Uint8Array | null {
  if (cachedKey) return cachedKey;
  const raw = addressBookJwtKey();
  if (!raw) return null;
  cachedKey = new TextEncoder().encode(raw);
  return cachedKey;
}

/**
 * Issue a short-lived address-book JWT. sub = walletAddress (NOT identityId).
 * @throws if the signing key is not provisioned.
 */
export async function issueAddressBookToken(walletAddress: string): Promise<string> {
  const key = getKey();
  if (!key) throw new Error('address-book JWT key not provisioned');
  return new SignJWT({ sub: walletAddress })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(AB_JWT_ISSUER)
    .setAudience(AB_JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${AB_JWT_TTL_SECONDS}s`)
    .sign(key);
}

/**
 * Verify an address-book JWT and extract walletAddress (sub). Returns undefined on any failure (fail closed).
 */
export async function verifyAddressBookToken(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);
  const key = getKey();
  if (!key) {
    console.error('[address-book-auth] JWT key not provisioned -- rejecting');
    return undefined;
  }
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: AB_JWT_ISSUER,
      audience: AB_JWT_AUDIENCE,
    });
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (error) {
    console.error('[address-book-auth] JWT verification failed:', error instanceof Error ? error.message : error);
    return undefined;
  }
}
