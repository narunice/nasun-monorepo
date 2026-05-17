/**
 * gostop-api entry point.
 *
 * Tier 0 routes shipped here:
 *   - GET  /health
 *   - POST /api/gostop/auth/challenge
 *   - POST /api/gostop/auth/verify
 *   - GET  /api/gostop/leaderboard
 *   - GET  /api/gostop/leaderboard/me  (auth)
 *
 * Follow-up routes (feed WS, transparency, round, /me/*) land in subsequent
 * commits — see Tier 0 handoff.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from '../env.js';
import { closeAll } from '../db/client.js';
import { authRoutes } from './routes/auth.js';
import { leaderboardRoutes } from './routes/leaderboard.js';

const app = new Hono();

if (env.api.corsOrigin.length > 0) {
  app.use(
    '/api/*',
    cors({
      origin: env.api.corsOrigin,
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'If-None-Match'],
      maxAge: 600,
      credentials: false,
    }),
  );
}

app.get('/health', (c) =>
  c.json({ ok: true, role: env.role, ts: Date.now() }),
);

app.route('/api/gostop/auth', authRoutes);
app.route('/api/gostop/leaderboard', leaderboardRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error('[gostop-api] unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

const server = serve({ fetch: app.fetch, port: env.api.port }, (info) => {
  console.log('[gostop-api] listening', { port: info.port });
});

async function shutdown(signal: string): Promise<void> {
  console.log('[gostop-api] shutting down', { signal });
  server.close();
  await closeAll();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
