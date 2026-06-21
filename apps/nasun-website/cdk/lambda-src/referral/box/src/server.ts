// nasun-referral -- box-co-located de-Lambda compute service for the referral system (AWS-exit Stage 4).
// Serves the 5 user routes (/referral/*), the 4 admin routes (/admin/referral-review*), and the internal
// routes (/internal/referral-mappings, /internal/referral-activated/:id) off the box nasun_dal referrals /
// referral_codes mirror, byte-faithful to the referral lambda + the admin-api referral handlers. Single
// long-lived Node process on loopback :3214; the api.nasun.io vhost repoints /referral/ + /admin/referral-
// review* to it at the Phase 3 cutover, and the node-3 explorer-api repoints REFERRAL_MAPPINGS_URL +
// onboarding gate to /internal/*. Deployed as a single esbuild bundle (build.mjs -> dist/server.mjs).
//
// Auth tiers: user routes = dual-jwks Bearer -> identityId (always on); admin routes = dual-jwks + box ADMIN
// role, gated behind COMPUTE_ADMIN_ENABLED (503 inert until Phase 3b cutover); internal routes = x-api-key
// (cross-host caller on node-3, so NOT loopback-only).

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { PORT, HOST, ALLOWED_ORIGINS, ADMIN_ENABLED, internalApiKey } from './config';
import { verifyIdentityFromBearer, authenticateAdmin, checkInternalApiKey, type AdminUser } from './auth';
import * as user from './user-handlers';
import * as admin from './admin-handlers';
import * as internal from './internal-handlers';
import { sql } from './db';
import { endWriteSql } from './write-pool';

// CORS (byte-parity with the referral lambda corsHeaders: matched origin else first allowed; methods
// GET,POST,OPTIONS; headers Content-Type,Authorization).
function corsOrigin(origin: string | undefined): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

const app = new Hono();

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', corsOrigin(c.req.header('origin')));
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key');
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (c.req.method === 'OPTIONS') return c.body(null, 204); // API GW defaultCorsPreflightOptions parity
  await next();
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'nasun-referral' }, 200));

type Result = { status: number; body: Record<string, unknown> };

// User routes: dual-jwks Bearer -> identityId. A missing/invalid token = 401 (the lambda API GW authorizer
// would Deny -> 403; the box returns 401, an accepted auth-layer artifact, same as the leaderboard admin).
function userRoute(name: string, fn: (identityId: string, c: Context) => Promise<Result>) {
  return async (c: Context) => {
    const identityId = await verifyIdentityFromBearer(c.req.header('authorization'));
    if (!identityId) return c.json({ error: 'UNAUTHORIZED', message: 'Missing identity' }, 401);
    try {
      const { status, body } = await fn(identityId, c);
      return c.json(body, status as 200);
    } catch (e) {
      console.error(`[referral] ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, 500);
    }
  };
}

app.get('/referral/my-code', userRoute('my-code', (id) => user.handleMyCode(id)));
app.post('/referral/apply', userRoute('apply', async (id, c) => user.handleApply(id, await c.req.text())));
app.get('/referral/my-stats', userRoute('my-stats', (id) => user.handleMyStats(id)));
app.get('/referral/my-referees', userRoute('my-referees', (id, c) => {
  const q = c.req.query();
  return user.handleMyReferees(id, { cursor: q.cursor, limit: q.limit });
}));
app.post('/referral/appeal', userRoute('appeal', async (id, c) => user.handleAppeal(id, await c.req.text())));

// Admin routes: 503 inert until COMPUTE_ADMIN_ENABLED=1 (Phase 3b) + dual-jwks ADMIN role (401). Bodies
// parsed leniently. Validated write-then-read at cutover (NOT shadow-validated -- they mutate).
function adminRoute(name: string, fn: (c: Context, a: AdminUser, body: Record<string, unknown>) => Promise<Result>) {
  return async (c: Context) => {
    if (!ADMIN_ENABLED) return c.json({ error: 'admin compute not enabled' }, 503);
    const adminUser = await authenticateAdmin(c.req.header('authorization'));
    if (!adminUser) return c.json({ error: 'Unauthorized' }, 401);
    let body: Record<string, unknown> = {};
    if (c.req.method !== 'GET') body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    try {
      const { status, body: out } = await fn(c, adminUser, body);
      return c.json(out, status as 200);
    } catch (e) {
      // Generic message to the client (parity with the lambda admin handler export-whitelist.ts:2287; avoids
      // leaking PG error detail/schema). Full error is logged server-side.
      console.error(`[referral] admin ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
}

app.get('/admin/referral-review', adminRoute('review-list', (c) => admin.listReferralReview(c.req.query())));
app.post('/admin/referral-review/approve', adminRoute('approve', (c, a, body) => admin.approveHandler(body, a)));
app.post('/admin/referral-review/decline', adminRoute('decline', (c, a, body) => admin.declineHandler(body, a)));
app.post('/admin/referral-review/resolve-appeal', adminRoute('resolve-appeal', (c, a, body) => admin.resolveAppealHandler(body, a)));

// Internal routes: x-api-key (cross-host caller = node-3 explorer-api; NOT loopback-only).
function internalRoute(name: string, fn: (c: Context) => Promise<Result>) {
  return async (c: Context) => {
    if (!checkInternalApiKey(c.req.header('x-api-key'), internalApiKey())) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const { status, body } = await fn(c);
      return c.json(body, status as 200);
    } catch (e) {
      console.error(`[referral] internal ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
}

app.get('/internal/referral-mappings', internalRoute('referral-mappings', () => internal.referralMappings()));
app.get('/internal/referral-activated/:id', internalRoute('referral-activated', (c) => internal.referralActivated(c.req.param('id') ?? '')));

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Unknown endpoint' }, 404));

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`[referral] listening http://${info.address}:${info.port} db=${process.env.REFERRAL_PG_USER || 'nasun_compute_ro'}@${process.env.REFERRAL_PG_HOST || '127.0.0.1'}/${process.env.REFERRAL_PG_DATABASE || 'nasun_dal'} admin=${ADMIN_ENABLED ? 'on' : 'inert'} origins=${ALLOWED_ORIGINS.length}`);
});

const shutdown = () => {
  sql.end({ timeout: 5 }).catch(() => {});
  endWriteSql().catch(() => {});
  server.close(() => process.exit(0));
};
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, shutdown);
