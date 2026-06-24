// nasun-bug-report -- box-co-located de-Lambda compute service for the bug-report + creator-posts system
// (AWS-exit Stage 4, BugReportStack slice). Serves the user routes (/bug-report/*, /v1/creator-posts*) and the
// admin routes (/admin/bug-reports*, /admin/creator-posts*) off the box nasun_dal bug_reports / creator_posts
// mirror, byte-faithful to the bug-report + bug-report-admin lambdas. Screenshots live on the box filesystem
// (S3 presigned POST/GET replacement). Single long-lived Node process on loopback :3216; the api.nasun.io
// vhost repoints /feedback/ to it at cutover (nginx strips /feedback -> this service sees /bug-report etc).
//
// Auth: user routes = dual-jwks Bearer -> identityId; admin routes = dual-jwks + box user_profiles ADMIN role.
// Screenshot upload/serve = HMAC-signed token in the form/query (no Bearer possible on a FormData POST / <img>).
//
// The routes are mounted at BOTH `/` and `/feedback` so the service works whether nginx strips the /feedback
// prefix (proxy_pass .../) or preserves it (proxy_pass ...) -- de-risks the cutover. Deployed as a single
// esbuild bundle (build.mjs -> dist/server.mjs).

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PORT, HOST, ALLOWED_ORIGINS, AUTH, writeCred } from './config';
import { verifyIdentityFromBearer, authenticateAdmin } from './auth';
import type { Result } from './result';
import * as bug from './bug-report-handlers';
import * as cp from './creator-posts-handlers';
import * as admin from './admin-handlers';
import { verifyUpload, writeScreenshot, serveScreenshot, MAX_SCREENSHOT_SIZE } from './screenshots';
import { runBackfill, runPrune } from './backfill';
import { sql } from './db';
import { endWriteSql } from './write-pool';

// CORS (byte-parity with the lambda getCorsHeaders: matched origin else first allowed; methods
// GET,POST,PATCH,OPTIONS; headers Content-Type,Authorization).
function corsOrigin(origin: string | undefined): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

// ---- route table (mounted at / and /feedback) ----------------------------------------------------

const routes = new Hono();

routes.get('/health', (c) => c.json({ status: 'ok', service: 'nasun-bug-report' }, 200));

