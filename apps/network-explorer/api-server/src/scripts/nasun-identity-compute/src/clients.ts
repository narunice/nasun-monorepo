// Loopback clients for the two PROVEN sibling box endpoints C3a orchestrates, plus the wallet-proof
// HMAC. Both calls go to 127.0.0.1 (NO egress). They reproduce, byte-for-byte, the calls the login
// lambdas already make today (issuer-mint.ts -> issuer /mint; identity-write.ts authoritative ->
// nasun-identity /profile/upsert), so the box end-state is identical to the lambda path. The only
// difference from the lambda is that compute does NOT also write DynamoDB (the chosen (B) divergence).

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { LOGIN, SALT, ADDITIONAL, TELEGRAM, TELEGRAM_VERIFY, WALLET, LINK, ECOSYSTEM, TWITTER, ADMIN } from './config';

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
 * #2a: create a NEW non-social profile in the box via nasun-identity loopback /profile/create-mirror
 * (INSERT ... ON CONFLICT DO NOTHING; box-only, no DynamoDB). Parity with the get-user-profile POST's
 * mirrorIdentityWrite(profileCreateMirror) payload. THROWS on a non-2xx / transport failure so the create
 * surfaces a 500 rather than silently dropping the SoT write. The caller pre-checks existence (409) and
 * pre-validates provider/username + the social-provider block, so create-mirror's own guards never fire
 * and its ON-CONFLICT no-op can never mask an overwrite. The retry is safe because the INSERT is
 * ON CONFLICT DO NOTHING (a re-POST after an ambiguous success is an idempotent no-op). Reuses the
 * ADDITIONAL identity-write bearer/baseUrl (same loopback the sibling reads use).
 */
export async function createProfileMirror(fields: {
  identityId: string;
  provider: string;
  username: string;
  email?: string;
  xHandle?: string;
  twitterHandle?: string;
  twitterId?: string;
  profileImageUrl?: string;
}): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/create-mirror`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` },
        body: JSON.stringify(fields),
        signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`identity /profile/create-mirror returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// AWS-exit #5 genesis-pass register de-Lambda: authoritative allowlist upsert/withdraw delegate (:3211).
// The compute side (handlers-genesis-pass.ts) read the profile (compute_ro) + resolved the EVM wallet and
// linked identities; the box tx does the allowlist read + lambda branch (existing-by-identity, takeover,
// wallet-change, approvals mintType, soft-delete) atomically. Returns the :3211 {status, body} envelope
// VERBATIM -- the handler returns the lambda's 200/404/409 status directly (dispatch maps it to the HTTP
// status), so the compute route just forwards it. NO retry: the upsert is non-idempotent (takeover UPDATE /
// wallet-change DELETE), so a retried POST after an ambiguous network failure could double-apply -- the
// lambda likewise never retried (the client re-submits on error).
async function gpRegisterDelegate(path: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${ADDITIONAL.identityBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: data };
}

export function genesisPassRegisterUpsert(payload: { identityId: string; allIdentityIds: string[]; walletAddress: string; twitterHandle?: string }): Promise<{ status: number; body: Record<string, unknown> }> {
  return gpRegisterDelegate('/genesis-pass/register/upsert', payload as unknown as Record<string, unknown>);
}

export function genesisPassWithdrawDelegate(payload: { identityId: string; allIdentityIds: string[]; walletAddress: string | null }): Promise<{ status: number; body: Record<string, unknown> }> {
  return gpRegisterDelegate('/genesis-pass/register/withdraw', payload as unknown as Record<string, unknown>);
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

// --- C4-1 additional-wallet: box identity-service loopback (read by-identity, read address-owner,
// CAS merge). All over loopback (:3211), bearer = identity-write-bearer the box already holds. ---------

function identityHeaders(): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` };
}

/**
 * GET /profile/by-identity -> the unified profile object, or null ONLY when the profile genuinely does
 * not exist (404). A non-200/non-404 status or a transport error THROWS (review #3): conflating a
 * transient box failure with "no profile" would skip the already-linked re-check and let verify run
 * Case-A primary creation on a stale read. Throwing fails closed (the handler maps it to 500).
 */
export async function readProfileByIdentity(identityId: string): Promise<Record<string, any> | null> {
  const url = `${ADDITIONAL.identityBaseUrl}/profile/by-identity?identityId=${encodeURIComponent(identityId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` },
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  if (res.status === 200) return (await res.json()) as Record<string, any>;
  if (res.status === 404) return null; // genuinely no profile row
  throw new Error(`by-identity returned HTTP ${res.status}`);
}

/**
 * #3b RAW read: POST /profile/batch { identityIds:[id] } -> the RAW dalRowToItem for that id (or null),
 * WITHOUT the /profile/by-identity linked-secondary field MERGE. The link/unlink/transfer flow MUST read
 * raw column truth (parity with the lambda's DynamoDB GetItem). /profile/by-identity back-fills
 * email/twitterHandle/originalTwitterHandle/twitterId/profileImageUrl/username/walletAddress from linked
 * secondaries (server.mjs:993-1001), but the lambda's GetItem did NOT -- a merged twitterHandle/twitterId
 * fed into the unconditional link-sync UPSERT would persist a secondary-derived value onto the PRIMARY's
 * promoted columns (and pollute the by-twitter-id anti-Sybil index) that the lambda left NULL. /profile/batch
 * returns dalRowToItem with NO merge (server.mjs:1110), the byte-parity equivalent of the lambda's raw GetItem.
 * THROWS on a non-2xx / transport error (fail-closed -> the handler 500s); returns null when the id is absent
 * (batch omits a missing id). Reuses the ADDITIONAL identity-write bearer/baseUrl.
 */
