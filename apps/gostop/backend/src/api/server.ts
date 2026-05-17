/**
 * gostop-api entry point.
 *
 * Tier 0.0 boilerplate. REST routes (/leaderboard, /feed, /transparency,
 * /round, /me) land in follow-up commits — see Tier 0 implementation plan.
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from '../env.js';

const app = new Hono();

app.get('/health', (c) =>
  c.json({ ok: true, role: env.role, ts: Date.now() })
);

serve({ fetch: app.fetch, port: env.api.port }, (info) => {
  console.log('[gostop-api] listening', { port: info.port });
});
