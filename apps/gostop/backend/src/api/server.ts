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
import { transparencyRoutes } from './routes/transparency.js';
import { roundRoutes } from './routes/round.js';
import { streakRoutes } from './routes/streak.js';
import { meProfileRoutes } from './routes/me/profile.js';
import { meDashboardRoutes } from './routes/me/dashboard.js';
import { createFeedWsServer, isFeedUpgrade } from './ws/feed-server.js';
import { hydrateFeedRings } from './ws/hydrate.js';
import { startFeedListener, stopFeedListener } from './ws/listen-notify.js';

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
app.route('/api/gostop', transparencyRoutes);
app.route('/api/gostop/round', roundRoutes);
app.route('/api/gostop/streak', streakRoutes);
app.route('/api/gostop/me', meProfileRoutes);
app.route('/api/gostop/me', meDashboardRoutes);

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error('[gostop-api] unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

const server = serve({ fetch: app.fetch, port: env.api.port }, (info) => {
  console.log('[gostop-api] listening', { port: info.port });
});

// WS feed wiring (PR2). Attached to the same http.Server so a single TCP port
// serves both Hono HTTP and ws upgrades. Disabled entirely when FEED_ENABLED=false.
if (env.feed.enabled) {
  const wss = createFeedWsServer();
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (isFeedUpgrade(url.pathname)) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      // Anything else on this port has no WS handler — close cleanly so a
      // misrouted client doesn't hang.
      socket.destroy();
    }
  });
  startFeedListener().catch((err) => {
    console.error('[gostop-api] feed listener failed to start', err);
  });
  // Hydrate ring buffers from the last live-window of game_round so the
  // first cold-open subscribers don't see an empty feed after a restart.
  hydrateFeedRings().catch((err) => {
    console.error('[gostop-api] feed hydrate failed', err);
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log('[gostop-api] shutting down', { signal });
  server.close();
  if (env.feed.enabled) await stopFeedListener();
  await closeAll();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
