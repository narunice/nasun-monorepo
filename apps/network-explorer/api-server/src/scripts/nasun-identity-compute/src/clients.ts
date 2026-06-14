// Loopback clients for the two PROVEN sibling box endpoints C3a orchestrates, plus the wallet-proof
// HMAC. Both calls go to 127.0.0.1 (NO egress). They reproduce, byte-for-byte, the calls the login
// lambdas already make today (issuer-mint.ts -> issuer /mint; identity-write.ts authoritative ->
// nasun-identity /profile/upsert), so the box end-state is identical to the lambda path. The only
// difference from the lambda is that compute does NOT also write DynamoDB (the chosen (B) divergence).

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { LOGIN, SALT, ADDITIONAL, TELEGRAM, TELEGRAM_VERIFY } from './config';

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
