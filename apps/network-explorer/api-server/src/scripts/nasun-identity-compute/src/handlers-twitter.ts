// Twitter (X) OAuth de-Lambda login compute. Lifts the auth-twitter lambda (login + callback) off
// API Gateway onto the box compute (:3212). Two routes:
//   GET  /auth/twitter/login    -- PKCE init: generate verifier/challenge/state, store the OAuth session
//                                  in-memory, return the X authorize URL (or a 302 to it for mode=redirect).
//   POST /auth/twitter/callback -- exchange the auth code, fetch the X user, mint the identity via the box
//                                  issuer, and (for an existing profile) refresh the promoted twitter
//                                  columns + xHistory via the box :3211 /profile/twitter-primary route.
//
// ★ This is an X-LINKING flow, not a primary login (the legacy Twitter login model is deprecated; X is
// linked from my-account, project_twitter_oauth_legacy). The callback's existing-profile branch refreshes
// an already-existing profile; the no-profile branch deliberately does NOT create one (parity: frontend
// ensureUserProfile creates it during the linking flow). The mint still runs so the caller gets the
// identityId/token keyed on twitter_<id> (the byte-exact issuer.identity_map key).
//
// ★ Box is SoT (the (B) divergence): the callback writes ONLY box PG (via /profile/twitter-primary, which
// is ALREADY authoritative-live -- IDENTITY_WRITE_FLIP_ROUTES includes /profile/twitter-primary on the live
// auth-twitter lambda). The parallel DynamoDB UpdateItem + the non-idempotent DynamoDB xHistory list_append
// are dropped. The DDB list_append's retry-trap (callback.ts:223-227) DOES NOT carry over: the callback is
// guarded against replay by (1) the atomic session get+delete and (2) the single-use OAuth code, so a full
// retry fails early (no session / code already used) and never re-reaches the xHistory append. The box
// route's own changedAt-dedup guard additionally covers the internal twitterPrimaryBox retry (same entry
// object -> same changedAt -> no double-append).
//
// ★ The NFT-event X-token store (callback.ts:287-305, battalionNft branch) is DROPPED: the Battalion event
// is concluded -- the live frontend no longer sends battalionNft:true, AND its only consumer Lambda
// (nasun-nft-verify-eligibility) is not deployed in the prod account (ResourceNotFound as of 2026-06; the
// CDK NftEventStack still DEFINES it but it is part of the AWS-exit teardown), so the write currently has no
// reader. ★ If the Battalion verification flow is ever revived, this X-token store has NO box equivalent and
// must be re-added (the Tier-3 user-context fallback reads nasun-nft-event-tasks PK=__X_TOKEN_STORE__).
//
// Onboarding-bonus (x-link) is delegated to explorer-api (the box cannot read the nasun-referrals DDB gate),
// reusing the SAME grantOnboardingBonus client the box link-account flow uses (requireReferralActivated=true
// server-side). Best-effort, never blocks (parity with the lambda's grantIfReferralActivated().catch).

import { createHash, randomBytes } from 'node:crypto';
import { TWITTER, ALLOWED_ORIGINS } from './config';
import { RouteAbort } from './http';
import { putSession, consumeSession } from './twitter-session-store';
import {
  mintIdentity,
  readProfileByIdentityRaw,
  twitterPrimaryBox,
  grantOnboardingBonus,
} from './clients';

interface TwitterTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface TwitterUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  verified?: boolean;
}

// X (Twitter) API error carrying the HTTP status, so the callback can map a 401 from the token/user
// endpoints to a 401 response (parity with the lambda's `error.response?.status === 401` branch), and any
// other failure to a 500. Mirrors the TelegramApiError pattern in clients.ts.
class TwitterApiError extends Error {
  constructor(public readonly httpStatus: number, public readonly body: string) {
    super(`X API error: ${httpStatus}`);
    this.name = 'TwitterApiError';
  }
}

// --- PKCE (byte-parity with auth-twitter/src/utils/pkce.ts) ---------------------------------------
function generateCodeVerifier(length = 128): string {
  return randomBytes(Math.ceil((length * 3) / 4))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, length);
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const generateState = (): string => randomBytes(32).toString('hex');
const generateSessionId = (): string => randomBytes(16).toString('hex');

// Extract protocol+host from a raw Origin/Referer value that may include a path (byte-parity with
// login.ts extractOrigin: the Referer header carries a full URL with a path).
function extractOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return raw.replace(/\/$/, '').split('/callback')[0];
  }
}

