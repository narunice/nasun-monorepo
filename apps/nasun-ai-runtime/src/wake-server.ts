/**
 * Wake HTTP server — agent-runner long-running inbound endpoint.
 *
 * - Binds to 127.0.0.1:WAKE_PORT (no public exposure).
 * - Dual auth: X-HMAC over raw body (BARAM_CHAT_SERVER_HMAC_SECRET) +
 *   short-lived JWT bound to a chat-server session (BARAM_SESSION_JWT_SECRET).
 * - Route: POST /wake. Body schema validated below.
 * - Idempotency: `job_id` deduplicated by `IdempotencyStore`.
 */
import { Hono, type Context } from 'hono';
import { serve, type ServerType } from '@hono/node-server';
import { ACTIVE_WAKE_TRIGGERS, isValidIntentId, type WakeTrigger } from '@nasun/baram-sdk';
import { verifyHmac, verifyJWT } from './jwt-verify.js';
import { dispatchWake, type WakeContext, type WakeRouterDeps } from './wake-router.js';

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_TRIGGERS = ACTIVE_WAKE_TRIGGERS;

interface WakeBody {
  job_id: string;
  jwt: string;
  trigger_type: WakeTrigger;
  intent_id: string;
  parent_intent_id?: string;
  message?: string;
}

function parseTrigger(raw: unknown): WakeTrigger | null {
  if (typeof raw !== 'string') return null;
  if (!ALLOWED_TRIGGERS.has(raw as WakeTrigger)) return null;
  return raw as WakeTrigger;
}

function validateBody(parsed: unknown): WakeBody | { error: string } {
  if (!parsed || typeof parsed !== 'object') return { error: 'body_not_object' };
  const b = parsed as Record<string, unknown>;
  if (typeof b.job_id !== 'string' || !isValidIntentId(b.job_id)) return { error: 'invalid_job_id' };
  if (typeof b.jwt !== 'string' || b.jwt.length < 20 || b.jwt.length > 4096) return { error: 'invalid_jwt' };
  const trigger = parseTrigger(b.trigger_type);
  if (!trigger) return { error: 'invalid_trigger_type' };
  if (typeof b.intent_id !== 'string' || !isValidIntentId(b.intent_id)) return { error: 'invalid_intent_id' };
  if (b.parent_intent_id !== undefined) {
    if (typeof b.parent_intent_id !== 'string' || !isValidIntentId(b.parent_intent_id)) {
      return { error: 'invalid_parent_intent_id' };
    }
  }
  if (b.message !== undefined) {
    if (typeof b.message !== 'string' || b.message.length > 4000) return { error: 'invalid_message' };
  }
  return {
    job_id: b.job_id,
    jwt: b.jwt,
    trigger_type: trigger,
    intent_id: b.intent_id,
    parent_intent_id: b.parent_intent_id as string | undefined,
    message: b.message as string | undefined,
  };
}

export interface WakeServerDeps extends WakeRouterDeps {
  port: number;
  /** Optional log sink for diagnostics; defaults to console.log. */
  logger?: (msg: string) => void;
}

export function buildWakeApp(deps: WakeServerDeps): Hono {
  const app = new Hono();
  const log = deps.logger ?? ((m: string) => console.log(m));

  app.get('/health', (c) => c.json({ ok: true, agent: deps.config.agentAddress }));

  app.post('/wake', async (c) => handleWake(c, deps, log));

  return app;
}

async function handleWake(
  c: Context,
  deps: WakeServerDeps,
  log: (m: string) => void,
): Promise<Response> {
  const hmacHeader = c.req.header('X-HMAC') ?? c.req.header('x-hmac');
  if (!hmacHeader || hmacHeader.length < 16) {
    return c.json({ ok: false, error: 'missing_hmac' }, 401);
  }

  let raw: ArrayBuffer;
  try {
    raw = await c.req.arrayBuffer();
  } catch {
    return c.json({ ok: false, error: 'body_read_failed' }, 400);
  }
  if (raw.byteLength > MAX_BODY_BYTES) {
    return c.json({ ok: false, error: 'body_too_large' }, 413);
  }
  const bodyBuf = Buffer.from(raw);

  if (!verifyHmac(bodyBuf, hmacHeader)) {
    return c.json({ ok: false, error: 'bad_hmac' }, 401);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyBuf.toString('utf8'));
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  const valid = validateBody(parsed);
  if ('error' in valid) {
    return c.json({ ok: false, error: valid.error }, 400);
  }

  const jwtResult = verifyJWT(valid.jwt);
  if (!jwtResult.ok) {
    return c.json({ ok: false, error: `jwt_${jwtResult.reason}` }, 401);
  }

  const ctx: WakeContext = {
    jobId: valid.job_id,
    triggerType: valid.trigger_type,
    intentId: valid.intent_id,
    parentIntentId: valid.parent_intent_id,
    sid: jwtResult.sid,
    message: valid.message,
    nowMs: Date.now(),
  };

  log(`[wake] job=${ctx.jobId} trigger=${ctx.triggerType} sid=${ctx.sid.slice(0, 8)}…`);
  const outcome = await dispatchWake(ctx, deps);
  const code = outcome.ok ? 200 : 422;
  return c.json(outcome, code);
}

export function startWakeServer(deps: WakeServerDeps): { server: ServerType; close: () => Promise<void> } {
  const app = buildWakeApp(deps);
  const server = serve({
    fetch: app.fetch,
    port: deps.port,
    hostname: '127.0.0.1',
  });
  return {
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
