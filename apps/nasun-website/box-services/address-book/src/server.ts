// nasun-address-book -- box-co-located de-Lambda compute service for the wallet address-book residual
// (AWS-exit Stage 4, wallet de-Lambda slice). The crown-jewel wallet ownership routes (register/list/remove)
// already live on identity-compute :3212; this service serves ONLY the address-book residual that still
// proxied to the 6pnnb6hcrd lambda under the api.nasun.io `/wallet/` prefix:
//   POST /wallet/challenge   -- issue a sign-in nonce (no auth)
//   POST /wallet/verify      -- verify the signed nonce, issue a self-issued HS256 address-book JWT (no auth)
//   GET  /wallet/address-book -- read the address book (HS256 JWT)
//   POST /wallet/address-book -- save the address book with optimistic concurrency (HS256 JWT)
//
// Single long-lived Node process on loopback :3215. At cutover the api.nasun.io vhost repoints the `/wallet/`
// PREFIX to it; the exact-match `/wallet/{register,remove,list}` locations stay on :3212, and (being exact `=`
// matches) take priority over the prefix, so they never reach this service.
//
// Routes are mounted under the `/wallet/` prefix so the nginx proxy_pass preserves the path (parity with the
// nasun-referral `/referral/*` mounting). Deployed as a single esbuild bundle (build.mjs -> dist/server.mjs).

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { PORT, HOST, ALLOWED_ORIGINS, PG } from './config';
import * as h from './handlers';
import { sql } from './db';
import { endWriteSql } from './write-pool';
import { startNonceSweeper, stopNonceSweeper } from './nonce';

// CORS byte-parity with the wallet-api lambda corsHeaders: matched origin else first allowed; methods
// GET,POST,DELETE,OPTIONS; headers Content-Type,Authorization. OPTIONS -> 200 empty body (the lambda's own
// explicit preflight handler returned 200, not 204).
function corsOrigin(origin: string | undefined): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

const app = new Hono();

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', corsOrigin(c.req.header('origin')));
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  c.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (c.req.method === 'OPTIONS') return c.body('', 200);
  await next();
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'nasun-address-book' }, 200));

function send(c: Context, r: h.Result) {
  return c.json(r.body, r.status as 200);
}

// Wrap a handler so any thrown error becomes a 500 (parity with the lambda's top-level try/catch).
function route(name: string, fn: (c: Context) => Promise<h.Result>) {
  return async (c: Context) => {
    try {
      return send(c, await fn(c));
    } catch (e) {
      console.error(`[address-book] ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  };
}

app.post('/wallet/challenge', route('challenge', async (c) => h.handleChallenge(await c.req.text())));
app.post('/wallet/verify', route('verify', async (c) => h.handleVerify(await c.req.text())));
app.get('/wallet/address-book', route('get-address-book', (c) => h.handleGetAddressBook(c.req.header('authorization'))));
app.post('/wallet/address-book', route('save-address-book', async (c) => h.handleSaveAddressBook(c.req.header('authorization'), await c.req.text())));

app.notFound((c) => c.json({ error: 'Not Found', message: 'Unknown route' }, 404));

// The frontend builds these URLs as `${apiEndpoint}/challenge` with apiEndpoint = "https://api.nasun.io/wallet/"
// (trailing slash), producing a DOUBLE slash "/wallet//challenge". The live lambda absorbs it (getPathSegment
// splits + drops empty segments); nginx merge_slashes (default on) collapses it before proxying. To not depend
// on that nginx default at cutover, collapse repeated slashes in the path here before Hono routes the request.
function normalizedFetch(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  const collapsed = url.pathname.replace(/\/{2,}/g, '/');
  if (collapsed === url.pathname) return app.fetch(req);
  url.pathname = collapsed;
  return app.fetch(new Request(url, req));
}

startNonceSweeper();

const server = serve({ fetch: normalizedFetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`[address-book] listening http://${info.address}:${info.port} db=${PG.username}@${PG.host}/${PG.database} origins=${ALLOWED_ORIGINS.length}`);
});

const shutdown = () => {
  stopNonceSweeper();
  sql.end({ timeout: 5 }).catch(() => {});
  endWriteSql().catch(() => {});
  server.close(() => process.exit(0));
};
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, shutdown);
