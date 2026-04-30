/**
 * Internal cache invalidation endpoint, called by nasun-website Lambda PATCH
 * /user-profile when a user updates their display name or avatar. Forces the
 * next leaderboard read to refetch profiles via fetchProfilesBatch.
 *
 * Auth: shared secret in `INTERNAL_INVALIDATE_TOKEN` env var. Unauthenticated
 * requests get 401 and don't reveal whether the route exists.
 *
 * The profile cache here is keyed by identityId, but the webhook supplies a
 * walletAddress. Resolving wallet → identityId would require an extra DDB
 * lookup; instead we simply expire the entire cache (resetting expiresAt to
 * 0) so the next request refetches fresh. The cost is a single batched
 * profile re-fetch on the next leaderboard read — negligible at this scale.
 */
import { Hono } from 'hono';
import { invalidateAllProfileCache } from './ecosystem.js';

const INTERNAL_TOKEN = process.env.INTERNAL_INVALIDATE_TOKEN || '';

const app = new Hono();

app.post('/profile-cache/invalidate', async (c) => {
  const auth = c.req.header('X-Internal-Auth') || '';
  if (!INTERNAL_TOKEN || auth !== INTERNAL_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  invalidateAllProfileCache();
  return c.json({ ok: true });
});

export default app;
