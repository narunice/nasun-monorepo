/**
 * POST /me/client-meta — record the authenticated wallet's reported screen
 * resolution (bot-traffic hygiene).
 *
 * Fired once per session by the frontend after auth. The screen value comes
 * from the browser's `window.screen`; physically impossible resolutions
 * (width >= 8192 || height >= 4321 — no real consumer display reaches 8K's
 * 7680 width, observed bots start at 9600) flag a fabricated-fingerprint bot.
 *
 * is_impossible is computed server-side (never trust a client-supplied flag)
 * and accumulated stickily on upsert. It feeds leaderboard/metrics exclusion
 * only — gameplay and ecosystem points are never affected, so the zero
 * false-positive guarantee holds even if a real device were ever misread.
 *
 * Wallet is always taken from the JWT (c.var.wallet), never from the body.
 */

import { Hono } from 'hono';
import { writer } from '../../../db/client.js';
import type { AuthVars } from '../../auth/middleware.js';
import { requireAuth } from '../../auth/middleware.js';

export const meClientMetaRoutes = new Hono<{ Variables: AuthVars }>();
meClientMetaRoutes.use('*', requireAuth);

// "WIDTHxHEIGHT" with sane upper bounds (6 digits) to reject garbage payloads.
const SCREEN_RE = /^(\d{1,6})x(\d{1,6})$/;

// Real consumer displays top out at 8K (7680 wide). Observed bot fingerprints
// start at 9600 wide; the ~4000px gap makes this a zero-false-positive flag.
function isImpossibleResolution(w: number, h: number): boolean {
  return w >= 8192 || h >= 4321;
}

meClientMetaRoutes.post('/client-meta', async (c) => {
  const wallet = c.get('wallet').toLowerCase();

  let body: { screen?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'bad_request', reason: 'invalid_json' }, 400);
  }

  const screen = typeof body.screen === 'string' ? body.screen : '';
  const m = SCREEN_RE.exec(screen);
  if (!m) {
    return c.json({ error: 'bad_request', reason: 'invalid_screen' }, 400);
  }
  const w = Number.parseInt(m[1]!, 10);
  const h = Number.parseInt(m[2]!, 10);
  const impossible = isImpossibleResolution(w, h);
  const ua = (c.req.header('user-agent') ?? '').slice(0, 500);

  const sql = writer();
  await sql`
    INSERT INTO gostop.client_meta (player, screen, screen_w, screen_h, is_impossible, user_agent)
    VALUES (${wallet}, ${screen}, ${w}, ${h}, ${impossible}, ${ua})
    ON CONFLICT (player) DO UPDATE SET
      screen        = EXCLUDED.screen,
      screen_w      = EXCLUDED.screen_w,
      screen_h      = EXCLUDED.screen_h,
      is_impossible = gostop.client_meta.is_impossible OR EXCLUDED.is_impossible,
      user_agent    = EXCLUDED.user_agent,
      hit_count     = gostop.client_meta.hit_count + 1,
      last_seen     = now()
  `;

  c.header('Cache-Control', 'no-store');
  return c.body(null, 204);
});
