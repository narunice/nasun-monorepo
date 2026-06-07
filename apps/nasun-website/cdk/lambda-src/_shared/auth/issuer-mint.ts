/**
 * Issuer mint client (AWS-exit grace window, Stage 2 §A.3).
 *
 * Drop-in for the Cognito GetOpenIdTokenForDeveloperIdentity call the login lambdas make: the
 * self-hosted issuer's `POST /mint` takes the same { developerUserIdentifier, provider } and returns
 * { identityId, token }. During the grace window the login lambdas stay on AWS but mint identity
 * tokens from the issuer (Hetzner) instead of Cognito, so points/leaderboard keyed on identityId stay
 * continuous: the issuer looks the identifier up in issuer.identity_map, seeded from the Stage 1
 * Cognito export, which stored the same raw developer identifiers (nasun_/metamask_{addr}).
 *
 * Grace toggle: active only when ISSUER_MINT_URL is set. While it is unset (pre-cutover) the lambdas
 * keep using Cognito, so deploying this code is a no-op until the env var is wired at cutover, and
 * removing it rolls back. Pairs with _shared/auth/dual-jwks.ts on the verify side (both speak the same
 * nasun-issuer tokens).
 */

import { issuerPost } from './issuer-client';

export interface IssuerMintResult {
  identityId: string;
  token: string;
}

/** True when the self-hosted issuer is wired; the login lambdas should mint there instead of Cognito. */
export function isIssuerMintEnabled(): boolean {
  return !!process.env.ISSUER_MINT_URL;
}

/**
 * Mint an identity token from the self-hosted issuer. Throws on any failure so the caller falls into
 * the same "auth failed" path it already uses for Cognito errors. Only call when isIssuerMintEnabled().
 *
 * @param developerUserIdentifier the legacy Cognito developer identifier (e.g. `nasun_<addr>`), which
 *   is also the lookup key in issuer.identity_map and must match the Stage 1 export exactly.
 * @param provider auth method recorded for first-seen identities (e.g. 'sui', 'metamask').
 */
export async function mintViaIssuer(
  developerUserIdentifier: string,
  provider: string
): Promise<IssuerMintResult> {
  const url = process.env.ISSUER_MINT_URL;
  if (!url) throw new Error('ISSUER_MINT_URL is not set');

  const data = await issuerPost<Partial<IssuerMintResult>>(url, { developerUserIdentifier, provider });
  if (typeof data.identityId !== 'string' || typeof data.token !== 'string') {
    throw new Error('issuer mint returned an incomplete response');
  }
  return { identityId: data.identityId, token: data.token };
}
