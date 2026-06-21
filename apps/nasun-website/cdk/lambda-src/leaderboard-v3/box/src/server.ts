// nasun-leaderboard -- box-co-located de-Lambda compute service for the community Leaderboard V3 read API
// (AWS-exit Stage 4 leaderboard slice). Serves the 6 public read routes off the box nasun_dal lb_* mirror,
// byte-faithful to the leaderboard-v3 lambda handlers. Single long-lived Node process on a loopback port
// (127.0.0.1:3213); the api.nasun.io vhost repoints /v3/leaderboard/* + /v3/accounts/* to it at the Phase 3
// cutover. Deployed as a single esbuild bundle (build.mjs -> dist/server.mjs), preserving the box
// "scp one server.mjs" contract used by the sibling identity-compute/identity/issuer services.
//
// NOT served here (stay on the lambda until ported): /v3/feed/featured (curated read), /v3/admin/* (admin
// writes), /v3/posts (create-post), telegram (already proxied to issuer.nasun.io/compute/telegram/*).
// nginx routes per-path, so a partial cutover is safe.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { PORT, HOST, ALLOWED_ORIGINS, ADMIN_ENABLED } from './config';
import { authenticateAdmin, type AdminUser } from './auth';
import * as admin from './admin-handlers';
import {
  getLeaderboard,
  getMyRank,
  getRankHistory,
  getTopClimbers,
  getAccount,
  searchAccounts,
  getFeaturedFeed,
  type Result,
} from './read-handlers';
import { sql } from './db';

// CORS (byte-parity with utils/cors.ts: matched origin, else the first allowed origin as fallback).
function corsOrigin(origin: string | undefined): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function applyCors(c: Context): void {
  c.header('Access-Control-Allow-Origin', corsOrigin(c.req.header('origin')));
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Username');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
}

const app = new Hono();

// CORS on every response + a blanket OPTIONS 200 (parity: each lambda returns 200 for OPTIONS preflight).
app.use('*', async (c, next) => {
  applyCors(c);
  if (c.req.method === 'OPTIONS') return c.body(null, 200);
  await next();
});

// Wrap a read handler: run it, JSON-respond, 500 on throw (parity with each handler's try/catch).
function route(name: string, fn: (c: Context) => Promise<Result>) {
  return async (c: Context) => {
    try {
      const { status, body } = await fn(c);
      return c.json(body, status as 200);
    } catch (e) {
      console.error(`[leaderboard] ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
}

app.get('/health', (c) => c.json({ status: 'ok', service: 'nasun-leaderboard' }, 200));

app.get('/v3/leaderboard', route('get-leaderboard', (c) => getLeaderboard(c.req.query())));
app.get('/v3/leaderboard/top-climbers', route('get-top-climbers', (c) => getTopClimbers(c.req.query())));
app.get('/v3/leaderboard/my-rank', route('get-my-rank', (c) => getMyRank(c.req.query())));
app.get('/v3/leaderboard/rank-history', route('get-rank-history', (c) => getRankHistory(c.req.query())));
// 'search' is a static segment -> Hono matches it before the ':username' param route (parity with the API
// GW route-ordering note in leaderboard-v3-stack.ts).
app.get('/v3/accounts/search', route('search-accounts', (c) => searchAccounts(c.req.query())));
app.get('/v3/accounts/:username', route('get-account', (c) => getAccount(c.req.param('username'), c.req.query())));
app.get('/v3/feed/featured', route('get-featured-feed', (c) => getFeaturedFeed(c.req.query())));

// Admin/write routes: gated behind ADMIN_ENABLED (503 inert until the Phase 3 cutover) + dual-jwks admin
// auth (401). Bodies parsed leniently. Validated write-then-read at cutover (NOT shadow-validated, they mutate).
function adminRoute(name: string, fn: (c: Context, adminUser: AdminUser, body: Record<string, unknown>) => Promise<admin.Result>) {
  return async (c: Context) => {
    if (!ADMIN_ENABLED) return c.json({ error: 'admin compute not enabled' }, 503);
    const adminUser = await authenticateAdmin(c.req.header('authorization'));
    if (!adminUser) return c.json({ error: 'Unauthorized' }, 401);
    let body: Record<string, unknown> = {};
    if (c.req.method !== 'GET' && c.req.method !== 'DELETE') {
      body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    }
    try {
      const { status, body: out } = await fn(c, adminUser, body);
      return c.json(out, status as 200);
    } catch (e) {
      console.error(`[leaderboard] admin ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: e instanceof Error ? e.message : 'Internal server error' }, 500);
    }
  };
}

app.post('/v3/posts', adminRoute('create-post', (c, a, body) => admin.createPostHandler(body, a)));
app.on(['GET', 'POST'], '/v3/admin/blacklist', adminRoute('blacklist', (c, a, body) => admin.blacklistHandler(c.req.method, undefined, body, a)));
app.delete('/v3/admin/blacklist/:accountId', adminRoute('blacklist-del', (c, a) => admin.blacklistHandler('DELETE', c.req.param('accountId'), {}, a)));
app.post('/v3/admin/adjust-score', adminRoute('adjust-score', (c, a, body) => admin.adjustScoreHandler(body)));
app.on(['GET', 'POST'], '/v3/admin/seasons', adminRoute('seasons', (c, a, body) => admin.seasonsHandler(c.req.method, undefined, undefined, body, a)));
app.on(['GET', 'PATCH', 'DELETE'], '/v3/admin/seasons/:seasonId', adminRoute('season', (c, a, body) => admin.seasonsHandler(c.req.method, c.req.param('seasonId'), undefined, body, a)));
app.post('/v3/admin/seasons/:seasonId/activate', adminRoute('season-activate', (c, a, body) => admin.seasonsHandler('POST', c.req.param('seasonId'), 'activate', body, a)));
app.post('/v3/admin/seasons/:seasonId/end', adminRoute('season-end', (c, a, body) => admin.seasonsHandler('POST', c.req.param('seasonId'), 'end', body, a)));
app.patch('/v3/admin/posts/:postId', adminRoute('edit-post', (c, a, body) => admin.editPostHandler(c.req.param('postId'), body)));
app.on(['GET', 'PUT'], '/v3/admin/featured-feed', adminRoute('featured-feed', (c, a, body) => admin.featuredFeedHandler(c.req.method, body, a)));
app.get('/v3/admin/stats', adminRoute('stats', () => admin.statsHandler()));
app.post('/v3/admin/merge-accounts', adminRoute('merge', (c, a, body) => admin.mergeHandler(body, a)));
app.post('/v3/admin/snapshot', adminRoute('snapshot', (c, a, body) => admin.snapshotHandler(body)));

app.notFound((c) => c.json({ error: 'not_found' }, 404));

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`[leaderboard] listening http://${info.address}:${info.port} db=${process.env.LEADERBOARD_PG_USER || 'nasun_compute_ro'}@${process.env.LEADERBOARD_PG_HOST || '127.0.0.1'}/${process.env.LEADERBOARD_PG_DATABASE || 'nasun_dal'} origins=${ALLOWED_ORIGINS.join(',')}`);
});

const shutdown = () => {
  sql.end({ timeout: 5 }).catch(() => {});
  server.close(() => process.exit(0));
};
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, shutdown);
