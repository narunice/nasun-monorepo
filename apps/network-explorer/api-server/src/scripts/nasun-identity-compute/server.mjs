// Nasun identity-COMPUTE service -- box-co-located de-Lambda compute surface (AWS-exit #4, C0).
//
// This is the NEW service that will progressively absorb the identity Lambda *handler* logic
// (signature verify, nonce, zkLogin, OAuth, telegram, rate-limit, oracle signing), running it
// co-located with the box Postgres so each request's queries are local (no cross-atlantic hop).
// It is DISTINCT from:
//   - nasun-issuer   (:3210, /mint /salt /jwks)   -- mints/verifies JWTs
//   - nasun-identity (:3211, /identity/* CRUD)     -- DB CRUD mirror, server-to-server bearer
// and from those it differs by being the home for *business/crypto* compute, not just CRUD.
//
// C0 scaffold scope (this file): two read-only routes only --
//   GET /health  -> liveness
//   GET /count   -> user_profiles count (de-Lambda target for nasun-common-get-user-count, slice C1)
// No external network calls (loopback PG only), so the systemd unit keeps IPAddressDeny=any. Later
// slices that call Twitter/Telegram/Sui RPC will need egress and a unit change (documented in README).
//
// Design choice (C0): authored as a single hand-written .mjs to match the box service convention
// (issuer/identity are both plain .mjs, no build step) and apply YAGNI -- /health + count(*) gain
// nothing from TypeScript. When the first crypto handler lands (C3: signature/zkLogin verify), revisit
// migrating this service to TS + esbuild bundle for type-safety on the security-critical paths.
//
// Secret delivery mirrors issuer/identity (systemd LoadCredentialEncrypted -> tmpfs
// $CREDENTIALS_DIRECTORY, host-bound, auto-removed on stop):
//   pg-password      -- nasun_compute_ro DB password (SELECT-only role; grows per slice).
//   compute-bearer   -- shared secret the API Gateway HTTP-proxy presents to call these routes.

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const PORT = Number(process.env.COMPUTE_PORT || 3212);
const HOST = process.env.COMPUTE_BIND || '127.0.0.1';
const SCHEMA = process.env.COMPUTE_PG_SCHEMA || 'public';

const PG_HOST = process.env.COMPUTE_PG_HOST || '127.0.0.1';
const PG_PORT = Number(process.env.COMPUTE_PG_PORT || 5432);
const PG_DB = process.env.COMPUTE_PG_DATABASE || 'nasun_dal';
const PG_USER = process.env.COMPUTE_PG_USER || 'nasun_compute_ro';

const credDir = process.env.CREDENTIALS_DIRECTORY;
const PG_PASSWORD_FILE = process.env.COMPUTE_PG_PASSWORD_FILE || (credDir ? `${credDir}/pg-password` : null);
const BEARER_FILE = process.env.COMPUTE_BEARER_FILE || (credDir ? `${credDir}/compute-bearer` : null);

const fatal = (m) => { console.error(`[compute] FATAL: ${m}`); process.exit(1); };
if (!PG_PASSWORD_FILE) fatal('pg-password not provided (CREDENTIALS_DIRECTORY/pg-password or COMPUTE_PG_PASSWORD_FILE)');
if (!BEARER_FILE) fatal('compute-bearer not provided (CREDENTIALS_DIRECTORY/compute-bearer or COMPUTE_BEARER_FILE)');

let pgPassword;
try { pgPassword = readFileSync(PG_PASSWORD_FILE, 'utf8').trim(); } catch (e) { fatal(`cannot read pg-password: ${e.message}`); }
let bearer;
try { bearer = Buffer.from(readFileSync(BEARER_FILE, 'utf8').trim()); } catch (e) { fatal(`cannot read compute-bearer: ${e.message}`); }
if (bearer.length < 16) fatal('compute-bearer too short (>=16 bytes required)');