export async function readProfileByIdentityRaw(identityId: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` },
    body: JSON.stringify({ identityIds: [identityId] }),
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`profile/batch returned HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as { profiles?: Record<string, any> } | null;
  return data?.profiles?.[identityId] ?? null;
}

/**
 * GET /profile/by-wallet?walletAddress= -> the unified public profile object, or null when the wallet is
 * not registered / has no profile (404). Mirror of readProfileByIdentity for the public get-user-profile
 * GET-by-wallet read (the SAME box route the flipped lambda hits via readProfileFromBox). The compute
 * pre-validates the 0x+64hex format before calling, so the box-side 400 path is unreachable here; a
 * non-200/non-404 THROWS (fail-closed -> the route 500s rather than a false 404). Reuses the C4-1
 * identity-write-bearer/baseUrl (the box GET read routes share one `authorized()` bearer check).
 */
export async function readProfileByWallet(walletAddress: string): Promise<Record<string, any> | null> {
  const url = `${ADDITIONAL.identityBaseUrl}/profile/by-wallet?walletAddress=${encodeURIComponent(walletAddress)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` },
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  if (res.status === 200) return (await res.json()) as Record<string, any>;
  if (res.status === 404) return null; // wallet not registered / no profile
  throw new Error(`by-wallet returned HTTP ${res.status}`);
}

/**
 * GET /profile/address-owner?chain=&address=&self= -> the FIRST other-owner identityId, or null when
 * there is no collision. The box route serves an authoritative null (box.linked_accounts is lockstep
 * with the authoritative merge). THROWS on a non-200 so the caller can fail closed (a uniqueness check
 * that silently returned "no collision" on a box error would be an anti-Sybil hole).
 */
export async function readAddressOwner(chain: string, address: string, self: string): Promise<string | null> {
  const qs = new URLSearchParams({ chain, address, self }).toString();
  const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/address-owner?${qs}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` },
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`address-owner returned HTTP ${res.status}`);
  const data = (await res.json()) as { ownerIdentityId?: string | null };
  return data.ownerIdentityId ?? null;
}

// --- #2b get-user-profile root PATCH update: 3 box-loopback ops (:3211, NO egress) ----------------

/**
 * #2b displayName rate-limit: an atomic 2-step CAS on the box user_profiles.attributes counter
 * (displayNameChangeCount/displayNameChangeWindowStart), a faithful port of the lambda DynamoDB CAS
 * (index.ts:1035-1096). The NEW box :3211 /profile/display-name-ratelimit route does the whole decision
 * under SELECT ... FOR UPDATE, so the increment is atomic (serializes concurrent same-identity renames);
 * the box owns the conditional logic, this client only passes the bounds. Returns { limited } (true => the
 * caller returns 429). THROWS on a 404 (no profile) or any non-2xx / transport error -> the PATCH 500s
 * rather than silently letting a rate-limited rename through. The counter is monotonic (no rollback), lambda
 * parity, so this is NOT retried (a retry would double-increment).
 */
export async function checkDisplayNameRateLimit(
  identityId: string,
  rateLimitMax: number,
  rateLimitWindowMs: number,
): Promise<{ limited: boolean }> {
  const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/display-name-ratelimit`, {
    method: 'POST',
    headers: identityHeaders(),
    body: JSON.stringify({ identityId, max: rateLimitMax, windowMs: rateLimitWindowMs }),
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`display-name-ratelimit returned HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as { ok?: boolean; limited?: boolean } | null;
  if (!data || (data.ok !== true && data.limited !== true)) {
    throw new Error('display-name-ratelimit returned an incomplete response');
  }
  return { limited: data.limited === true };
}

/**
 * #2b cross-account collision: GET the NEW box :3211 /profile/linked-address-owner -> the FIRST OTHER
 * owner identityId of this paste-based linked address, or null. Parity with the lambda findCrossAccountOwner
 * (index.ts:374-393), but on the box ROOT attributes.linkedSuiAddress/linkedSolanaAddress -- the existing
 * readAddressOwner / /profile/address-owner is the WRONG target (it scans the signature-verified
 * linked_accounts.<chain>, which DELIBERATELY excludes the paste-based root attribute). THROWS on a non-200
 * so the caller fails CLOSED (503): a uniqueness check that silently returned "no collision" on a box error
 * would be an anti-Sybil hole.
 */
export async function readLinkedAddressOwner(chain: string, address: string, self: string): Promise<string | null> {
  const qs = new URLSearchParams({ chain, address, self }).toString();
  const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/linked-address-owner?${qs}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${ADDITIONAL.identityWriteBearer}` },
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`linked-address-owner returned HTTP ${res.status}`);
  const data = (await res.json()) as { ownerIdentityId?: string | null };
  return data.ownerIdentityId ?? null;
}

/**
 * #2b attribute write: POST the EXISTING box :3211 /profile/attributes-sync (server.mjs:404) with the
 * validated set/remove maps (box-only, no DynamoDB). The route's ATTRS_SYNC_SET/REMOVE_KEYS already allow
 * customDisplayName/displayNameUpdatedAt/linkedSuiAddress/linkedSolanaAddress/customAvatarKey/
 * customAvatarUpdatedAt. THROWS on a non-2xx / transport error so a failed authoritative write never looks
 * like success (the PATCH 500s). Retries once -- the merge is idempotent (re-applying the same set/remove
 * is a no-op) and does NOT touch the rate-limit counter (no double-increment risk).
 */