// --- X API egress (byte-parity with auth-twitter/src/utils/twitter-api.ts, axios -> fetch) --------
async function exchangeCodeForToken(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<TwitterTokenResponse> {
  const credentials = Buffer.from(`${TWITTER.clientId}:${TWITTER.clientSecret}`).toString('base64');
  const res = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: TWITTER.clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }).toString(),
    signal: AbortSignal.timeout(TWITTER.egressTimeoutMs),
  });
  if (!res.ok) throw new TwitterApiError(res.status, await res.text().catch(() => ''));
  const data = (await res.json().catch(() => null)) as TwitterTokenResponse | null;
  if (!data || typeof data.access_token !== 'string') {
    throw new Error('X token endpoint returned no access_token');
  }
  return data;
}

async function getUserInfo(accessToken: string): Promise<TwitterUser> {
  const url = new URL('https://api.x.com/2/users/me');
  url.searchParams.set('user.fields', 'id,name,username,profile_image_url,verified');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TWITTER.egressTimeoutMs),
  });
  if (!res.ok) throw new TwitterApiError(res.status, await res.text().catch(() => ''));
  const data = (await res.json().catch(() => null)) as { data?: TwitterUser } | null;
  const u = data?.data;
  if (!u || typeof u.id !== 'string' || typeof u.username !== 'string' || typeof u.name !== 'string') {
    throw new Error('X users/me returned an incomplete user');
  }
  return u;
}

