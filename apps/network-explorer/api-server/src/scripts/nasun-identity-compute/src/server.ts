// nasun-identity-compute -- box-co-located de-Lambda compute service (AWS-exit #4).
// C0/C1: GET /health, GET /count (public). C3a: POST /auth/{sui,metamask}/{prepare,connect-verify}
// (login compute lifted off the auth-sui/auth-metamask lambdas; in-memory nonce + issuer/identity
// loopback). C8: POST /auth/zklogin/salt (lifted off the zklogin-salt lambda; Google JWT verify +
// jwtToAddress derivation + box issuer salt store over loopback). nginx `location /compute/ -> :3212/`
// strips the prefix, so the box sees /auth/sui/prepare etc.
//
// Single loopback Node process (127.0.0.1), so the in-memory nonce store is correct. C0/C1/C3a deps are
// all loopback (issuer :3210, identity :3211). C8 adds ONE external call (Google JWKS) -> the unit's
// egress was relaxed to allow=any/deny-private at the C8 cutover (see service unit + design doc).
// Migrated to TS + esbuild bundle at C3a (crypto-critical); the deployed artifact is a single bundled
// server.mjs (build.mjs), preserving the box "scp one .mjs" contract.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import postgres from 'postgres';
import { PORT, HOST, SCHEMA, PG, COMPUTE_BEARER, LOGIN, SALT, ADDITIONAL, TELEGRAM_VERIFY, GOVERNANCE, PROFILE_READ, PROFILE_WRITE, PROFILE_PATCH, WALLET, DEACTIVATE } from './config';
import { publicCors, loginCors, saltCors, additionalCors, governanceCors, profileCors, walletCors, deactivateCors, send, RouteAbort } from './http';
import { handleSponsor } from './governance-sponsor';
import { handleConfig, handleVotingPower, handleCertificate } from './governance-voting';
import {
  handleSuiPrepare,
  handleSuiConnectVerify,
  handleEvmPrepare,
  handleEvmConnectVerify,
} from './handlers';
import { handleZkLoginSalt } from './handlers-zklogin';
import { CHAINS } from './additional-chains';
import {
  readProfileByIdentity,
  setDeactivatedStatus,
  readProfileByWallet,
  createProfileMirror,
  checkDisplayNameRateLimit,
  readLinkedAddressOwner,
  syncProfileAttributes,
  disconnectTelegramBox,
  clearLeaderboardTelegramRemote,
  validateTelegramAuth,
  verifyTelegramHash,
  checkChannelMembership,
  TelegramApiError,
  verifyTelegramBox,
  telegramVerifiedResidual,
} from './clients';
import { verifyJwtIdentity } from './identity-verify';
import {
  type LinkChain,
  LINK_FIELD,
  validateDisplayName,
  validateLinkedAddress,
  validateAvatarKey,
} from './profile-validation';
import {
  handleChallenge as handleAdditionalChallenge,
  handleVerify as handleAdditionalVerify,
  handleLabel as handleAdditionalLabel,
  handleRemove as handleAdditionalRemove,
  handleAppBinding as handleAdditionalAppBinding,
} from './handlers-additional';
import {
  handleWalletRegister,
  handleWalletRemove,
  handleWalletList,
} from './handlers-wallet';

// C4-1 additional-wallet action -> required HTTP method (parity with the lambda API GW route mounts).
const ADDITIONAL_METHODS: Record<string, string> = {
  challenge: 'POST', verify: 'POST', label: 'PATCH', remove: 'DELETE', 'app-binding': 'PATCH',
};

// #3a deactivate: Cognito identity id (region:uuid) -- byte-parity with the deactivate/purge lambdas and the
// box :3211 COGNITO_ID_REGEX. Bounds the no-JWT query identityId to a well-formed identity before the loopback.
const COGNITO_ID_REGEX = /^[a-z]{2}-[a-z]+-\d:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sql = postgres({
  host: PG.host, port: PG.port, database: PG.database, username: PG.username, password: PG.password,
  max: 4, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: 15000, lock_timeout: 8000, idle_in_transaction_session_timeout: 15000 },
});

