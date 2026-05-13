/**
 * Admin endpoint for ecosystem-level ban (banned_users + activity_points.flagged).
 *
 * Auth: requireAdmin — accepts either the shared X-Internal-Auth secret
 * (CLI/chat-server) or a Cognito Bearer token whose UserProfiles row has
 * role=ADMIN (admin web UI).
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
 *     "actor":       "admin@nasun" | "user-display"    // optional fallback
 *   }
 *
 * `actor` defaults to the resolved admin identity (Cognito email or
 * "internal-token") so the audit trail is non-empty even when callers omit it.
 *
 * At least one of `handle` or `identityId` must be provided.
 */

import { Hono } from 'hono';
import { pointsDb } from '../db.js';
import { requireAdmin, type AdminContext } from '../auth/admin.js';
import {
  resolveHandle,
  resolveByIdentityId,
  applyBans,
  applyUnbans,
  refreshChatServerCache,
  normalizeHandle,
  type Resolution,
  type UnbanMode,
} from '../services/ban-service.js';

const app = new Hono<{ Variables: { admin: AdminContext } }>();

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
  /**
   * 'retroactive' (default): unflag every flagged activity_points row, so the
   *   user gets ban-period points back. Use when the ban was a mistake.
   * 'forward-only': unflag, then immediately re-flag rows older than the
   *   unban moment. Use when the ban was justified but admin grants a fresh
   *   start. Ban-period points stay invisible.
   */
  mode?: UnbanMode;
}

function defaultActor(admin: AdminContext, override?: string): string {
  if (override?.trim()) return override.trim();
  if (admin.source === 'internal-token') return 'internal-token';
  return admin.email ? `admin-web:${admin.email}` : `admin-web:${admin.identityId}`;
}

app.use('*', requireAdmin);

// POST /api/v1/internal/ecosystem-ban — ban
app.post('/', async (c) => {
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
  const actor = defaultActor(c.get('admin'), body.actor);

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
    return c.json({ success: false, error: 'no_mappable_targets', resolutions }, 400);
  }

  let applied;
  try {
    applied = await applyBans(pointsDb, resolutions, reason, actor);
  } catch (err) {
    return c.json({ error: 'apply_failed', message: (err as Error).message }, 500);
  }
  const cacheRefresh = await refreshChatServerCache();

  return c.json({ success: true, resolutions, applied, cacheRefresh });
});

// DELETE /api/v1/internal/ecosystem-ban — unban
app.delete('/', async (c) => {
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
  const actor = defaultActor(c.get('admin'), body.actor);
  const mode: UnbanMode = body.mode === 'forward-only' ? 'forward-only' : 'retroactive';

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
    applied = await applyUnbans(pointsDb, resolutions, actor, reason, mode);
  } catch (err) {
    return c.json({ error: 'apply_failed', message: (err as Error).message }, 500);
  }
  const cacheRefresh = await refreshChatServerCache();

  return c.json({ success: true, resolutions, applied, cacheRefresh });
});

// GET /api/v1/internal/ecosystem-ban — list active bans
app.get('/', async (c) => {
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