const sql = postgres({
  host: PG_HOST, port: PG_PORT, database: PG_DB, username: PG_USER, password: pgPassword,
  max: 4, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: '15000', lock_timeout: '8000', idle_in_transaction_session_timeout: '15000' },
});

// Constant-time bearer check (issuer/identity pattern). Returns false on any mismatch or absence.
function authorized(req) {
  const header = req.headers['authorization'] || '';
  const presented = header.startsWith('Bearer ') ? Buffer.from(header.slice(7)) : Buffer.alloc(0);
  return presented.length === bearer.length && timingSafeEqual(presented, bearer);
}

// Access-Control-Allow-Origin: * on every response. These routes serve PUBLIC data (the user count is
// public) and are fronted by API Gateway HTTP_PROXY, which passes the backend's headers through to the
// browser; without this header a cross-origin fetch from nasun.io would be blocked. ACAO:* is safe here
// because auth is a server-to-server bearer in the Authorization header (not browser cookies), and
// browsers reject ACAO:* in credentialed mode, so it never exposes a bearer-gated response to a page.
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

// --- GET /count ----------------------------------------------------------------------------
// De-Lambda target for nasun-common-get-user-count (slice C1). Byte-parity with the existing
// nasun-identity handleProfileCount (server.mjs:943): SET LOCAL search_path then count(*)::int on
// user_profiles, returned as { count, tableName, updatedAt }. The get-user-count Lambda already
// serves this exact box value today via /identity/profile/count (READ flip); C1 just moves the HTTP
// termination off Lambda. nasun_compute_ro has SELECT on user_profiles only.
async function handleCount() {
  return await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM user_profiles`;
    return { status: 200, body: { count: n, tableName: 'UserProfiles', updatedAt: new Date().toISOString() } };
  });
}

// Public GET routes (NO bearer): the user count is public data -- the old get-user-count Lambda served
// it without any authorizer, and the API Gateway HTTP_PROXY in front cannot present a bearer. Exposure
// is unchanged: the Cloudflare origin-lock (only CF reaches the box) + nginx rate-limit gate it, same as
// the old public Lambda behind WAF. ACAO:* (see send) lets the browser read it cross-origin.
const PUBLIC_GET_ROUTES = { '/count': handleCount };
// Bearer-gated GET routes (server-to-server, API GW injects the bearer). Empty until an authenticated
// read slice lands; the compute-bearer infra stays provisioned for it.
const GET_ROUTES = {};

const server = createServer(async (req, res) => {
  let parsed;
  try { parsed = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'bad_url' }); }
  const pathname = parsed.pathname;

  // Health is public (liveness probe parity with nasun-identity /health): no bearer. Liveness only --
  // no schema/DB detail in the body (the /compute/ nginx location exposes this past the origin-lock).
  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { status: 'ok', service: 'nasun-identity-compute' });
  }

  if (req.method === 'GET') {
    const pub = PUBLIC_GET_ROUTES[pathname];
    const handler = pub || GET_ROUTES[pathname];
    if (!handler) return send(res, 404, { error: 'not_found' });
    if (!pub && !authorized(req)) return send(res, 401, { error: 'unauthorized' });
    try {
      const { status, body } = await handler(parsed.searchParams);
      return send(res, status, body);
    } catch (e) {
      // C3+ note: when validated crypto handlers land they will throw a typed RouteAbort for 4xx
      // cases (see nasun-identity server.mjs); add `if (e instanceof RouteAbort) return send(res,
      // e.status, e.body)` here then so input errors don't collapse into a generic 500.
      console.error(`[compute] ${pathname} failed:`, e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'internal_error' });
    }
  }

  return send(res, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, () => {
  console.log(`[compute] listening http://${HOST}:${PORT} schema=${SCHEMA} db=${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}`);
});

const shutdown = () => { sql.end({ timeout: 5 }).catch(() => {}); server.close(() => process.exit(0)); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
