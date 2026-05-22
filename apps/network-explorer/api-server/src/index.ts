import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { sql, pointsDb } from './db.js';
import { rateLimiter } from './rate-limit.js';
import healthRoutes from './routes/health.js';
import statsRoutes from './routes/stats.js';
import pointsRoutes from './routes/points.js';
import ecosystemRoutes from './routes/ecosystem.js';
import creatorsAppreciationRoutes from './routes/creators-appreciation.js';
import nasunMetricsRoutes from './routes/nasun-metrics.js';
import internalInvalidateRoutes from './routes/internal-invalidate.js';
import bannedUsersRoutes from './routes/banned-users.js';
import ecosystemBanRoutes from './routes/ecosystem-ban.js';
import standingRoutes from './routes/standing.js';
import { startPointsScanner, stopPointsScanner } from './scanner/points-scanner.js';

const PORT = Number(process.env.PORT ?? 3200);

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [
      'https://explorer.nasun.io',
      'https://nasun.io',
      'https://staging.nasun.io',
      'https://pado.finance',
      'https://staging.pado.finance',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:5176',
      'http://localhost:4173',
    ],
    maxAge: 3600,
  }),
);

// Rate limiting: 120 requests per minute per IP
app.use('/api/v1/stats/*', rateLimiter({ windowMs: 60_000, max: 120 }));
app.use('/api/v1/points/*', rateLimiter({ windowMs: 60_000, max: 60 }));
app.use('/api/v1/ecosystem/*', rateLimiter({ windowMs: 60_000, max: 60 }));
app.use('/api/v1/creators-appreciation/*', rateLimiter({ windowMs: 60_000, max: 30 }));
app.use('/api/v1/standing/*', rateLimiter({ windowMs: 60_000, max: 60 }));

// Routes
app.route('/api/v1/health', healthRoutes);
app.route('/api/v1/stats', statsRoutes);
app.route('/api/v1/stats/nasun-metrics', nasunMetricsRoutes);
app.route('/api/v1/points', pointsRoutes);
app.route('/api/v1/ecosystem', ecosystemRoutes);
app.route('/api/v1/creators-appreciation', creatorsAppreciationRoutes);
app.route('/api/v1/standing', standingRoutes);

// Internal-only routes (auth via shared secret). Used by nasun-website Lambda
// PATCH /user-profile to invalidate the leaderboard's profile cache when a
// display name or avatar changes. Mounted under /api/v1 so the nginx proxy
// rule `/api/* → :3200/api/v1/*` forwards correctly.
app.route('/api/v1/internal', internalInvalidateRoutes);
app.route('/api/v1/internal/banned-users', bannedUsersRoutes);
app.route('/api/v1/internal/ecosystem-ban', ecosystemBanRoutes);

// Root
app.get('/', (c) => c.json({ service: 'explorer-api', version: '0.1.0' }));

// 404
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'internal_server_error' }, 500);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down Explorer API...');
  stopPointsScanner();
  await Promise.all([
    sql.end({ timeout: 5 }),
    pointsDb?.end({ timeout: 5 }),
  ]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Safety net: log unhandled rejections from background tasks (scanner timers,
// cron callbacks) that escaped all try-catch blocks.
// Postgres connection drops (CONNECTION_ENDED / CONNECTION_DESTROYED) are transient;
// the pool reconnects automatically so we just log them rather than crashing.
const TRANSIENT_PG_CODES = new Set(['CONNECTION_ENDED', 'CONNECTION_DESTROYED', 'CONNECTION_CLOSED']);
process.on('unhandledRejection', (err) => {
  const code = (err as any)?.code;
  if (TRANSIENT_PG_CODES.has(code)) {
    console.warn('[WARN] Transient postgres connection error (ignored):', code);
    return;
  }
  console.error('[FATAL] UnhandledRejection:', err);
  process.exit(1);
});

console.log(`Explorer API starting on port ${PORT}`);
serve({ fetch: app.fetch, port: PORT });

// Start points scanner (no-op if POINTS_DATABASE_URL not set)
startPointsScanner();
