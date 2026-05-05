/**
 * Internal banned-users feed.
 *
 * GET /api/v1/internal/banned-users
 *   Auth: X-Internal-Auth: $INTERNAL_INVALIDATE_TOKEN
 *   Returns the active ban list from the points DB so chat-server can refresh
 *   its in-memory exclusion set.
 *
 * Response shape:
 *   {
 *     "addresses":   ["0xabc...", "0xdef..."],   // lowercased Sui addresses
 *     "identityIds": ["ap-northeast-2:uuid-1"],  // banned Cognito identities
 *     "generatedAt": 1714809600000
 *   }
 *
 * Cache: chat-server applies its own TTL (5 min). The endpoint itself is
 * uncached so /admin scripts can poll for confirmation right after a ban.
 */
import { Hono } from 'hono';
import { pointsDb } from '../db.js';

const INTERNAL_TOKEN = process.env.INTERNAL_INVALIDATE_TOKEN || '';

const app = new Hono();

app.get('/', async (c) => {
  const auth = c.req.header('X-Internal-Auth') || '';
  if (!INTERNAL_TOKEN || auth !== INTERNAL_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const rows = await pointsDb<Array<{ identity_id: string; wallet_address: string | null }>>`
    SELECT identity_id, wallet_address
    FROM banned_users
    WHERE unbanned_at IS NULL
  `;

  const addresses: string[] = [];
  const identityIds: string[] = [];
  for (const r of rows) {
    identityIds.push(r.identity_id);
    if (r.wallet_address) addresses.push(r.wallet_address.toLowerCase());
  }

  return c.json({
    addresses,
    identityIds,
    generatedAt: Date.now(),
  });
});

export default app;
