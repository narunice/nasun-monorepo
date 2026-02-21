import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { sql, initSchema } from './db.js';
import { startSyncWorker, getSyncStatus } from './sync/aer-sync.js';
import aerRoutes from './routes/aer.js';

const PORT = Number(process.env.PORT ?? 3201);
const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
const AER_PACKAGE_ID = process.env.AER_PACKAGE_ID;

if (!AER_PACKAGE_ID) {
  throw new Error('AER_PACKAGE_ID environment variable is required');
}

const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [
      'https://baram.nasun.io',
      'http://localhost:5177',
      'http://localhost:4173',
    ],
    maxAge: 3600,
  }),
);

// AER routes
app.route('/api/v1/aer', aerRoutes);

// Health endpoint with sync status
app.get('/api/v1/health', async (c) => {
  try {
    const [dbCheck, syncStatus] = await Promise.all([
      sql`SELECT 1 as ok`,
      getSyncStatus(),
    ]);

    return c.json({
      status: 'ok',
      db: dbCheck.length > 0 ? 'connected' : 'error',
      sync: syncStatus,
    });
  } catch (err) {
    console.error('Health check failed:', err);
    return c.json({ status: 'error', error: 'health_check_failed' }, 503);
  }
});

// Root
app.get('/', (c) => c.json({ service: 'baram-aer-api', version: '0.1.0' }));

// 404
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'internal_server_error' }, 500);
});

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down Baram-AER API...');
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize schema and start
async function start() {
  await initSchema();

  // Start sync worker (runs in-process)
  startSyncWorker(RPC_URL, AER_PACKAGE_ID!);

  // Start HTTP server
  console.log(`Baram-AER API starting on port ${PORT}`);
  serve({ fetch: app.fetch, port: PORT });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
