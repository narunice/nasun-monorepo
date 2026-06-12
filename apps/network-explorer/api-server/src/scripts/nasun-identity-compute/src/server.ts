// nasun-identity-compute -- box-co-located de-Lambda compute service (AWS-exit #4).
// C0/C1: GET /health, GET /count (public). C3a: POST /auth/{sui,metamask}/{prepare,connect-verify}
// (login compute lifted off the auth-sui/auth-metamask lambdas; in-memory nonce + issuer/identity
// loopback). nginx `location /compute/ -> :3212/` strips the prefix, so the box sees /auth/sui/prepare.
//
// Single loopback Node process (127.0.0.1), so the in-memory nonce store is correct. All C3a deps are
// loopback (issuer :3210, identity :3211) -> NO external egress -> systemd IPAddressDeny=any stays.
// Migrated to TS + esbuild bundle at C3a (crypto-critical); the deployed artifact is a single bundled
// server.mjs (build.mjs), preserving the box "scp one .mjs" contract.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import postgres from 'postgres';
import { PORT, HOST, SCHEMA, PG, LOGIN } from './config';
import { publicCors, loginCors, send, RouteAbort } from './http';
import {
  handleSuiPrepare,
  handleSuiConnectVerify,
  handleEvmPrepare,
  handleEvmConnectVerify,
} from './handlers';

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

  return send(res, 404, { error: 'not_found' }, publicCors());
});

server.listen(PORT, HOST, () => {
  console.log(`[compute] listening http://${HOST}:${PORT} schema=${SCHEMA} db=${PG.username}@${PG.host}:${PG.port}/${PG.database} login=${LOGIN.enabled ? 'on' : 'inert'}`);
});

const shutdown = () => { sql.end({ timeout: 5 }).catch(() => {}); server.close(() => process.exit(0)); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
