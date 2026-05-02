/**
 * Internal cache invalidation + sync endpoints.
 *
 * Auth: shared secret in `INTERNAL_INVALIDATE_TOKEN` env var. Unauthenticated
 * requests get 401 and don't reveal whether the route exists.
 *
 * Routes:
 *   POST /profile-cache/invalidate
 *     - Called by nasun-website Lambda PATCH /user-profile when display
 *       name or avatar changes. Forces leaderboard to refetch profiles.
 *
 *   POST /wallet-registered
 *     - Called by registerWallet Lambda after successful wallet registration.
 *     - Forces wallet→identity cache refresh (10-min TTL bypass) and runs a
 *       fire-and-forget today-window reconcile so freshly registered wallets
 *       see "pts today" updates within seconds instead of waiting for the
 *       next cache window.
 */
import { Hono } from 'hono';
import { invalidateAllProfileCache } from './ecosystem.js';
import { invalidate } from '../cache.js';
import { maybeRefreshWalletCache } from '../scanner/points-scanner.js';
import { reconcileTodayForIdentity } from '../scanner/rpc-reconcile-identity.js';

const INTERNAL_TOKEN = process.env.INTERNAL_INVALIDATE_TOKEN || '';
const IDENTITY_ID_PATTERN = /^[a-z0-9-]{1,30}:[a-f0-9-]{36}$/i;
const SUI_ADDRESS_PATTERN = /^0x[a-f0-9]{64}$/i;

const app = new Hono();

function checkAuth(header: string | undefined): boolean {
  return Boolean(INTERNAL_TOKEN) && header === INTERNAL_TOKEN;
}

app.post('/profile-cache/invalidate', async (c) => {
  const auth = c.req.header('X-Internal-Auth') || '';
  if (!checkAuth(auth)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  invalidateAllProfileCache();
  return c.json({ ok: true });
});

app.post('/wallet-registered', async (c) => {
  const auth = c.req.header('X-Internal-Auth') || '';
  if (!checkAuth(auth)) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let body: { identityId?: unknown; walletAddress?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const identityIdRaw = typeof body.identityId === 'string' ? body.identityId : '';
  const walletAddressRaw = typeof body.walletAddress === 'string' ? body.walletAddress : '';
  if (!IDENTITY_ID_PATTERN.test(identityIdRaw)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }
  if (!SUI_ADDRESS_PATTERN.test(walletAddressRaw)) {
    return c.json({ error: 'invalid_wallet_address' }, 400);
  }
  const identityId = identityIdRaw.toLowerCase();
  const walletAddress = walletAddressRaw.toLowerCase();

  // Force-refresh wallet cache so the live scanner immediately recognizes the
  // new wallet on its next iteration. Awaited so we know reconcile sees the
  // new mapping if it consults the cache for any side reason.
  try {
    await maybeRefreshWalletCache(true);
  } catch (err) {
    console.warn('[wallet-registered] cache refresh failed:', (err as Error).message);
  }

  // Today-window reconcile is fire-and-forget. RPC + indexer queries can take
  // a few seconds; we don't make the Lambda wait. Errors are logged.
  const today = new Date().toISOString().slice(0, 10);
  reconcileTodayForIdentity(today, identityId, [walletAddress])
    .then((filled) => {
      if (filled > 0) {
        console.log(
          `[wallet-registered] reconciled identity=${identityId} wallet=${walletAddress} filled=${filled}`,
        );
      }
    })
    .catch((err) => {
      console.warn('[wallet-registered] reconcile failed:', (err as Error).message);
    });

  // Invalidate cached score for this identity so the next /score read repulls.
  invalidate(`eco-score-${identityId}`);

  return c.json({ ok: true });
});

export default app;
