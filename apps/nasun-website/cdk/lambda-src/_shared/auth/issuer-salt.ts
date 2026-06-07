/**
 * Issuer zkLogin-salt client (AWS-exit grace, Stage 2 §A; zklogin-salt PG-ization).
 *
 * The zklogin-salt lambda still verifies the OIDC JWT and derives the Sui address (jwtToAddress); this
 * client moves only the salt PERSISTENCE off DynamoDB onto the self-hosted issuer's `POST /zklogin/salt`
 * (append-only, keyed (provider, sub)). The same Google sub always resolves to the same stored salt, so
 * the derived address — and therefore the minted identity — stays continuous for existing zkLogin users
 * (the issuer.zklogin_users table is seeded from the Stage 1 export).
 *
 * Grace toggle: active only when ISSUER_SALT_URL is set; otherwise the lambda keeps using DynamoDB.
 * Authenticated with ISSUER_MINT_SECRET, the single shared bearer the issuer box accepts for all of its
 * lambda-facing endpoints (see issuer-client.ts).
 */

import { issuerPost } from './issuer-client';

export interface SaltResult {
  salt: string | null; // null => no salt stored yet for this (provider, sub); caller should create one
  address?: string;
  isNewUser?: boolean;
}

/** True when the self-hosted salt store is wired; the zklogin-salt lambda should use it instead of DynamoDB. */
export function isIssuerSaltEnabled(): boolean {
  return !!process.env.ISSUER_SALT_URL;
}

function saltUrl(): string {
  const url = process.env.ISSUER_SALT_URL;
  if (!url) throw new Error('ISSUER_SALT_URL is not set');
  return url;
}

// Enforce the box contract: a null salt means "not stored yet" (no address); a non-null salt MUST come
// with its derived address (issuer.zklogin_users.address is NOT NULL). Reject anything else loudly
// rather than letting an undefined address through to the zkLogin flow.
function validate(data: Partial<SaltResult>): SaltResult {
  if (data.salt === null) return { salt: null };
  if (typeof data.salt !== 'string' || typeof data.address !== 'string') {
    throw new Error('issuer salt returned an unexpected response');
  }
  return { salt: data.salt, address: data.address, isNewUser: data.isNewUser };
}

/** Look up an existing salt by (provider, sub). Returns { salt: null } when none is stored yet. */
export async function lookupSaltViaIssuer(provider: string, sub: string): Promise<SaltResult> {
  return validate(await issuerPost<Partial<SaltResult>>(saltUrl(), { provider, sub }));
}

/**
 * Create-if-absent: persist the caller's candidate salt+address for a first-seen (provider, sub) and
 * return the authoritative row. If a concurrent first-login already created one, that row wins
 * (isNewUser:false) and its salt/address are returned — the caller must use those, not its candidate.
 */
export async function createSaltViaIssuer(args: {
  provider: string;
  sub: string;
  salt: string;
  address: string;
  email?: string;
  name?: string;
  picture?: string;
}): Promise<SaltResult> {
  return validate(await issuerPost<Partial<SaltResult>>(saltUrl(), args));
}