// GET /count -- public, same row/value as C1 (nasun-identity handleProfileCount). SELECT-only,
// schema-qualified (equivalent to the C0 SET LOCAL search_path + count, one statement, no transaction).
async function handleCount() {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM ${sql(SCHEMA)}.user_profiles`;
  return { count: n, tableName: 'UserProfiles', updatedAt: new Date().toISOString() };
}

// Constant-time bearer check against COMPUTE_BEARER (parity with the box identity authorized()). Gates
// the server-to-server /wallet-mappings route (the admin-api wallet-mappings lambda presents this bearer).
function bearerOk(authHeader: string | undefined): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? Buffer.from(authHeader.slice(7)) : Buffer.alloc(0);
  return presented.length === COMPUTE_BEARER.length && timingSafeEqual(presented, COMPUTE_BEARER);
}

// GET /wallet-mappings -- bearer-gated bulk wallet->identity map for the points-scanner wallet cache.
// Serves the AUTHORITATIVE box `wallet_owner` reverse index (wallet_address -> owner_identity_id) -- the
// SAME index the chat-server identity-resolver already reads via DAL. This is the source that includes
// box-only (post-cutover C3b) wallet registrations that the admin-api lambda's DynamoDB UserWallets scan
// misses; flipping that lambda to WALLET_MAPPINGS_SOURCE=box (-> this route) is the prerequisite that
// unblocks the wallet write cutover. wallet_owner (not a user_wallets scan) is also authoritative +
// DETERMINISTIC: a wallet with a stale duplicate user_wallets row resolves to its true sentinel owner,
// not scan-order roulette (the lambda's DDB scan can attribute such a wallet to either identity).
// SELECT-only, schema-qualified; requires the compute PG role to hold SELECT on wallet_owner (GRANT
// applied box-side before the lambda flips; until then this 500s, but only the bearer-holder reaches it).
async function handleWalletMappings(): Promise<{ wallets: Record<string, string> }> {
  const rows = await sql<{ wallet_address: string; owner_identity_id: string }[]>`
    SELECT wallet_address, owner_identity_id FROM ${sql(SCHEMA)}.wallet_owner
    WHERE owner_identity_id IS NOT NULL`;
  const wallets: Record<string, string> = {};
  // Lower-case the key so the route is authoritative-clean rather than relying on the wallet_owner
  // lowercase invariant (both consumers re-lowercase on ingest, but make the source self-correcting too).
  for (const r of rows) wallets[r.wallet_address.toLowerCase()] = r.owner_identity_id;
  return { wallets };
}

function readBody(req: IncomingMessage, limitBytes = 16 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limitBytes) { reject(new RouteAbort(413, { message: 'Payload too large' })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJson(raw: string): any {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new RouteAbort(400, { message: 'Invalid JSON body' }); }
}

// C3a login routes (POST) -- each returns { status, body }; throws RouteAbort for 4xx.
const LOGIN_ROUTES: Record<string, (req: IncomingMessage, body: any) => Promise<{ status: number; body: Record<string, unknown> }> | { status: number; body: Record<string, unknown> }> = {
  '/auth/sui/prepare': () => handleSuiPrepare(),
  '/auth/sui/connect-verify': (_req, body) => handleSuiConnectVerify(body),
  '/auth/metamask/prepare': (req, body) =>
    handleEvmPrepare(body, (req.headers['accept-language'] as string) || ''),
  '/auth/metamask/connect-verify': (_req, body) => handleEvmConnectVerify(body),
};

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  let pathname: string;
  try { pathname = new URL(req.url || '/', 'http://localhost').pathname; }
  catch { return send(res, 400, { error: 'bad_url' }, publicCors()); }

  // Public health/count (parity with C0/C1) -- ACAO:*, no bearer.
  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { status: 'ok', service: 'nasun-identity-compute' }, publicCors());
  }
  if (req.method === 'GET' && pathname === '/count') {
    try {
      return send(res, 200, await handleCount(), publicCors());
    } catch (e) {
      console.error('[compute] /count failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'internal_error' }, publicCors());
    }
  }

  // GET /wallet-mappings -- bearer-gated (COMPUTE_BEARER), server-to-server (admin-api wallet-mappings
  // lambda). NOT public (returns the full wallet->identity map); no CORS (no browser caller). 401 on a
  // bad/absent bearer (constant-time). Reachable at issuer.nasun.io/compute/wallet-mappings (nginx strips
  // /compute/). Inert in effect until the lambda flips to WALLET_MAPPINGS_SOURCE=box.
  if (req.method === 'GET' && pathname === '/wallet-mappings') {
    if (!bearerOk(req.headers['authorization'] as string | undefined)) {
      return send(res, 401, { error: 'unauthorized' }, {});
    }
    try {
      return send(res, 200, await handleWalletMappings(), {});
    } catch (e) {
      console.error('[compute] /wallet-mappings failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'internal_error' }, {});
    }
  }

  // C3a login routes -- origin-allowlist CORS + credentials (parity with the auth lambdas).
  const loginRoute = LOGIN_ROUTES[pathname];
  if (loginRoute) {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = loginCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'POST') return send(res, 405, { message: 'Method Not Allowed' }, cors);
    if (!LOGIN.enabled) return send(res, 503, { message: 'login compute not enabled' }, cors);
    try {
      const body = parseJson(await readBody(req));
      const { status, body: out } = await loginRoute(req, body);
      return send(res, status, out, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error(`[compute] ${pathname} failed:`, e instanceof Error ? e.message : e);
      return send(res, 500, { message: 'Internal Server Error' }, cors);
    }
  }

  // C8 zklogin-salt route -- origin-allowlist CORS WITHOUT credentials (parity with zklogin-salt
  // lambda corsHeaders). jwt arrives in the BODY. Gated by SALT.enabled (issuer-mint-bearer present).
  if (pathname === '/auth/zklogin/salt') {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = saltCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    if (!SALT.enabled) return send(res, 503, { error: 'salt compute not enabled' }, cors);
    try {
      const body = parseJson(await readBody(req));
      const jwt = body?.jwt;
      if (!jwt || typeof jwt !== 'string') return send(res, 400, { error: 'Missing jwt parameter' }, cors);
      const { status, body: out } = await handleZkLoginSalt(jwt);
      return send(res, status, out, cors);
    } catch (e) {
      // Re-key RouteAbort payloads ({message}) to the salt route's {error} contract so EVERY salt error
      // body is { error } (parity with the zklogin-salt lambda, which returns { error } for invalid
      // JSON / oversize too). The C3a login routes keep {message} (they mirror the auth lambdas).
      if (e instanceof RouteAbort) {
        const msg = typeof e.payload.message === 'string' ? e.payload.message : `HTTP ${e.status}`;
        return send(res, e.status, { error: msg }, cors);
      }
      console.error('[compute] /auth/zklogin/salt failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal Server Error' }, cors);
    }
  }

  // C4-1 additional-wallet routes -- chain encoded in the path by the API GW repoint
  // (/compute/<chain>-additional/<action> -> nginx strips /compute/ -> box sees /<chain>-additional/...).
  // All gate on dual-jwks (verifyJwtIdentity) + ADDITIONAL.enabled. Origin-allowlist CORS + credentials.
  const addlMatch = pathname.match(/^\/([a-z]+)-additional\/(challenge|verify|label|remove|app-binding)$/);
  if (addlMatch) {
    const chain = CHAINS[addlMatch[1]];
    const action = addlMatch[2];
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = additionalCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (!chain) return send(res, 404, { message: 'Not Found' }, cors); // unknown chain (solana/metamask not yet shipped)
    if (!ADDITIONAL.enabled) return send(res, 503, { message: 'additional-wallet compute not enabled' }, cors);
    try {
      // Auth BEFORE the method check (lambda precedence: 401 over 405).
      const identityId = await verifyJwtIdentity(req.headers['authorization'] as string | undefined);
      if (!identityId) return send(res, 401, { message: 'Unauthorized. Valid authentication token required.' }, cors);
      if (req.method !== ADDITIONAL_METHODS[action]) return send(res, 405, { message: 'Method Not Allowed' }, cors);

      const body = parseJson(await readBody(req));
      // remove (DELETE) accepts walletAddress in the body OR the query string (lambda parity).
      if (action === 'remove' && body.walletAddress == null) {
        const q = new URL(req.url || '/', 'http://localhost').searchParams.get('walletAddress');
        if (q) body.walletAddress = q;
      }

      let out: { status: number; body: Record<string, unknown> };
      if (action === 'challenge') out = await handleAdditionalChallenge(chain, identityId, body);
      else if (action === 'verify') out = await handleAdditionalVerify(chain, identityId, body);
      else if (action === 'label') out = await handleAdditionalLabel(chain, identityId, body);
      else if (action === 'remove') out = await handleAdditionalRemove(chain, identityId, body);
      else out = await handleAdditionalAppBinding(chain, identityId, body);
      return send(res, out.status, out.body, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error(`[compute] /${addlMatch[1]}-additional/${action} failed:`, e instanceof Error ? e.message : e);
      return send(res, 500, { message: 'Internal Server Error' }, cors);
    }
  }

  // C3b wallet register/remove/list (POST /wallet/register, POST /wallet/remove, GET /wallet/list) --
  // de-Lambda crown-jewel: dual-jwks (verifyJwtIdentity) + (register only) the wallet-proof HMAC + the box
  // identity loopback :3211 /wallet/{register,remove,list} (the SAME authoritative routes the FLIPPED wallet
  // lambda already writes/reads today: IDENTITY_WRITE_FLIP_ROUTES has /wallet/register,/wallet/remove and
  // IDENTITY_READ_MODE=flip serves /wallet/list). Box is SoT: box-only PG write, NO DynamoDB (the (B)
  // divergence, covered by the reconcile post-cutover wallet exclusion). walletCors (origin-allowlist,
  // GET/POST/DELETE/OPTIONS -- byte-parity with the wallet lambda corsHeaders; {error} bodies). Gated on
  // WALLET.enabled (COMPUTE_WALLET_ENABLED=1 + audience + identity-write-bearer + wallet-proof-secret) ->
  // 503 inert until the cutover gate flips the flag, so the box-direct WRITE path stays closed pre-cutover.
  // Precedence (additional-wallet parity): OPTIONS -> 503(disabled) -> 401(auth) -> 405(method) -> handler.
  const walletMatch = pathname.match(/^\/wallet\/(register|remove|list)$/);
  if (walletMatch) {
    const action = walletMatch[1];
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = walletCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (!WALLET.enabled) return send(res, 503, { error: 'wallet compute not enabled' }, cors);
    try {
      // Auth BEFORE the method check (lambda precedence: 401 over 405; the API GW specific resources also
      // enforce the method, so a wrong-method call cannot reach here in the live path -- 405 is defensive).
      const identityId = await verifyJwtIdentity(req.headers['authorization'] as string | undefined);
      if (!identityId) return send(res, 401, { error: 'Unauthorized' }, cors);
      const expectedMethod = action === 'list' ? 'GET' : 'POST';
      if (req.method !== expectedMethod) return send(res, 405, { error: 'Method Not Allowed' }, cors);

      let out: { status: number; body: Record<string, unknown> };
      if (action === 'list') {
        out = await handleWalletList(identityId);
      } else {
        const body = parseJson(await readBody(req));
        out = action === 'register'
          ? await handleWalletRegister(identityId, body)
          : await handleWalletRemove(identityId, body);
      }
      return send(res, out.status, out.body, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error(`[compute] /wallet/${action} failed:`, e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal Server Error' }, cors);
    }
  }

  // C5a telegram-status (GET) -- de-Lambda read: dual-jwks + the box /profile/by-identity loopback,
  // the SAME box read the flipped telegram-status lambda already serves (byte-parity). NO bot token, NO
  // telegram API, NO secondary leaderboard write. Box is SoT, so a box-absent profile -> not a member
  // (the lambda's DDB fallback is unnecessary post-cutover; reconcile keeps missing_in_box=0). Origin-
  // allowlist CORS + credentials (same allowlist as the wallet-link routes, both called from my-account).
  // Shares the ADDITIONAL gate (VERIFY.audience dual-jwks + identity-write-bearer loopback read). Lambda
  // precedence preserved: OPTIONS -> 405 (non-GET) -> 401 (auth) -> 200.
  if (pathname === '/telegram/status') {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = additionalCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'GET') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    if (!ADDITIONAL.enabled) return send(res, 503, { error: 'telegram compute not enabled' }, cors);
    try {
      const identityId = await verifyJwtIdentity(req.headers['authorization'] as string | undefined);
      if (!identityId) return send(res, 401, { error: 'Unauthorized', message: 'Valid Cognito token required' }, cors);
      const boxed = await readProfileByIdentity(identityId);
      return send(res, 200, {
        isTelegramMember: boxed?.isTelegramMember === true,
        telegramUsername: boxed?.telegramUsername || null,
      }, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error('[compute] /telegram/status failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal error', message: 'An unexpected error occurred.' }, cors);
    }
  }

  // C5b telegram-disconnect (POST) -- de-Lambda write: dual-jwks + AUTHORITATIVE box PG clear via the
  // identity loopback /telegram/disconnect (parity with the flipped disconnect-telegram lambda; box-only,
  // NO DynamoDB write -- the (B) divergence, covered by the reconcile post-cutover telegram exclusion) +
  // a BEST-EFFORT secondary clear of the leaderboard badge (only when the profile has a twitterHandle).
  // Box is SoT: a box-absent profile -> 403 (same as the lambda's "profile not found"). Lambda precedence:
  // OPTIONS -> 405 (non-POST) -> 401 (auth) -> 403 (no profile) -> 400 (not connected) -> 200.
  if (pathname === '/telegram/disconnect') {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = additionalCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    if (!ADDITIONAL.enabled) return send(res, 503, { error: 'telegram compute not enabled' }, cors);
    try {
      const identityId = await verifyJwtIdentity(req.headers['authorization'] as string | undefined);
      if (!identityId) return send(res, 401, { error: 'Unauthorized' }, cors);
      const boxed = await readProfileByIdentity(identityId);
      if (!boxed) return send(res, 403, { error: 'User profile not found' }, cors);
      if (boxed.isTelegramMember !== true) return send(res, 400, { error: 'Telegram is not connected' }, cors);
      // Authoritative box clear (throws -> 500). DynamoDB is intentionally NOT cleared (box=SoT).
      await disconnectTelegramBox(identityId);
      // Secondary: clear the curated-leaderboard badge (best-effort, never throws, only if on the board).
      if (typeof boxed.twitterHandle === 'string' && boxed.twitterHandle) {
        await clearLeaderboardTelegramRemote(boxed.twitterHandle);
      }
      return send(res, 200, { success: true }, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error('[compute] /telegram/disconnect failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal server error' }, cors);
    }
  }

  // C5c telegram-verify (POST) -- de-Lambda write: dual-jwks + Telegram Login Widget HMAC verify +
  // getChatMember channel-membership + the AUTHORITATIVE box PG set via the identity loopback
  // /telegram/verify (atomic clear-prior-owner + set-new-owner; box-only, NO DynamoDB UserProfiles write
  // -- the (B) divergence, covered by the reconcile set-direction exclusion) + a BEST-EFFORT consolidated
  // residual (leaderboard badge set/clear + onboarding bonus). Box is SoT. Precedence byte-parity with the
  // verify-telegram lambda: OPTIONS -> 405 -> 503(disabled/no-channel) -> 401(auth) -> 403(no profile) ->
  // 200(already verified) -> 400(bad body) -> 401(bad hash) -> 401(expired) -> 400/503(membership) ->
  // 400(not member) -> 200.
  if (pathname === '/telegram/verify') {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = additionalCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    if (!TELEGRAM_VERIFY.enabled) return send(res, 503, { error: 'telegram verify compute not enabled' }, cors);
    try {
      const identityId = await verifyJwtIdentity(req.headers['authorization'] as string | undefined);
      if (!identityId) return send(res, 401, { error: 'Unauthorized' }, cors);
      const boxed = await readProfileByIdentity(identityId);
      if (!boxed) return send(res, 403, { error: 'User profile not found' }, cors);
      // Idempotent: already verified (parity with the lambda's early 200).
      if (boxed.isTelegramMember === true) {
        return send(res, 200, { success: true, alreadyVerified: true, telegramUsername: boxed.telegramUsername ?? null }, cors);
      }
      const body = parseJson(await readBody(req));
      const telegramAuth = validateTelegramAuth((body as Record<string, unknown>)?.telegramAuth);
      if (!telegramAuth) return send(res, 400, { error: 'Invalid request' }, cors);
      // Telegram Login Widget HMAC (constant-time) -> 401 on mismatch.
      if (!verifyTelegramHash(telegramAuth, TELEGRAM_VERIFY.botToken)) {
        return send(res, 401, { error: 'Invalid Telegram auth' }, cors);
      }
      // auth_date freshness (replay guard) -> 401 if stale.
      if (Math.floor(Date.now() / 1000) - telegramAuth.auth_date >= TELEGRAM_VERIFY.authMaxAgeSec) {
        return send(res, 401, { error: 'Expired Telegram auth' }, cors);
      }
      // Channel membership (fail-closed: 4xx client error -> 400, else 503).
      let membership: { isMember: boolean; status: string };
      try {
        membership = await checkChannelMembership(
          TELEGRAM_VERIFY.botToken, TELEGRAM_VERIFY.channelUsername, telegramAuth.id, TELEGRAM_VERIFY.telegramApiTimeoutMs,
        );
      } catch (err) {
        if (err instanceof TelegramApiError && err.isClientError) {
          return send(res, 400, { error: 'Telegram verification failed' }, cors);
        }
        console.error('[compute] /telegram/verify getChatMember failed:', err instanceof Error ? err.message : err);
        return send(res, 503, { error: 'Telegram API unavailable' }, cors);
      }
      if (!membership.isMember) {
        return send(res, 400, { error: 'Not a channel member', channelUsername: TELEGRAM_VERIFY.channelUsername }, cors);
      }
      const telegramUserId = String(telegramAuth.id);
      const telegramUsername = telegramAuth.username ? telegramAuth.username.toLowerCase() : null;
      // Authoritative box set (atomic set + auto-transfer; throws -> 500). DynamoDB NOT written (box=SoT).
      await verifyTelegramBox(identityId, telegramUserId, telegramUsername);
      // Best-effort consolidated residual (leaderboard badge set/clear + onboarding bonus; never throws).
      await telegramVerifiedResidual({
        identityId,
        telegramUserId,
        telegramUsername,
        twitterHandle: typeof boxed.twitterHandle === 'string' && boxed.twitterHandle ? boxed.twitterHandle : null,
      });
      return send(res, 200, { success: true, telegramUsername }, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error('[compute] /telegram/verify failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal server error' }, cors);
    }
  }

  // C6a governance /sponsor (POST) -- de-Lambda Sui sponsor signing (parity governance-api index.ts:854).
  // PUBLIC (no JWT, same as the lambda): the 2-command tx-kind whitelist + Poll-only gate ARE the
  // protection (a sponsor can only sign the exact mint_certificate+vote_with_certificate shape for a Poll
  // proposal). governanceCors (GET/POST/OPTIONS, no credentials). Gated on GOVERNANCE.sponsorEnabled
  // (sponsor key present) -> 503 inert until the secret is wired + the API GW repoints. Error bodies use
  // the governance {error} contract, so RouteAbort {message} payloads (parseJson/readBody) are re-keyed.
  if (pathname === '/governance/sponsor') {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = governanceCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    if (!GOVERNANCE.sponsorEnabled) return send(res, 503, { error: 'governance sponsor compute not enabled' }, cors);
    try {
      const body = parseJson(await readBody(req));
      const { status, body: out } = await handleSponsor(body);
      return send(res, status, out, cors);
    } catch (e) {
      if (e instanceof RouteAbort) {
        const payload = 'error' in e.payload
          ? e.payload
          : { error: typeof e.payload.message === 'string' ? e.payload.message : `HTTP ${e.status}` };
        return send(res, e.status, payload, cors);
      }
      console.error('[compute] /governance/sponsor failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal server error' }, cors);
    }
  }

  // C6b governance /config (GET) -- static config, no deps (parity index.ts:743). PUBLIC, no gate.
  if (pathname === '/governance/config') {
    const cors = governanceCors((req.headers['origin'] as string) || undefined);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'GET') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    const { status, body } = handleConfig();
    return send(res, status, body, cors);
  }

  // C6b governance /voting-power (GET ?walletAddress=) -- PUBLIC (no JWT, parity); box voting-identity
  // loopback + residual rank. Gated on votingPowerEnabled (identity loopback + rank residual configured).
  if (pathname === '/governance/voting-power') {
    const cors = governanceCors((req.headers['origin'] as string) || undefined);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'GET') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    if (!GOVERNANCE.votingPowerEnabled) return send(res, 503, { error: 'governance voting-power compute not enabled' }, cors);
    try {
      const walletAddress = new URL(req.url || '/', 'http://localhost').searchParams.get('walletAddress') || '';
      const { status, body } = await handleVotingPower(walletAddress);
      return send(res, status, body, cors);
    } catch (e) {
      console.error('[compute] /governance/voting-power failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal server error' }, cors);
    }
  }

  // C6b governance /certificate (POST) -- PUBLIC (no JWT, parity; identity resolved from `voter` body).
  // Oracle Ed25519 sign + box governance_votes dup-guard + on-chain self-heal. Gated on certEnabled
  // (oracle key + identity loopback + rank residual). {error} contract -> RouteAbort {message} re-keyed.
  if (pathname === '/governance/certificate') {
    const cors = governanceCors((req.headers['origin'] as string) || undefined);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, cors);
    if (!GOVERNANCE.certEnabled) return send(res, 503, { error: 'governance certificate compute not enabled' }, cors);
    try {
      const body = parseJson(await readBody(req));
      const { status, body: out } = await handleCertificate(body);
      return send(res, status, out, cors);
    } catch (e) {
      if (e instanceof RouteAbort) {
        const payload = 'error' in e.payload
          ? e.payload
          : { error: typeof e.payload.message === 'string' ? e.payload.message : `HTTP ${e.status}` };
        return send(res, e.status, payload, cors);
      }
      console.error('[compute] /governance/certificate failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'Internal server error' }, cors);
    }
  }

  // get-user-profile READ (GET /profile?walletAddress= | ?identityId=) -- de-Lambda PUBLIC read: no JWT
  // (parity with the lambda GET) + the box /profile/by-wallet|by-identity loopback, the SAME box reads the
  // flipped get-user-profile lambda already serves directly (byte-identical, shadow-validated 200 body).
  // Box is SoT: a box-absent profile -> 404 (the lambda's DynamoDB fallback is unnecessary post-cutover;
  // reconcile keeps missing_in_box=0). profileCors (origin-allowlist, GET/POST/PATCH/OPTIONS, no creds --
  // byte-parity with the lambda corsHeaders). Lambda precedence: OPTIONS -> 405(non-GET) -> 400(bad wallet
  // format) -> 404(box null). The 404 message collapses the lambda's "Wallet not registered" vs "User
  // profile not found" (the box returns one 404 for both); status + {message} shape are preserved.
  if (pathname === '/profile') {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = profileCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);

    // POST -- #2a de-Lambda get-user-profile CREATE. Byte-parity with the lambda POST create path
    // (index.ts:689-881): verifyJwt -> body required -> identityId required + == authenticated ->
    // provider/username required -> social-provider block -> create-only (409 if it already exists) ->
    // box :3211 /profile/create-mirror (ON CONFLICT DO NOTHING; box-only, no DynamoDB). The avatar
    // POST /upload-avatar-url sub-route is NOT here -- it stays on the lambda via the {proxy+} mount
    // (S3 presign). Gated on PROFILE_WRITE.enabled (COMPUTE_PROFILE_WRITE_ENABLED=1) so the box-direct
    // POST is INERT (503) until the API GW root POST is repointed at cutover.
    if (req.method === 'POST') {
      if (!PROFILE_WRITE.enabled) return send(res, 503, { message: 'profile write compute not enabled' }, cors);
      try {
        const identityId = await verifyJwtIdentity(req.headers['authorization'] as string | undefined);
        if (!identityId) return send(res, 401, { message: 'Authentication required' }, cors);
        const raw = await readBody(req);
        if (!raw) return send(res, 400, { message: 'Request body is required' }, cors);
        let postData: any;
        try { postData = JSON.parse(raw); } catch { return send(res, 400, { message: 'Invalid JSON body' }, cors); }
        if (!postData.identityId) return send(res, 400, { message: 'identityId is required' }, cors);
        if (postData.identityId !== identityId) return send(res, 403, { message: 'Forbidden. Identity mismatch.' }, cors);
        if (!postData.provider || !postData.username) {
          return send(res, 400, { message: 'provider and username are required for creating profile' }, cors);
        }
        if (['google', 'twitter'].includes(String(postData.provider).toLowerCase().trim())) {
          return send(res, 403, { message: 'Social provider profiles cannot be created directly. Use account linking.' }, cors);
        }
        // create-only parity (the lambda PutItem ConditionExpression attribute_not_exists -> 409). The
        // box reads first because /profile/create-mirror is ON CONFLICT DO NOTHING and cannot itself
        // report the conflict; a benign read-then-create TOCTOU on a concurrent self-create is
        // parity-acceptable at prototype scale (both requests create the same profile, no overwrite).
        const existing = await readProfileByIdentity(postData.identityId);
        if (existing) return send(res, 409, { message: 'Profile already exists' }, cors);
        await createProfileMirror({
          identityId: postData.identityId,
          provider: postData.provider,
          username: postData.username,
          email: postData.email,
          xHandle: postData.xHandle,
          twitterHandle: postData.twitterHandle,
          twitterId: postData.twitterId,
          profileImageUrl: postData.profileImageUrl,
        });
        return send(res, 201, { message: 'User profile created successfully', success: true }, cors);
      } catch (e) {
        if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
        console.error('[compute] /profile POST failed:', e instanceof Error ? e.message : e);
        return send(res, 500, { message: 'Internal server error' }, cors);
      }
    }

    // PATCH -- #2b de-Lambda get-user-profile UPDATE. Byte-parity with the lambda PATCH (index.ts:883-1312):
    // verifyJwt -> JSON -> linkedEthereum 410 -> collect+validate (displayName/linked sui+solana/avatarKey,
    // 400) -> empty guard 400 -> displayName rate-limit (atomic CAS via box :3211, 429) -> avatar ban (403)
    // -> cross-account collision (anti-Sybil fail-closed, 409/503) -> box :3211 /profile/attributes-sync
    // (box-only, no DynamoDB) -> re-read 200. Gated on PROFILE_PATCH.enabled (COMPUTE_PROFILE_PATCH_ENABLED=1)
    // so the box-direct PATCH is INERT (503) until the API GW root PATCH is repointed at cutover. RESIDUALS
    // dropped vs the lambda (best-effort, TTL-bounded): the S3 avatar delete-on-replace (no S3 egress) and
    // the chat-server/explorer/leaderboard cache-invalidation webhooks (those caches self-expire; the SoT
    // box + my-account reflect the change immediately).
    if (req.method === 'PATCH') {
      if (!PROFILE_PATCH.enabled) return send(res, 503, { message: 'profile patch compute not enabled' }, cors);
      try {
        const identityId = await verifyJwtIdentity(req.headers['authorization'] as string | undefined);
        if (!identityId) return send(res, 401, { message: 'Authentication required' }, cors);
        const raw = await readBody(req);
        let patchData: any;
        try { patchData = JSON.parse(raw || '{}'); } catch { return send(res, 400, { message: 'Invalid JSON body' }, cors); }
        if (!patchData || typeof patchData !== 'object' || Array.isArray(patchData)) {
          return send(res, 400, { message: 'Invalid JSON body' }, cors);
        }
        if ('linkedEthereumAddress' in patchData) {
          return send(res, 410, { message: 'linkedEthereumAddress paste-link is deprecated. Use the verified MetaMask flow to link an EVM wallet.' }, cors);
        }
        // collect + validate (all 400s before any write/side-effect, lambda order)
        const hasDisplayName = 'displayName' in patchData && typeof patchData.displayName === 'string';
        const hasAvatarKey = 'avatarKey' in patchData;
        const linkedInputs: Partial<Record<LinkChain, string | null>> = {};
        for (const { key, chain } of [
          { key: 'linkedSuiAddress', chain: 'sui' as LinkChain },
          { key: 'linkedSolanaAddress', chain: 'solana' as LinkChain },
        ]) {
          if (!(key in patchData)) continue;
          const v = patchData[key];
          if (v === null || v === '') linkedInputs[chain] = null;
          else if (typeof v === 'string') linkedInputs[chain] = v;
          else return send(res, 400, { message: `Invalid value for ${key}` }, cors);
        }
        const hasLinkedInputs = Object.keys(linkedInputs).length > 0;
        if (!hasDisplayName && !hasAvatarKey && !hasLinkedInputs) {
          return send(res, 400, { message: 'No valid fields to update' }, cors);
        }
        let validatedDisplayName: string | undefined;
        if (hasDisplayName) {
          const r = validateDisplayName(patchData.displayName as string);
          if (!r.ok) return send(res, 400, { message: r.message }, cors);
          validatedDisplayName = r.value;
        }
        const validatedLinks: Partial<Record<LinkChain, string | null>> = {};
        for (const [chain, rawv] of Object.entries(linkedInputs) as [LinkChain, string | null][]) {
          if (rawv === null) { validatedLinks[chain] = null; continue; }
          const r = validateLinkedAddress(chain, rawv);
          if (!r.ok) return send(res, 400, { message: r.message }, cors);
          validatedLinks[chain] = r.value;
        }
        let validatedAvatarKey: string | null | undefined;
        if (hasAvatarKey) {
          const av = patchData.avatarKey;
          if (av === null || av === '') validatedAvatarKey = null;
          else if (typeof av === 'string') {
            const r = validateAvatarKey(identityId, av);
            if (!r.ok) return send(res, 400, { message: r.message }, cors);
            validatedAvatarKey = r.value;
          } else {
            return send(res, 400, { message: 'Invalid avatarKey: must match profile-images/<your-id>/<uuid>.{png|jpg|jpeg|webp}' }, cors);
          }
        }
        // existence (404) -- the lambda's main UpdateItem ConditionExpression attribute_exists. Pulled to the
        // front of the side-effecting phase: a box attributes-sync UPDATE on a missing row is a 0-row no-op,
        // so the 404 must be an explicit pre-check (a missing-profile PATCH is a non-occurring edge -- a JWT
        // holder has a profile from login -- so the order vs the lambda's late 404 is immaterial). The
        // customAvatarBanned flag is read from this same unified profile.
        const existing = await readProfileByIdentity(identityId);
        if (!existing) return send(res, 404, { message: 'User profile not found' }, cors);
        // displayName rate-limit (atomic CAS on the box counter; lambda runs this BEFORE ban/collision)
        if (validatedDisplayName !== undefined) {
          const rl = await checkDisplayNameRateLimit(identityId, PROFILE_PATCH.rateLimitMax, PROFILE_PATCH.rateLimitWindowMs);
          if (rl.limited) {
            const windowDays = Math.round(PROFILE_PATCH.rateLimitWindowMs / (24 * 60 * 60 * 1000));
            return send(res, 429, {
              code: 'RATE_LIMITED',
              message: `Display name change limit reached (${PROFILE_PATCH.rateLimitMax} per ${windowDays} days).`,
              retryAfter: Math.round(PROFILE_PATCH.rateLimitWindowMs / 1000),
            }, cors);
          }
        }
        // avatar ban (only when SETTING a new key, not clearing)
        if (validatedAvatarKey !== undefined && validatedAvatarKey !== null && existing.customAvatarBanned === true) {
          return send(res, 403, { code: 'AVATAR_BANNED', message: 'Avatar uploads disabled. Contact support.', profile: existing }, cors);
        }
        // cross-account collision (anti-Sybil, FAIL-CLOSED): for each linked address being SET (not cleared)
        for (const [chain, addr] of Object.entries(validatedLinks) as [LinkChain, string | null][]) {
          if (!addr) continue;
          let priorOwner: string | null;
          try {
            priorOwner = await readLinkedAddressOwner(chain, addr, identityId);
          } catch {
            return send(res, 503, { code: 'COLLISION_CHECK_UNAVAILABLE', chain, message: 'Could not verify address uniqueness. Please retry shortly.' }, cors);
          }
          if (priorOwner) {
            return send(res, 409, { code: 'ADDRESS_ALREADY_LINKED', chain, message: `This ${chain} address is already linked to another account. Unlink it from the other account first, or contact support.` }, cors);
          }
        }
        // build the box attributes-sync set/remove maps (real field names; updatedAt NOT touched, parity with
        // the lambda's box mirror which excludes updatedAt so it cannot drift vs the frozen DDB follower).
        const nowIso = new Date().toISOString();
        const set: Record<string, string> = {};
        const remove: string[] = [];
        if (validatedDisplayName !== undefined) {
          set.customDisplayName = validatedDisplayName;
          set.displayNameUpdatedAt = nowIso;
        }
        for (const [chain, addr] of Object.entries(validatedLinks) as [LinkChain, string | null][]) {
          const field = LINK_FIELD[chain];
          if (addr === null) remove.push(field);
          else set[field] = addr;
        }
        if (validatedAvatarKey !== undefined) {
          set.customAvatarUpdatedAt = nowIso;
          if (validatedAvatarKey === null) remove.push('customAvatarKey');
          else set.customAvatarKey = validatedAvatarKey;
        }
        await syncProfileAttributes(identityId, set, remove);
        const unified = await readProfileByIdentity(identityId);
        return send(res, 200, unified ?? { success: true }, cors);
      } catch (e) {
        if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
        console.error('[compute] /profile PATCH failed:', e instanceof Error ? e.message : e);
        return send(res, 500, { message: 'Internal server error' }, cors);
      }
    }

    if (req.method !== 'GET') return send(res, 405, { message: 'Method Not Allowed' }, cors);
    if (!PROFILE_READ.enabled) return send(res, 503, { message: 'profile read compute not enabled' }, cors);
    try {
      const params = new URL(req.url || '/', 'http://localhost').searchParams;
      const walletAddress = params.get('walletAddress');
      const identityId = params.get('identityId');
      if (walletAddress) {
        const normalizedAddr = walletAddress.toLowerCase();
        if (!/^0x[0-9a-f]{64}$/.test(normalizedAddr)) {
          return send(res, 400, { message: 'Invalid wallet address format' }, cors);
        }
        const boxed = await readProfileByWallet(normalizedAddr);
        if (!boxed) return send(res, 404, { message: 'Wallet not registered' }, cors);
        return send(res, 200, boxed, cors);
      }
      if (identityId) {
        const boxed = await readProfileByIdentity(identityId);
        if (!boxed) return send(res, 404, { message: 'User profile not found' }, cors);
        return send(res, 200, boxed, cors);
      }
      return send(res, 400, { message: 'identityId or walletAddress is required' }, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error('[compute] /profile failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { message: 'Internal server error' }, cors);
    }
  }

  // #3a de-Lambda deactivate-user-account (DELETE /profile/deactivate). Byte-parity with the lambda
  // (deactivate-user-account/src/index.ts): NO incoming JWT (API GW authorizationType NONE) -- ownership is
  // the query identityId (Cognito regex) + provider matched against the stored profile, reproducing the
  // lambda's DDB ConditionExpression. The box has no atomic conditional status route, so the decision is a
  // loopback READ (:3211 /profile/by-identity) then, on a real deactivation, a loopback WRITE (:3211
  // /profile/status; box-only PG, NO DynamoDB). Decision ORDER is byte-faithful to the lambda's ALL_OLD
  // inspection: not-found(404) -> already-DEACTIVATED(200, provider-INDEPENDENT) -> provider-mismatch(403)
  // -> deactivate(202). The read-then-write TOCTOU is benign (idempotent + provider immutable concurrently).
  // deactivateCors (origin-allowlist, 'Content-Type', 'DELETE, OPTIONS'; no creds/sec headers, the lambda
  // corsHeader). Gated on DEACTIVATE.enabled (COMPUTE_DEACTIVATE_ENABLED=1) so the box-direct DELETE is INERT
  // (503) until the API GW root DELETE is repointed at cutover.
  if (pathname === '/profile/deactivate') {
    const origin = (req.headers['origin'] as string) || undefined;
    const cors = deactivateCors(origin);
    if (req.method === 'OPTIONS') return send(res, 200, {}, cors);
    if (req.method !== 'DELETE') return send(res, 405, { message: 'Method Not Allowed' }, cors);
    if (!DEACTIVATE.enabled) return send(res, 503, { message: 'deactivate compute not enabled' }, cors);
    try {
      const params = new URL(req.url || '/', 'http://localhost').searchParams;
      const identityId = params.get('identityId');
      const provider = params.get('provider');
      if (!identityId) return send(res, 400, { message: 'identityId query parameter is required' }, cors);
      if (!COGNITO_ID_REGEX.test(identityId)) return send(res, 400, { message: 'Invalid identityId format' }, cors);
      if (!provider || !['Google', 'Twitter', 'MetaMask'].includes(provider)) {
        return send(res, 400, { message: 'provider query parameter is required (Google, Twitter, or MetaMask)' }, cors);
      }
      const profile = await readProfileByIdentity(identityId);
      if (!profile) return send(res, 404, { message: 'Account not found' }, cors);
      // already-DEACTIVATED wins over provider-mismatch (lambda: ALL_OLD status check precedes the 403).
      if (profile.status === 'DEACTIVATED') {
        return send(res, 200, { message: 'Account is already scheduled for deletion.' }, cors);
      }
      if (profile.provider !== provider) {
        return send(res, 403, { message: 'Provider mismatch. Deactivation denied.' }, cors);
      }
      const deletionScheduledAt = Math.floor(Date.now() / 1000) + DEACTIVATE.graceSec;
      await setDeactivatedStatus(identityId, deletionScheduledAt);
      return send(res, 202, { message: 'Account deactivation request accepted.' }, cors);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.payload, cors);
      console.error('[compute] /profile/deactivate failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { message: 'Internal server error' }, cors);
    }
  }

  return send(res, 404, { error: 'not_found' }, publicCors());
});

server.listen(PORT, HOST, () => {
  console.log(`[compute] listening http://${HOST}:${PORT} schema=${SCHEMA} db=${PG.username}@${PG.host}:${PG.port}/${PG.database} login=${LOGIN.enabled ? 'on' : 'inert'} salt=${SALT.enabled ? 'on' : 'inert'} additional=${ADDITIONAL.enabled ? 'on' : 'inert'} tgverify=${TELEGRAM_VERIFY.enabled ? 'on' : 'inert'} govsponsor=${GOVERNANCE.sponsorEnabled ? 'on' : 'inert'} govvp=${GOVERNANCE.votingPowerEnabled ? 'on' : 'inert'} govcert=${GOVERNANCE.certEnabled ? 'on' : 'inert'} profileread=${PROFILE_READ.enabled ? 'on' : 'inert'} profilewrite=${PROFILE_WRITE.enabled ? 'on' : 'inert'} profilepatch=${PROFILE_PATCH.enabled ? 'on' : 'inert'} wallet=${WALLET.enabled ? 'on' : 'inert'} deactivate=${DEACTIVATE.enabled ? 'on' : 'inert'}`);
});

const shutdown = () => { sql.end({ timeout: 5 }).catch(() => {}); server.close(() => process.exit(0)); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
