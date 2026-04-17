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

// Routes
app.route('/api/v1/health', healthRoutes);
app.route('/api/v1/stats', statsRoutes);
app.route('/api/v1/points', pointsRoutes);
app.route('/api/v1/ecosystem', ecosystemRoutes);
app.route('/api/v1/creators-appreciation', creatorsAppreciationRoutes);

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
// cron callbacks) that escaped all try-catch blocks. Log and exit so PM2
// can restart with a clean state and the crash is visible in the error log.
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] UnhandledRejection:', err);
  process.exit(1);
});

console.log(`Explorer API starting on port ${PORT}`);
serve({ fetch: app.fetch, port: PORT });

// Start points scanner (no-op if POINTS_DATABASE_URL not set)
startPointsScanner();
