// P1 Google de-Cognito login handler. Replaces the browser-side Cognito federated GetId /
// GetOpenIdToken (frontend features/auth/utils/cognito.ts) with a server-side verify-then-mint:
//   1. verify the Google OIDC id_token the frontend already obtains from the implicit flow
//      (response_type=id_token) -- signature (Google JWKS), issuer, audience, expiry;
//   2. mint the user's identityId + nasun-issuer session JWT via the loopback issuer /mint, keyed on
//      developerUserIdentifier "google:<sub>" so existing Google users (identity_map seeded from the
//      Stage-1 Cognito export) resolve their ORIGINAL identityId; first-seen subs mint ap-northeast-2:<uuid>.
//
// ★ Audience is verified MANDATORY (config.GOOGLE.clientId). The SALT route may skip aud (it only returns
// a per-(provider,sub) salt, not a credential), but a login issues a session token: a Google id_token
// minted for any OTHER client_id, if accepted, could be replayed to log in as its subject. jose's
// jwtVerify rejects sig/iss/aud/exp failures uniformly, so the handler never reveals which check failed.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GOOGLE } from './config';
import { mintIdentity } from './clients';
import { RouteAbort } from './http';

// Google issues id_token `iss` as EITHER the https URL or the schemeless host (both are canonical per
// Google's OIDC discovery); accept both so a schemeless token does not self-inflict a login 401.
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];

// JWKS is cached + auto kid-resolved by jose across the long-lived process (no per-call refetch). The
// fetch is timed so a wedged googleapis socket cannot hang the route (parity with SALT.egressTimeoutMs).
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: GOOGLE.egressTimeoutMs,
});

interface Result {
  status: number;
  body: Record<string, unknown>;
}

export async function handleGoogleLogin(body: any): Promise<Result> {
  const idToken = typeof body?.idToken === 'string' ? body.idToken : '';
  if (!idToken) throw new RouteAbort(400, { message: 'idToken is required' });

  // ★ Defense-in-depth: refuse to verify without a configured audience. jose treats audience:'' as
  // "skip the aud VALUE check" (an empty string is falsy), which would turn this login into a
  // token-audience-confusion bypass. The route gate (GOOGLE.enabled) already requires clientId, so this
  // only fires if the handler is reached out-of-band -- it must fail closed, never verify with no aud.
  if (!GOOGLE.clientId) throw new RouteAbort(503, { message: 'google login compute not enabled' });

  let sub: string;
  let email = '';
  let name = '';
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISS,
      audience: GOOGLE.clientId,
    });
    sub = typeof payload.sub === 'string' ? payload.sub : '';
    // Only surface a Google-attested email: the claim is meaningful solely when email_verified is true.
    if (payload.email_verified === true && typeof payload.email === 'string') email = payload.email;
    if (typeof payload.name === 'string') name = payload.name;
  } catch {
    // Bad signature / wrong issuer / wrong audience / expired -- all auth failures, undistinguished.
    throw new RouteAbort(401, { message: 'invalid Google credential' });
  }
  if (!sub) throw new RouteAbort(401, { message: 'invalid Google credential' });

  // Mint via the issuer (loopback). Throws -> 500 (auth-failed parity with the sui/metamask finishLogin).
  const { identityId, token } = await mintIdentity(`google:${sub}`, 'accounts.google.com');

  return { status: 200, body: { identityId, token, userInfo: { email, name } } };
}