function generateAuthUrl(
  redirectUri: string,
  codeChallenge: string,
  state: string,
  scopes: string[],
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: TWITTER.clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

// --- GET /auth/twitter/login ----------------------------------------------------------------------
// originCandidate is the resolved Origin OR Referer (the lambda derives the redirectUri from either;
// the Referer carries a full URL with a path, hence extractOrigin). Returns a 302 (mode=redirect) or a
// 200 JSON envelope. Throws RouteAbort(400) on a non-allow-listed origin (parity with login.ts:70-80).
export async function handleTwitterLogin(opts: {
  originCandidate?: string;
  mode?: string;
}): Promise<{ status: number; body?: Record<string, unknown>; location?: string }> {
  let redirectUri = TWITTER.defaultRedirectUri;
  if (opts.originCandidate) {
    const baseUrl = extractOrigin(opts.originCandidate);
    if (!ALLOWED_ORIGINS.includes(baseUrl)) {
      throw new RouteAbort(400, {
        error: 'Invalid Origin',
        message: 'The request origin is not in the allowed list.',
      });
    }
    redirectUri = `${baseUrl}/callback`;
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const sessionId = generateSessionId();
  // Composite state survives mobile app-switching (Custom Tabs / iOS Safari clearing storage). The '.'
  // delimiter is safe (state is hex, sessionId is hex). The session stores the RANDOM state (CSRF).
  const compositeState = `${state}.${sessionId}`;

  putSession(sessionId, {
    codeVerifier,
    state,
    redirectUri,
    expiresAt: Math.floor(Date.now() / 1000) + TWITTER.sessionTtlSec,
  });

  const authUrl = generateAuthUrl(redirectUri, codeChallenge, compositeState, [
    'tweet.read',
    'users.read',
    'offline.access',
    'follows.read',
    'like.read',
  ]);

  if (opts.mode === 'redirect') {
    return { status: 302, location: authUrl };
  }
  return { status: 200, body: { authUrl, sessionId, state: compositeState } };
}

// --- POST /auth/twitter/callback ------------------------------------------------------------------
export async function handleTwitterCallback(
  body: any,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { code, state: compositeState, sessionId: explicitSessionId } = body ?? {};

  // Parse sessionId from the composite state "{randomState}.{sessionId}"; fall back to the explicit
  // sessionId field for backward compatibility (parity with callback.ts:54-68).
  let resolvedSessionId = explicitSessionId;
  let originalState = compositeState;
  if (typeof compositeState === 'string') {
    const dotIdx = compositeState.lastIndexOf('.');
    if (dotIdx > 0) {
      originalState = compositeState.substring(0, dotIdx);
      const parsedSessionId = compositeState.substring(dotIdx + 1);
      if (!resolvedSessionId && parsedSessionId) resolvedSessionId = parsedSessionId;
    }
  }

  if (!code || !compositeState || !resolvedSessionId) {
    throw new RouteAbort(400, {
      error: 'Bad Request',
      message: 'Missing required parameters: code, state, sessionId',
    });
  }

  // Atomically consume the session (single-use; replay-proof). A missing/expired session -> 400.
  const session = consumeSession(resolvedSessionId);
  if (!session || Math.floor(Date.now() / 1000) > session.expiresAt) {
    throw new RouteAbort(400, { error: 'Invalid Session', message: 'Session not found or expired' });
  }

  // CSRF: compare against the RANDOM state stored in the session (not the composite state).
  if (session.state !== originalState) {
    throw new RouteAbort(400, { error: 'Invalid State', message: 'State parameter mismatch' });
  }

  // Exchange the auth code + fetch the X user. A 401 from either endpoint -> 401 (parity with the
  // lambda's `error.response?.status === 401` branch); any other failure propagates to a 500.
  let twitterUser: TwitterUser;
  try {
    const tokenResponse = await exchangeCodeForToken(code, session.codeVerifier, session.redirectUri);
    twitterUser = await getUserInfo(tokenResponse.access_token);
  } catch (err) {
    if (err instanceof TwitterApiError && err.httpStatus === 401) {
      throw new RouteAbort(401, { error: 'Unauthorized', message: 'Twitter authentication failed' });
    }
    throw err;
  }

  // Mint the identity via the box issuer, keyed on twitter_<id> (the byte-exact issuer.identity_map key).
  const { identityId, token } = await mintIdentity(`twitter_${twitterUser.id}`, 'twitter');

  // Normalize handle for lookups; preserve original casing for display (parity with callback.ts).
  const normalizedTwitterHandle = twitterUser.username.toLowerCase();
  const originalTwitterHandle = twitterUser.username;

  // RAW box read (no linked-secondary merge -- parity with the lambda's raw DDB GetItem): the existing
  // promoted twitter_handle/twitter_id determine the xHistory change type.
  const raw = await readProfileByIdentityRaw(identityId);

  let userProfile: Record<string, unknown>;
  if (raw) {
    userProfile = {
      identityId,
      provider: 'Twitter',
      username: twitterUser.name,
      twitterHandle: normalizedTwitterHandle,
      originalTwitterHandle,
      twitterId: twitterUser.id,
      profileImageUrl: twitterUser.profile_image_url,
      verified: twitterUser.verified,
      updatedAt: new Date().toISOString(),
    };

    // xHistory change type (parity with callback.ts:191-211): initial_link when no prior handle,
    // handle_rename when it changed. account_switch is not reachable here (the issuer mints a stable
    // identityId per twitter_<id>, so this path always has a matching twitterId).
    const oldHandle = typeof raw.twitterHandle === 'string' ? raw.twitterHandle : undefined;
    const oldTwitterId = typeof raw.twitterId === 'string' ? raw.twitterId : undefined;
    let xChangeType: 'initial_link' | 'handle_rename' | null = null;
    if (!oldHandle) xChangeType = 'initial_link';
    else if (oldHandle !== normalizedTwitterHandle) xChangeType = 'handle_rename';

    // Build the xHistory entry ONCE (with its changedAt) so a twitterPrimaryBox retry passes the SAME
    // object -> the box changedAt-dedup guard prevents a double-append. Only present optional keys are
    // carried (parity with appendXHistory's conditional entryMap).
    let xHistoryEntry: Record<string, string> | undefined;
    if (xChangeType) {
      xHistoryEntry = {
        changedAt: new Date().toISOString(),
        changeType: xChangeType,
        ...(oldHandle ? { oldHandle } : {}),
        newHandle: normalizedTwitterHandle,
        ...(oldTwitterId ? { oldTwitterId } : {}),
        newTwitterId: twitterUser.id,
      };
    }

    // Authoritative box write (the ONLY write; box=SoT). Throws -> 500 rather than silently diverging.
    await twitterPrimaryBox({
      identityId,
      twitterHandle: normalizedTwitterHandle,
      twitterId: twitterUser.id,
      username: twitterUser.name,
      originalTwitterHandle,
      profileImageUrl: twitterUser.profile_image_url || '',
      verified: twitterUser.verified || false,
      ...(xHistoryEntry ? { xHistoryEntry } : {}),
    });

    // Onboarding bonus (x-link). Best-effort, referral-gated server-side, PG-deduped. Never throws.
    await grantOnboardingBonus({
      identityId,
      walletAddress: null,
      kind: 'x-link',
      externalId: twitterUser.id,
    });
  } else {
    // Do NOT create a new profile here (parity with callback.ts:260-275): profile creation is handled by
    // the frontend's ensureUserProfile() during the linking flow, preventing orphan Twitter-only accounts.
    userProfile = {
      identityId,
      provider: 'Twitter',
      username: twitterUser.name,
      twitterHandle: normalizedTwitterHandle,
      originalTwitterHandle,
      twitterId: twitterUser.id,
      profileImageUrl: twitterUser.profile_image_url,
      verified: twitterUser.verified,
    };
  }

  return { status: 200, body: { ...userProfile, cognitoToken: token } };
}