export async function syncProfileAttributes(
  identityId: string,
  set: Record<string, string>,
  remove: string[],
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/attributes-sync`, {
        method: 'POST',
        headers: identityHeaders(),
        body: JSON.stringify({ identityId, set, remove }),
        signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`attributes-sync returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * #3a deactivate write: POST the EXISTING box :3211 /profile/status (server.mjs handleProfileStatus) to set
 * status='DEACTIVATED' + deletionScheduledAt (epoch SECONDS, JSON number) box-only (no DynamoDB). The route
 * is UPDATE-only + idempotent (re-applying the same status/dsa is a no-op + dedups on identityId), so a retry
 * cannot double-apply. THROWS on a non-2xx / transport error so a failed authoritative write never reports
 * success (the handler 500s). Mirrors syncProfileAttributes (retries:1 == the lambda's
 * authoritativeIdentityWrite(IDENTITY_ROUTES.profileStatus, {retries:1})).
 */
export async function setDeactivatedStatus(identityId: string, deletionScheduledAt: number): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/status`, {
        method: 'POST',
        headers: identityHeaders(),
        body: JSON.stringify({ identityId, status: 'DEACTIVATED', deletionScheduledAt }),
        signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`profile/status returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * POST /profile/linked-account-merge with a whole-subobject compare-and-swap (Option B). expectedCurrent
 * is the EXACT linked_accounts.<provider> value the compute read before computing `account`; the box
 * writes `account` ONLY if the current value still equals expectedCurrent (IS NOT DISTINCT FROM), else
 * it reports a race. Returns true=merged, false=raced (-> caller returns 409 RACE, lambda parity).
 * THROWS on transport/HTTP error so a failed write never looks like success.
 *
 * NOTE: this relies on the box handleLinkedAccountMerge CAS extension (separate box-local go). Until
 * that lands, the route ignores expectedCurrent and always merges -- which is why the additional routes
 * stay INERT (ADDITIONAL.enabled false) until both the box route AND this client are live + repointed.
 */
export async function mergeLinkedAccountCas(
  identityId: string,
  provider: string,
  account: Record<string, unknown> | null,
  expectedCurrent: unknown,
): Promise<boolean> {
  const res = await fetch(`${ADDITIONAL.identityBaseUrl}/profile/linked-account-merge`, {
    method: 'POST',
    headers: identityHeaders(),
    body: JSON.stringify({ identityId, provider, account, expectedCurrent, cas: true }),
    signal: AbortSignal.timeout(ADDITIONAL.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`linked-account-merge returned HTTP ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { merged?: boolean; raced?: boolean };
  // FAIL-CLOSED CAS contract (review #2): only an explicit merged:true is success; an explicit
  // raced:true / merged:false is a CAS conflict (-> 409 RACE). ANYTHING ELSE (e.g. a pre-CAS box that
  // ignores expectedCurrent and returns neither) is AMBIGUOUS -> we must NOT report success, because a
  // legacy box would have done an UNCONDITIONAL write (lost-update). Throw so the route 500s rather than
  // silently losing concurrency safety. This makes "box CAS route must be live" a hard code guard, not
  // just an operational convention (the route also stays inert via ADDITIONAL.enabled until cutover).
  if (data.merged === true) return true;
  if (data.raced === true || data.merged === false) return false;
  throw new Error('linked-account-merge did not acknowledge the CAS contract (merged/raced absent)');
}

// --- C5b telegram disconnect -----------------------------------------------------------------------

/**
 * POST /telegram/disconnect { identityId } to the identity loopback (:3211) -- the AUTHORITATIVE box PG
 * clear (is_telegram_member=false, telegram_user_id=NULL, drop attributes.telegramUsername). Parity with
 * the disconnect-telegram lambda's authoritativeIdentityWrite(IDENTITY_ROUTES.telegramDisconnect). The
 * UPDATE is idempotent (no row -> no-op; already-clear -> same result), so a retry is safe. THROWS on
 * failure so the route surfaces a 500 rather than reporting a disconnect that did not persist.
 */
export async function disconnectTelegramBox(identityId: string): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${TELEGRAM.identityBaseUrl}/telegram/disconnect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TELEGRAM.identityWriteBearer}` },
        body: JSON.stringify({ identityId }),
        signal: AbortSignal.timeout(TELEGRAM.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`identity /telegram/disconnect returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * BEST-EFFORT secondary clear of the leaderboard-v3 Accounts/SeasonAccounts telegram badge via the
 * leaderboard internal route (X-Internal-Auth = leaderboard-internal-token). Parity with the
 * disconnect-telegram lambda's clearLeaderboardTelegram, which is itself wrapped in try/catch as
 * "secondary, optional". NEVER throws: the authoritative box clear already succeeded, and the badge
 * self-corrects on a future re-verify; surfacing a leaderboard-side failure as a 500 would wrongly tell
 * the user the disconnect failed. Skipped (no-op) when the URL or token is absent (inert deploy window).
 * Only call this for a profile that actually has a twitterHandle (a curated-leaderboard member).
 */
export async function clearLeaderboardTelegramRemote(twitterHandle: string): Promise<void> {
  if (!TELEGRAM.leaderboardClearUrl || !TELEGRAM.leaderboardInternalToken) return;
  try {
    const res = await fetch(TELEGRAM.leaderboardClearUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': TELEGRAM.leaderboardInternalToken },
      body: JSON.stringify({ twitterHandle }),
      signal: AbortSignal.timeout(TELEGRAM.leaderboardTimeoutMs),
    });
    if (!res.ok) console.warn(`[compute] leaderboard clear-telegram returned HTTP ${res.status} (non-fatal)`);
  } catch (err) {
    console.warn('[compute] leaderboard clear-telegram failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// --- C5c telegram verify ---------------------------------------------------------------------------

export interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Strict runtime validation of the Telegram Login Widget payload -- byte-parity with verify-telegram.ts
 * validateTelegramAuth: keep only known fields, require id (positive int), auth_date (positive int), hash
 * (64-hex). Returns null on any violation. The insertion order (id, auth_date, hash, then optionals) is
 * irrelevant to the hash check (verifyTelegramHash sorts), but kept identical to the lambda for clarity.
 */
export function validateTelegramAuth(raw: unknown): TelegramAuthData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = Number(obj.id);
  const auth_date = Number(obj.auth_date);
  const hash = String(obj.hash || '');
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isInteger(auth_date) || auth_date <= 0) return null;
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const validated: TelegramAuthData = { id, auth_date, hash };
  if (typeof obj.first_name === 'string') validated.first_name = obj.first_name;
  if (typeof obj.last_name === 'string') validated.last_name = obj.last_name;
  if (typeof obj.username === 'string') validated.username = obj.username;
  if (typeof obj.photo_url === 'string') validated.photo_url = obj.photo_url;
  return validated;
}

/**
 * Verify the Telegram Login Widget HMAC -- byte-parity with verify-telegram.ts verifyTelegramHash:
 * secretKey = sha256(botToken); data-check-string = sorted "key=value" (excluding hash) joined by '\n';
 * compare hmac-sha256(secretKey, dcs) to the provided hash via timingSafeEqual. Returns false on any
 * mismatch or length difference (so a forged/short hash never throws).
 */
export function verifyTelegramHash(authData: TelegramAuthData, botToken: string): boolean {
  const secretKey = createHash('sha256').update(botToken).digest();
  const dataCheckArr: string[] = [];
  for (const [key, value] of Object.entries(authData)) {
    if (key === 'hash') continue;
    if (value !== undefined && value !== null) dataCheckArr.push(`${key}=${value}`);
  }
  dataCheckArr.sort();
  const hmac = createHmac('sha256', secretKey).update(dataCheckArr.join('\n')).digest();
  const expected = Buffer.from(authData.hash, 'hex');
  if (hmac.length !== expected.length) return false;
  return timingSafeEqual(hmac, expected);
}

/** Telegram Bot API error -- mirrors verify-telegram.ts TelegramApiError (client vs server distinction). */
export class TelegramApiError extends Error {
  constructor(public readonly httpStatus: number, public readonly body: string) {
    super(`Telegram API error: ${httpStatus}`);
    this.name = 'TelegramApiError';
  }
  get isClientError(): boolean {
    return this.httpStatus >= 400 && this.httpStatus < 500;
  }
}

/**
 * getChatMember channel-membership check (egress) -- byte-parity with verify-telegram.ts
 * checkChannelMembership: member/administrator/creator => isMember. THROWS TelegramApiError on a non-2xx
 * (the route fail-closes: 4xx -> 400, else 503). Timed (the lambda was untimed per-invoke; the long-lived
 * box caps a wedged socket).
 */
export async function checkChannelMembership(
  botToken: string,
  channelUsername: string,
  telegramUserId: number,
  timeoutMs: number,
): Promise<{ isMember: boolean; status: string }> {
  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=@${channelUsername}&user_id=${telegramUserId}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new TelegramApiError(res.status, body);
  }
  const data = (await res.json()) as { result?: { status?: string } };
  const status = data.result?.status || 'unknown';
  return { isMember: ['member', 'administrator', 'creator'].includes(status), status };
}

/**
 * POST /telegram/verify { identityId, telegramUserId, telegramUsername } to the identity loopback -- the
 * AUTHORITATIVE box PG set. Parity with the verify-telegram lambda's
 * authoritativeIdentityWrite(IDENTITY_ROUTES.telegramVerify): the box does the clear-prior-owner +
 * set-new-owner in ONE atomic tx (stronger than the lambda's non-atomic sequence). telegramUsername is
 * always sent (string OR null) so the box merges it into attributes (hasUsername=true). Idempotent UPDATE,
 * so the single retry is safe. THROWS on failure so the route surfaces 500 rather than a false success.
 */
export async function verifyTelegramBox(
  identityId: string,
  telegramUserId: string,
  telegramUsername: string | null,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${TELEGRAM_VERIFY.identityBaseUrl}/telegram/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TELEGRAM_VERIFY.identityWriteBearer}` },
        body: JSON.stringify({ identityId, telegramUserId, telegramUsername }),
        signal: AbortSignal.timeout(TELEGRAM_VERIFY.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`identity /telegram/verify returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * BEST-EFFORT consolidated leaderboard-v3 residual (X-Internal-Auth = leaderboard-internal-token, the SAME
 * token the C5b clear presents). The lambda does ALL the DynamoDB-side secondary work the box cannot:
 * auto-transfer CLEAR of any prior owner's leaderboard badge (telegramUserId GSI), badge SET for the new
 * owner (when twitterHandle present), and the referral-gated onboarding bonus. NEVER throws: the
 * authoritative box set already succeeded; a leaderboard/onboarding hiccup self-corrects (badge via a
 * future get-my-rank, bonus is idempotent on re-verify) and must not 500 the user. Skipped when the URL or
 * token is absent (inert deploy window).
 */
export async function telegramVerifiedResidual(payload: {
  identityId: string;
  telegramUserId: string;
  telegramUsername: string | null;
  twitterHandle: string | null;
}): Promise<void> {
  if (!TELEGRAM_VERIFY.verifiedResidualUrl || !TELEGRAM_VERIFY.leaderboardInternalToken) return;
  try {
    const res = await fetch(TELEGRAM_VERIFY.verifiedResidualUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': TELEGRAM_VERIFY.leaderboardInternalToken },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEGRAM_VERIFY.residualTimeoutMs),
    });
    if (!res.ok) console.warn(`[compute] telegram-verified residual returned HTTP ${res.status} (non-fatal)`);
  } catch (err) {
    console.warn('[compute] telegram-verified residual failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// --- C3b wallet register/remove/list ----------------------------------------------------------------
// Box identity-service (:3211) loopback for the three multi-wallet routes + the wallet-proof HMAC verify
// + the best-effort points-scanner cache-invalidation webhook. All loopback over 127.0.0.1 (NO egress);
// only the webhook is egress (to explorer.nasun.io, allowed since C8). These call the SAME authoritative
// box routes the FLIPPED wallet lambda already hits today, so the box end-state is identical to the lambda
// path -- the only difference is the compute does NOT also write DynamoDB (the chosen (B) divergence).

/**
 * Verify the walletProof HMAC -- byte-parity with the wallet-api lambda verifyWalletProof
 * (utils/walletProof.ts): freshness (<= 5 min) + a constant-time compare of
 * hmac-sha256(secret, `${walletAddress}:${proofIssuedAt}`).digest('hex'). walletAddress MUST already be
 * lower-cased by the caller (registerWallet.ts lowercases before computing the HMAC). Returns
 * { valid, reason? } and NEVER throws (a non-string proof is coerced to '' -> length mismatch -> invalid).
 */
export function verifyWalletProofHmac(
  walletAddress: string,
  walletProofValue: unknown,
  proofIssuedAt: string,
): { valid: boolean; reason?: string } {
  const issuedTime = new Date(proofIssuedAt).getTime();
  if (Number.isNaN(issuedTime)) return { valid: false, reason: 'Invalid proofIssuedAt format' };
  if (Date.now() - issuedTime > WALLET.proofMaxAgeMs) return { valid: false, reason: 'walletProof expired (>5 min)' };

  // Reuse walletProof() so the verify side uses the IDENTICAL HMAC construction the C3a login mint side
  // generates (clients.ts walletProof). A future format change (chain tag, secret rotation) then cannot
  // silently diverge generate-vs-verify and break wallet auth. Same wallet-proof-secret cred underneath.
  const expected = walletProof(walletAddress, proofIssuedAt);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(typeof walletProofValue === 'string' ? walletProofValue : '', 'utf8');
  if (expectedBuf.length !== actualBuf.length) return { valid: false, reason: 'walletProof mismatch' };
  if (!timingSafeEqual(expectedBuf, actualBuf)) return { valid: false, reason: 'walletProof mismatch' };
  return { valid: true };
}

/**
 * POST a wallet write to the box identity loopback (:3211 /wallet/register|remove) -- the AUTHORITATIVE box
 * PG write (sentinel CAS + transfer + MAX-10 + last-wallet guard live INSIDE the box tx). Returns the box
 * { status, body } for ANY 2xx OR 4xx so the route proxies the box's 200/idempotent/transfer + 400/403/404/
 * 409/429 responses through BYTE-IDENTICALLY (the box error bodies + status codes match the lambda's). Only
 * a box 5xx or a transport/timeout error THROWS -> the route 500s (fail-closed). A single attempt: the box
 * write is idempotent (CAS), but a retry of /wallet/remove is NOT (its last-wallet COUNT shifts), so -- like
 * the flipped lambda's authoritative remove (retries:0) -- the compute issues one attempt and lets the
 * API Gateway / frontend retry a transient 5xx.
 */
async function walletWrite(path: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${WALLET.identityBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${WALLET.identityWriteBearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WALLET.loopbackTimeoutMs),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status >= 500) throw new Error(`box ${path} returned HTTP ${res.status}`);
  return { status: res.status, body: (data && typeof data === 'object') ? data : {} };
}

export function walletRegisterBox(identityId: string, walletAddress: string) {
  return walletWrite('/wallet/register', { identityId, walletAddress });
}

export function walletRemoveBox(identityId: string, walletAddress: string) {
  return walletWrite('/wallet/remove', { identityId, walletAddress });
}

/**
 * GET /wallet/list?identityId= from the box identity loopback (:3211) -> { wallets: [...] } (the SAME box
 * read the IDENTITY_READ_MODE=flip wallet lambda already serves; ORDER BY wallet_address ASC == DDB sort
 * order, byte-identical shape). Returns the box { status, body } for 2xx/4xx; a box 5xx or transport error
 * THROWS -> 500 (post-cutover the box is SoT with NO DynamoDB fallback, mirror of the C7 profile read).
 */
export async function walletListBox(identityId: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `${WALLET.identityBaseUrl}/wallet/list?identityId=${encodeURIComponent(identityId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${WALLET.identityWriteBearer}` },
    signal: AbortSignal.timeout(WALLET.loopbackTimeoutMs),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status >= 500) throw new Error(`box /wallet/list returned HTTP ${res.status}`);
  return { status: res.status, body: (data && typeof data === 'object') ? data : { wallets: [] } };
}

/**
 * BEST-EFFORT points-scanner cache invalidation -- byte-parity with the wallet lambda notifyWalletRegistered:
 * POST { identityId, walletAddress } to <base>/api/v1/internal/wallet-registered (X-Internal-Auth = the
 * explorer-api invalidate token) so the points scanner immediately refreshes its wallet->identity cache for
 * the new wallet. NEVER throws (the registration already committed to box PG; the scanner's 10-min TTL
 * fallback catches up on any failure, exactly as the lambda documented). Skipped (no-op) when the base URL
 * or token is absent (inert until wired -- a separate cred provision, like the C5 leaderboard residuals).
 */
export async function notifyWalletRegistered(identityId: string, walletAddress: string): Promise<void> {
  if (!WALLET.walletRegisteredBaseUrl || !WALLET.walletRegisteredToken) return;
  const url = `${WALLET.walletRegisteredBaseUrl.replace(/\/+$/, '')}/api/v1/internal/wallet-registered`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-auth': WALLET.walletRegisteredToken },
      body: JSON.stringify({ identityId, walletAddress }),
      signal: AbortSignal.timeout(WALLET.webhookTimeoutMs),
    });
    if (!res.ok) console.warn(`[compute] wallet-registered webhook returned HTTP ${res.status} (non-fatal)`);
  } catch (err) {
    console.warn('[compute] wallet-registered webhook failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// --- #3b link-account: box identity-service (:3211) loopback reads/writes + onboarding delegation -----
// All loopback over 127.0.0.1 (NO egress) EXCEPT grantOnboardingBonus (egress to explorer-api, allowed
// since C8). readProfileByIdentity (above, C4-1) is REUSED for the primary/secondary/oldPrimary reads.

export interface TwitterIdMatch {
  identityId: string;
  walletAddress: string | null;
  username: string | null;
  customDisplayName: string | null;
}

/**
 * GET /profile/by-twitter-id?twitterId= -> the matches array (every box row carrying this twitter_id + the
 * fields the anti-Sybil 409 needs: walletAddress/username/customDisplayName). Parity with the lambda's
 * readProfileFromBox('/profile/by-twitter-id') (link-account/index.ts:742). The caller does its OWN
 * self/already-linked filtering (selfIds). THROWS on a non-200 so the twitter-uniqueness gate fails CLOSED
 * (a silent "no matches" on a box error would be an anti-Sybil hole; matches the lambda's 503
 * TWITTER_UNIQUENESS_CHECK_FAILED on a dedup error).
 */
export async function readProfileByTwitterId(twitterId: string): Promise<TwitterIdMatch[]> {
  const url = `${LINK.identityBaseUrl}/profile/by-twitter-id?twitterId=${encodeURIComponent(twitterId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${LINK.identityWriteBearer}` },
    signal: AbortSignal.timeout(LINK.loopbackTimeoutMs),
  });
  if (res.status !== 200) throw new Error(`by-twitter-id returned HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as { matches?: unknown } | null;
  return Array.isArray(data?.matches) ? (data!.matches as TwitterIdMatch[]) : [];
}

/**
 * POST /profile/link-sync { rows } -- the AUTHORITATIVE multi-row box UPSERT of the full post-write
 * projection of every user_profiles row the link/unlink flow mutated (primary, secondary, oldPrimary on
 * transfer). Parity with the lambda's authoritativeIdentityWrite(IDENTITY_ROUTES.profileLinkSync, {rows}).
 * The box route sorts rows primary-first + does the whole batch in ONE tx (ON CONFLICT DO UPDATE; attributes
 * insert-only), so it is idempotent and the single retry is safe. THROWS on a non-2xx / transport error so a
 * failed authoritative write never reports success (the handler 500s). Box-enforced max 64 rows; link sends <=3.
 */
export async function linkSyncBox(rows: Record<string, unknown>[]): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${LINK.identityBaseUrl}/profile/link-sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${LINK.identityWriteBearer}` },
        body: JSON.stringify({ rows }),
        signal: AbortSignal.timeout(LINK.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`profile/link-sync returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * BEST-EFFORT onboarding bonus grant via explorer-api (design SSOT D1=A). The box CANNOT read the
 * nasun-referrals DDB gate, so it posts requireReferralActivated=true and explorer-api (node-3, which has
 * DDB) does the referral-ACTIVATED read server-side BEFORE the PG-deduped INSERT. Parity with the lambda's
 * grantIfReferralActivated (onboardingBonus.ts) MINUS the local DDB gate (moved server-side). NEVER throws
 * (the link already committed to box PG; the bonus is referral-gated + PG-idempotent, self-corrects on a
 * future re-link, exactly as the lambda wrapped it in .catch(non-fatal)). Skipped (no-op) when the URL or
 * api-key is absent (inert deploy window). egress to explorer.nasun.io (allowed since C8).
 */
export async function grantOnboardingBonus(payload: {
  identityId: string;
  walletAddress: string | null;
  kind: 'x-link' | 'google-link';
  externalId: string;
}): Promise<void> {
  if (!LINK.onboardingBonusUrl || !LINK.onboardingBonusApiKey) return;
  try {
    const res = await fetch(LINK.onboardingBonusUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': LINK.onboardingBonusApiKey },
      body: JSON.stringify({ ...payload, requireReferralActivated: true }),
      signal: AbortSignal.timeout(LINK.onboardingTimeoutMs),
    });
    if (!res.ok) console.warn(`[compute] onboarding-bonus returned HTTP ${res.status} (non-fatal)`);
  } catch (err) {
    console.warn('[compute] onboarding-bonus failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// --- Twitter (X) login: box identity-service (:3211) loopback profile write ------------------------

/**
 * POST /profile/twitter-primary to the box identity loopback (:3211) -- the AUTHORITATIVE box PG refresh of
 * the promoted twitter columns (twitter_handle/twitter_id) + the four attribute keys (username/
 * originalTwitterHandle/profileImageUrl/verified) + (optional) the changedAt-deduped xHistory append.
 * Parity with the auth-twitter lambda's authoritativeIdentityWrite(IDENTITY_ROUTES.twitterPrimary): the box
 * route is UPDATE-only (a missing row is a 0-row no-op; the callback only calls this for an existing
 * profile) and is ALREADY authoritative-live for the lambda (IDENTITY_WRITE_FLIP_ROUTES). THROWS on a
 * non-2xx / transport error so a failed write never reports success (the route 500s). Retries once -- the
 * column SET is idempotent and the xHistory append is changedAt-dedup-guarded box-side (the caller passes
 * the SAME entry object -> same changedAt -> no double-append), so the retry is safe.
 */
export async function twitterPrimaryBox(payload: {
  identityId: string;
  twitterHandle: string;
  twitterId: string;
  username: string;
  originalTwitterHandle: string;
  profileImageUrl: string;
  verified: boolean;
  xHistoryEntry?: Record<string, string>;
}): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${TWITTER.identityBaseUrl}/profile/twitter-primary`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TWITTER.identityWriteBearer}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TWITTER.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`identity /profile/twitter-primary returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// --- Ship1 ecosystem activation + nft-ownership writes (box :3211 loopback, NO egress) -------------
// The ecosystem activate/deactivate flow computes its decision on the compute side (verify, compute_ro
// reads, on-demand Alchemy) then delegates the AUTHORITATIVE write to the box identity service (:3211),
// which holds the write grants. The box reproduces the lambda's DDB conditional (ON CONFLICT WHERE
// status<>'ACTIVE') so a concurrent verifier write cannot lost-update. Reuses the identity-write
// bearer/baseUrl (the SAME loopback the profile/wallet writes use).

/**
 * POST /ecosystem/activation/upsert -> { changed }. changed:false == the row was already ACTIVE (the
 * lambda's "Already activated" 200 idempotent path). THROWS on a non-2xx / transport error so a failed
 * authoritative write never reports success (the route 500s). Retries once -- the upsert is idempotent
 * (re-applying the same ACTIVE row is a conditional no-op), so the retry is safe.
 */
export async function ecosystemActivationUpsert(payload: {
  identityId: string;
  sk: string;
  nftCount: number;
  activatedAt: string;
  lastVerifiedAt: string;
}): Promise<{ changed: boolean }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${ECOSYSTEM.identityBaseUrl}/ecosystem/activation/upsert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ECOSYSTEM.identityWriteBearer}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ECOSYSTEM.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`ecosystem/activation/upsert returned HTTP ${res.status}`);
      const data = (await res.json().catch(() => null)) as { changed?: boolean } | null;
      return { changed: data?.changed === true };
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * POST /ecosystem/activation/deactivate -> { updated } (rows flipped to INACTIVE). The compute already
 * resolved the exact sk via a read, so this is a keyed UPDATE. Idempotent (re-applying INACTIVE -> same).
 * THROWS on a non-2xx / transport error (the route 500s). Retries once (idempotent keyed UPDATE).
 */
export async function ecosystemActivationDeactivate(payload: {
  identityId: string;
  sk: string;
  reason?: string; // Ship-2 ownership-verifier passes 'ownership_lost'; the compute deactivate passes none.
  notAfter?: string; // Ship-2 verifier passes its job-start ISO (lost-update guard); the compute deactivate omits it.
}): Promise<{ updated: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${ECOSYSTEM.identityBaseUrl}/ecosystem/activation/deactivate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ECOSYSTEM.identityWriteBearer}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ECOSYSTEM.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`ecosystem/activation/deactivate returned HTTP ${res.status}`);
      const data = (await res.json().catch(() => null)) as { updated?: number } | null;
      return { updated: data?.updated ?? 0 };
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * POST /nft-ownership/upsert -- persist the on-demand ETH#LATEST per-wallet cache (full-item replace,
 * parity with the lambda fetchAndPersistOwnership Put). The compute computes the merged holdings before
 * calling. THROWS on a non-2xx / transport error so the route surfaces a 500. Retries once (full replace
 * is idempotent).
 */
export async function nftOwnershipUpsert(payload: {
  pk: string;
  sk: string;
  walletAddress: string;
  snapshotDate: string;
  // on-demand activate sends the minimal {contractAddress, chain, tokenCount}; the Ship-2 collector sends the
  // full holder-snapshot shape (+ collectionName/tokenIds, byte-parity with the lambda eth-collector-v2 row).
  holdings: Array<{ contractAddress: string; chain: string; tokenCount: number; collectionName?: string; tokenIds?: string[] }>;
  totalNftCount: number;
  source: string;
  lastUpdatedAt: string;
}): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${ECOSYSTEM.identityBaseUrl}/nft-ownership/upsert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${ECOSYSTEM.identityWriteBearer}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ECOSYSTEM.loopbackTimeoutMs),
      });
      if (!res.ok) throw new Error(`nft-ownership/upsert returned HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * POST /nft-ownership/cleanup-stale { keepSks } -> { deleted }. The Ship-2 weekly collector calls this AFTER
 * upserting today's ETH#LATEST rows, passing the full keep-set, to DELETE stale holders (parity with the
 * lambda eth-collector-v2 cleanupStaleLatestRecords; on-demand negative-cache rows are preserved box-side).
 * Single attempt (NOT retried): the collector decides cleanup eligibility (fetch-failure / drop-guard) and a
 * transient failure simply skips cleanup until the next weekly cycle (the stale rows linger one extra cycle,
 * harmless). THROWS on a non-2xx / transport error so the collector logs it rather than reporting success.
 */
export async function nftOwnershipCleanupStale(keepSks: string[]): Promise<{ deleted: number }> {
  const res = await fetch(`${ECOSYSTEM.identityBaseUrl}/nft-ownership/cleanup-stale`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ECOSYSTEM.identityWriteBearer}` },
    body: JSON.stringify({ keepSks }),
    signal: AbortSignal.timeout(ECOSYSTEM.loopbackTimeoutMs),
  });
  if (!res.ok) throw new Error(`nft-ownership/cleanup-stale returned HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as { deleted?: number } | null;
  return { deleted: data?.deleted ?? 0 };
}

// --- AdminStack admin UI: box :3211 write delegations (NO egress) + devnet-metrics egress -----------
// The admin write routes (hidden-proposals POST/DELETE, nft-collections POST/PUT/DELETE) delegate the
// AUTHORITATIVE box PG write to the identity service (:3211), which holds the write grant (compute_ro is
// SELECT-only). They post the validated payload the box handler persists, returning the box { status,
// body } byte-identically so the route proxies the box's 200/201/400/404/409 through unchanged. Reuse the
// identity-write bearer/baseUrl (the SAME loopback the ecosystem/profile/wallet writes use).

// POST a JSON write to the box identity loopback (:3211). Returns the box { status, body } for ANY 2xx OR
// 4xx so the admin route can proxy the box decision (404 not-found, 409 duplicate, 400 validation) byte-
// identically; a box 5xx or transport/timeout error THROWS (the admin route 500s, fail-closed).
async function adminWrite(path: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${ADMIN.identityBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN.identityWriteBearer}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ADMIN.loopbackTimeoutMs),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status >= 500) throw new Error(`box ${path} returned HTTP ${res.status}`);
  return { status: res.status, body: (data && typeof data === 'object') ? data : {} };
}

// hidden_proposals: upsert (POST /hidden-proposals -> hidden_at=now/hidden_by=adminIdentityId) + delete
// (DELETE /hidden-proposals/{id}). nft_collections: create (POST), update (PUT /{id}), delete (DELETE /{id}).
export function hiddenProposalUpsert(proposalId: string, hiddenBy: string) {
  return adminWrite('/admin/hidden-proposals/upsert', { proposalId, hiddenBy });
}
export function hiddenProposalDelete(proposalId: string) {
  return adminWrite('/admin/hidden-proposals/delete', { proposalId });
}
export function nftCollectionUpsert(payload: {
  contractAddress: string;
  chain: string;
  collectionName: string;
  nftTypeId: string;
  featured: boolean;
  createdBy: string;
}) {
  return adminWrite('/admin/nft-collections/upsert', payload);
}
export function nftCollectionUpdate(collectionId: string, updates: Record<string, unknown>) {
  return adminWrite('/admin/nft-collections/update', { collectionId, updates });
}
export function nftCollectionDelete(collectionId: string) {
  return adminWrite('/admin/nft-collections/delete', { collectionId });
}
// genesis_pass_allowlist admin CRUD (de-Lambda export-whitelist POST/PUT/DELETE /genesis-pass/entries):
// add (dup-check -> 409, status ACTIVE), update (partial status/mintType/source + audit), delete (idempotent).
// Same allowlist write SoT as the genesis-pass register lift, so the box is the single writer at cutover.
export function genesisPassEntryAdd(payload: { walletAddress: string; mintType?: string; source?: string }) {
  return adminWrite('/admin/genesis-pass/entries/add', payload as unknown as Record<string, unknown>);
}
export function genesisPassEntryUpdate(payload: { walletAddress: string; updates: Record<string, unknown>; lastModifiedBy: string }) {
  return adminWrite('/admin/genesis-pass/entries/update', payload as unknown as Record<string, unknown>);
}
export function genesisPassEntryRemove(walletAddress: string) {
  return adminWrite('/admin/genesis-pass/entries/delete', { walletAddress });
}

export interface DevnetMetricRow {
  date: string;
  dau: number;
  newAddresses: number;
  cumulativeAddresses: number;
  transactionCount?: number;
}

// devnet-metrics: one round-trip to the box explorer-api /stats/daily-metrics-range (egress) for the
// trailing N days. The admin lambda Scanned the DDB METRICS# table; the box derives the SAME { date, dau,
// newAddresses, cumulativeAddresses, transactionCount } shape from the LIVE explorer-api computation
// (activity_points, which the compute_ro pool cannot reach -- a different DB). transactionCount maps from
// explorer-api's `dailyTx`; the lambda's per-row `collectedAt` is OMITTED (live compute, no collector
// snapshot time). Days are returned ASC (the range endpoint orders by day; gaps are zero-filled there).
//
// A single range scan replaces the former N per-day fan-out. On a non-200 / transport error / malformed
// body the series is dropped (empty array, best-effort) rather than throwing -- the chart degrades to empty
// instead of 500ing the whole admin call. THROWS only if the base URL is absent (the route pre-checks
// ADMIN.dailyMetricsBaseUrl and 503s first).
export async function fetchDevnetMetricsRange(): Promise<DevnetMetricRow[]> {
  const base = ADMIN.dailyMetricsBaseUrl.replace(/\/+$/, '');
  // Trailing N-day window, UTC. The range endpoint is inclusive of both bounds.
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - (ADMIN.dailyMetricsRangeDays - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const res = await fetch(`${base}/daily-metrics-range?from=${from}&to=${to}`, {
      method: 'GET',
      signal: AbortSignal.timeout(ADMIN.dailyMetricsTimeoutMs),
    });
    if (!res.ok) return [];
    const body = (await res.json().catch(() => null)) as {
      data?: {
        date?: string;
        dau?: number;
        newAddresses?: number;
        cumulativeAddresses?: number;
        dailyTx?: number | null;
      }[];
    } | null;
    if (!body || !Array.isArray(body.data)) return [];
    return body.data
      .filter((m): m is { date: string } & typeof m => typeof m?.date === 'string')
      .map((m) => ({
        date: m.date,
        dau: Number(m.dau) || 0,
        newAddresses: Number(m.newAddresses) || 0,
        cumulativeAddresses: Number(m.cumulativeAddresses) || 0,
        transactionCount: m.dailyTx != null ? Number(m.dailyTx) : undefined,
      }));
  } catch {
    // best-effort: a transient explorer-api hiccup yields an empty series, not a 500
    return [];
  }
}