// User routes: dual-jwks Bearer -> identityId. Missing/invalid token = 401 (auth-layer artifact, same as the
// sibling box services).
function userRoute(name: string, fn: (identityId: string, c: Context) => Promise<Result>) {
  return async (c: Context) => {
    const identityId = await verifyIdentityFromBearer(c.req.header('authorization'));
    if (!identityId) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const { status, body } = await fn(identityId, c);
      return c.json(body as object, status as 200);
    } catch (e) {
      console.error(`[bug-report] ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
}

// Admin routes: dual-jwks + box ADMIN role (401 otherwise). Bodies parsed leniently (-> {} on bad JSON).
function adminRoute(name: string, fn: (adminId: string, c: Context) => Promise<Result>) {
  return async (c: Context) => {
    const adminId = await authenticateAdmin(c.req.header('authorization'));
    if (!adminId) return c.json({ error: 'Unauthorized: admin access required' }, 401);
    try {
      const { status, body } = await fn(adminId, c);
      return c.json(body as object, status as 200);
    } catch (e) {
      console.error(`[bug-report] admin ${name} failed:`, e instanceof Error ? e.message : e);
      return c.json({ error: 'Internal server error' }, 500);
    }
  };
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
}

// --- bug-report user ---
routes.post('/bug-report', userRoute('submit', async (id, c) => bug.handleSubmit(id, await c.req.text())));
routes.get('/bug-report/my-reports', userRoute('my-reports', (id) => bug.handleMyReports(id)));
routes.get('/bug-report/upload-url', userRoute('upload-url', (id, c) => Promise.resolve(bug.handleUploadUrl(id, c.req.query('contentType')))));
routes.post('/bug-report/:reportId/reply', userRoute('reply', async (id, c) => bug.handleReply(id, c.req.param('reportId') ?? '', await c.req.text())));

// --- screenshots (token-authed; no Bearer) ---
// Presigned-POST replacement: the frontend POSTs a FormData (fields from upload-url + the file). The signed
// token in the fields authorizes + binds (key, contentType, exp). Returns 204 (S3 presigned POST parity).
routes.post('/bug-report/screenshot-upload', bodyLimit({
  // Streaming cap (covers chunked / spoofed / absent Content-Length): aborts before the body is fully
  // buffered into memory. Slightly above MAX to allow multipart envelope overhead; the exact 5MB file-size
  // check still runs post-parse below.
  maxSize: MAX_SCREENSHOT_SIZE + 1024 * 1024,
  onError: (c) => c.json({ error: 'File too large' }, 413),
}), async (c) => {
  const cl = Number(c.req.header('content-length') || '0');
  if (cl && cl > MAX_SCREENSHOT_SIZE + 1024 * 1024) return c.json({ error: 'File too large' }, 413);
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid upload' }, 400);
  }
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : undefined;
  };
  const v = verifyUpload({ key: str('key'), contentType: str('Content-Type'), exp: str('x-exp'), sig: str('x-sig') });
  if (!v.ok) return c.json({ error: v.error }, v.status as 400);
  const file = form.get('file');
  if (!file || typeof file === 'string') return c.json({ error: 'file is required' }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_SCREENSHOT_SIZE) return c.json({ error: 'Invalid file size' }, 400);
  await writeScreenshot(v.key, buf);
  return c.body(null, 204);
});

// Presigned-GET replacement: signed query (?key&exp&sig), serves the image bytes for an admin <img src>.
routes.get('/bug-report/screenshot', async (c) => {
  const r = await serveScreenshot({ key: c.req.query('key'), exp: c.req.query('exp'), sig: c.req.query('sig') });
  if (!r.ok) return c.body(null, r.status as 404);
  // new Response (not c.body) so the Buffer body is accepted as BodyInit; CORS headers are not needed on an <img>.
  // nosniff + a deny-all CSP are critical: screenshots are served from api.nasun.io (same origin family as the
  // app), so without these a screenshot whose bytes are actually HTML/JS could be MIME-sniffed and executed on
  // this origin (stored XSS against the admin). With nosniff the browser honors the image content-type strictly.
  return new Response(r.body, {
    status: 200,
    headers: {
      'Content-Type': r.contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
    },
  });
});

// --- creator-posts user ---
routes.post('/v1/creator-posts', userRoute('cp-submit', async (id, c) => cp.handleCreatorPostSubmit(id, await c.req.text())));
routes.get('/v1/creator-posts/my', userRoute('cp-my', (id, c) => cp.handleCreatorPostMyList(id, { limit: c.req.query('limit'), cursor: c.req.query('cursor') })));

// --- bug-report admin ---
routes.get('/admin/bug-reports', adminRoute('br-list', (_a, c) => admin.handleBugReportList({ status: c.req.query('status') })));
routes.patch('/admin/bug-reports/:reportId', adminRoute('br-update', async (_a, c) => admin.handleBugReportUpdate(c.req.param('reportId') ?? '', await jsonBody(c))));

// --- creator-posts admin ---
routes.get('/admin/creator-posts', adminRoute('cp-list', (_a, c) => admin.handleCreatorPostsList({ status: c.req.query('status'), limit: c.req.query('limit'), cursor: c.req.query('cursor') })));
routes.patch('/admin/creator-posts/:postId/score', adminRoute('cp-score', async (a, c) => admin.handleCreatorPostScore(c.req.param('postId') ?? '', a, await jsonBody(c))));
routes.patch('/admin/creator-posts/:postId/reject', adminRoute('cp-reject', async (a, c) => admin.handleCreatorPostReject(c.req.param('postId') ?? '', a, await jsonBody(c))));
routes.post('/admin/creator-posts/:postId/grant', adminRoute('cp-grant', (a, c) => admin.handleCreatorPostGrant(c.req.param('postId') ?? '', a)));

routes.notFound((c) => c.json({ error: 'Not found' }, 404));

// ---- app (CORS + dual mount) ---------------------------------------------------------------------

const app = new Hono();
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', corsOrigin(c.req.header('origin')));
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});
app.route('/feedback', routes); // nginx preserves the /feedback prefix
app.route('/', routes);         // nginx strips the /feedback prefix

// Fail-closed landmine guard: an empty audience makes verifyIdentityFromBearer reject ALL tokens (every
// authenticated route 401s). Surface it loudly at boot rather than discovering it as a silent outage at cutover.
if (!AUTH.audience) {
  console.warn('[bug-report] WARNING: COGNITO_IDENTITY_POOL_ID (JWT audience) is unset -- ALL authenticated routes will 401.');
}

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`[bug-report] listening http://${info.address}:${info.port} db=${process.env.BUG_REPORT_PG_USER || 'nasun_compute_ro'}@${process.env.BUG_REPORT_PG_HOST || '127.0.0.1'}/${process.env.BUG_REPORT_PG_DATABASE || 'nasun_dal'} writer=${writeCred() ? 'on' : 'off'} origins=${ALLOWED_ORIGINS.length} audience=${AUTH.audience ? 'set' : 'MISSING'}`);
});

// Periodic jobs. Backfill needs the writer pool (skip when unprovisioned); prune is read + FS only.
const HOUR_MS = 3600_000;
const DAY_MS = 86400_000;
if (writeCred()) {
  setTimeout(() => { void runBackfill(); setInterval(() => void runBackfill(), HOUR_MS); }, 60_000);
} else {
  console.warn('[bug-report] writer credential absent -> reward backfill disabled');
}
setTimeout(() => { void runPrune(); setInterval(() => void runPrune(), DAY_MS); }, 300_000);

const shutdown = () => {
  sql.end({ timeout: 5 }).catch(() => {});
  endWriteSql().catch(() => {});
  server.close(() => process.exit(0));
};
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, shutdown);
