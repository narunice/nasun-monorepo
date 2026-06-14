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
import postgres from 'postgres';
import { PORT, HOST, SCHEMA, PG, LOGIN, SALT, ADDITIONAL, TELEGRAM_VERIFY, GOVERNANCE } from './config';
import { publicCors, loginCors, saltCors, additionalCors, governanceCors, send, RouteAbort } from './http';
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
  handleChallenge as handleAdditionalChallenge,
  handleVerify as handleAdditionalVerify,
  handleLabel as handleAdditionalLabel,
  handleRemove as handleAdditionalRemove,
  handleAppBinding as handleAdditionalAppBinding,
} from './handlers-additional';

// C4-1 additional-wallet action -> required HTTP method (parity with the lambda API GW route mounts).
const ADDITIONAL_METHODS: Record<string, string> = {
  challenge: 'POST', verify: 'POST', label: 'PATCH', remove: 'DELETE', 'app-binding': 'PATCH',
};

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

  return send(res, 404, { error: 'not_found' }, publicCors());
});

server.listen(PORT, HOST, () => {
  console.log(`[compute] listening http://${HOST}:${PORT} schema=${SCHEMA} db=${PG.username}@${PG.host}:${PG.port}/${PG.database} login=${LOGIN.enabled ? 'on' : 'inert'} salt=${SALT.enabled ? 'on' : 'inert'} additional=${ADDITIONAL.enabled ? 'on' : 'inert'} tgverify=${TELEGRAM_VERIFY.enabled ? 'on' : 'inert'} govsponsor=${GOVERNANCE.sponsorEnabled ? 'on' : 'inert'} govvp=${GOVERNANCE.votingPowerEnabled ? 'on' : 'inert'} govcert=${GOVERNANCE.certEnabled ? 'on' : 'inert'}`);
});

const shutdown = () => { sql.end({ timeout: 5 }).catch(() => {}); server.close(() => process.exit(0)); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
