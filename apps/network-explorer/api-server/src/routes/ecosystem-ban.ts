/**
 * Internal admin endpoint for ecosystem-level ban (banned_users + activity_points.flagged).
 *
 * Auth: X-Internal-Auth: $INTERNAL_INVALIDATE_TOKEN (shared secret with
 * banned-users.ts and internal-invalidate.ts).
 *
 * Designed to be called from the nasun-website AdminStack admin Lambda
 * (which has already verified the operator's Cognito role=ADMIN). The
 * admin Lambda forwards the request with the shared internal token.
 *
 * Routes:
 *   POST   /api/v1/internal/ecosystem-ban        — ban
 *   DELETE /api/v1/internal/ecosystem-ban        — unban
 *   GET    /api/v1/internal/ecosystem-ban        — list active bans
 *
 * POST body:
 *   {
 *     "handle"?:     "username",                       // X handle (preferred)
 *     "identityId"?: "ap-northeast-2:uuid",            // primary Cognito identity
 *     "reason":      "bot-suspected: ...",             // required
 *     "actor":       "admin@nasun" | "user-display"    // optional, default "admin-web"
 *   }
 *
 * At least one of `handle` or `identityId` must be provided. Both may be
 * provided; `identityId` short-circuits the X-handle lookup but `handle`
 * (if also provided) is stored in banned_users.x_handle for traceability.
 *
 * Response: same `Resolution[]` table the CLI prints, plus the apply
 * result (flaggedRows per identity) and chat-cache refresh status.
 */

import { Hono } from 'hono';
import { pointsDb } from '../db.js';
import {
  resolveHandle,
  resolveByIdentityId,
  applyBans,
  applyUnbans,
  refreshChatServerCache,
  normalizeHandle,
  type Resolution,
} from '../services/ban-service.js';

const INTERNAL_TOKEN = process.env.INTERNAL_INVALIDATE_TOKEN || '';

const app = new Hono();

function checkAuth(authHeader: string | undefined): boolean {
  return !!INTERNAL_TOKEN && authHeader === INTERNAL_TOKEN;
}

interface BanRequest {
  handle?: string;
  identityId?: string;
  reason?: string;
  actor?: string;
}

interface UnbanRequest {
  handle?: string;
  identityId?: string;
  reason?: string;
  actor?: string;
}

// POST /api/v1/internal/ecosystem-ban — ban
app.post('/', async (c) => {
  if (!checkAuth(c.req.header('X-Internal-Auth'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  let body: BanRequest;
  try {
    body = await c.req.json<BanRequest>();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const handle = body.handle ? normalizeHandle(body.handle) : undefined;
  const identityId = body.identityId?.trim();
  const reason = body.reason?.trim();
  const actor = body.actor?.trim() || 'admin-web';

  if (!handle && !identityId) {
    return c.json({ error: 'handle_or_identityId_required' }, 400);
  }
  if (!reason) {
    return c.json({ error: 'reason_required' }, 400);
  }
  if (reason.length > 500) {
    return c.json({ error: 'reason_too_long', maxLength: 500 }, 400);
  }

  let resolutions: Resolution[];
  try {
    if (identityId) {
      resolutions = await resolveByIdentityId(identityId, handle);
    } else {
      resolutions = await resolveHandle(handle!);
    }
  } catch (err) {
    return c.json({ error: 'resolve_failed', message: (err as Error).message }, 500);
  }

  const mappable = resolutions.filter((r) => r.identityId);
  if (mappable.length === 0) {
    return c.json({
      success: false,
      error: 'no_mappable_targets',
      resolutions,
    }, 400);
  }

  let applied;
  try {
    applied = await applyBans(pointsDb, resolutions, reason, actor);
  } catch (err) {
    return c.json({ error: 'apply_failed', message: (err as Error).message }, 500);
  }
  const cacheRefresh = await refreshChatServerCache();

  return c.json({
    success: true,
    resolutions,
    applied,
    cacheRefresh,
  });
});

// DELETE /api/v1/internal/ecosystem-ban — unban
app.delete('/', async (c) => {
  if (!checkAuth(c.req.header('X-Internal-Auth'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  let body: UnbanRequest;
  try {
    body = await c.req.json<UnbanRequest>();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const handle = body.handle ? normalizeHandle(body.handle) : undefined;
  const identityId = body.identityId?.trim();
  const reason = body.reason?.trim() || 'unbanned via admin web';
  const actor = body.actor?.trim() || 'admin-web';

  if (!handle && !identityId) {
    return c.json({ error: 'handle_or_identityId_required' }, 400);
  }

  let resolutions: Resolution[];
  try {
    if (identityId) {
      resolutions = await resolveByIdentityId(identityId, handle);
    } else {
      resolutions = await resolveHandle(handle!);
    }
  } catch (err) {
    return c.json({ error: 'resolve_failed', message: (err as Error).message }, 500);
  }

  let applied;
  try {
    applied = await applyUnbans(pointsDb, resolutions, actor, reason);
  } catch (err) {
    return c.json({ error: 'apply_failed', message: (err as Error).message }, 500);
  }
  const cacheRefresh = await refreshChatServerCache();

  return c.json({
    success: true,
    resolutions,
    applied,
    cacheRefresh,
  });
});

// GET /api/v1/internal/ecosystem-ban — list active bans
app.get('/', async (c) => {
  if (!checkAuth(c.req.header('X-Internal-Auth'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const rows = await pointsDb<Array<{
    identity_id: string;
    wallet_address: string | null;
    x_handle: string | null;
    reason: string;
    banned_at: Date;
    banned_by: string;
  }>>`
    SELECT identity_id, wallet_address, x_handle, reason, banned_at, banned_by
    FROM banned_users
    WHERE unbanned_at IS NULL
    ORDER BY banned_at DESC
  `;

  return c.json({
    bans: rows.map((r) => ({
      identityId: r.identity_id,
      walletAddress: r.wallet_address,
      xHandle: r.x_handle,
      reason: r.reason,
      bannedAt: r.banned_at.toISOString(),
      bannedBy: r.banned_by,
    })),
    generatedAt: Date.now(),
  });
});

export default app;
