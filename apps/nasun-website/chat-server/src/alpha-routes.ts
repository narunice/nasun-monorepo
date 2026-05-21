/**
 * Nasun AI alpha · slot + waitlist HTTP routes (PR-1).
 *
 * Scope of PR-1:
 *   - GET  /api/nasun-ai/alpha/capacity  — read-only counts
 *   - GET  /api/nasun-ai/alpha/health    — schema/flag introspection
 *
 * PR-2/PR-3에서 추가될 endpoint (현재 미구현):
 *   - POST /api/nasun-ai/alpha/join, /leave
 *   - GET  /api/nasun-ai/alpha/status
 *
 * Schema dependency:
 *   The agent_keys columns (slot_exempt, paused_at, expires_at) and the
 *   alpha_waitlist / cron_status tables come from scripts/alpha-migration.sql
 *   which is applied manually at PR-2 deploy time. PR-1 ships before that
 *   migration runs, so every read here is defensive — when a column or table
 *   is missing we return safe defaults instead of crashing chat-server.
 *
 * Feature flag:
 *   ALPHA_GATE_ENABLED env. PR-1 ships with this OFF; the endpoint still
 *   responds (used for monitoring the rollout), but downstream guards in
 *   later PRs all short-circuit when the flag is false.
 */

import { getDb } from './store.js';

const SYSTEM_CAP_DEFAULT = 8;

function readSystemCap(): number {
  const raw = process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
  if (!raw) return SYSTEM_CAP_DEFAULT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : SYSTEM_CAP_DEFAULT;
}

function isAlphaGateEnabled(): boolean {
  return process.env.ALPHA_GATE_ENABLED === 'true';
}

interface SchemaState {
  hasSlotExempt: boolean;
  hasPausedAt: boolean;
  hasWaitlist: boolean;
}

// Cached after the first probe — schema only changes via manual migration so
// re-checking on every request would waste a PRAGMA call. Reset by chat-server
// restart, which is exactly when a fresh migration would have taken effect.
let cachedSchemaState: SchemaState | null = null;

function probeSchema(): SchemaState {
  if (cachedSchemaState) return cachedSchemaState;
  const db = getDb();
  let hasSlotExempt = false;
  let hasPausedAt = false;
  let hasWaitlist = false;
  try {
    const cols = db.prepare('PRAGMA table_info(agent_keys)').all() as Array<{ name: string }>;
    hasSlotExempt = cols.some((c) => c.name === 'slot_exempt');
    hasPausedAt = cols.some((c) => c.name === 'paused_at');
  } catch {
    /* table missing — defensive default */
  }
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='alpha_waitlist'")
      .get();
    hasWaitlist = !!row;
  } catch {
    /* sqlite_master query fails — treat as missing */
  }
  cachedSchemaState = { hasSlotExempt, hasPausedAt, hasWaitlist };
  return cachedSchemaState;
}

interface CapacitySnapshot {
  used: number;
  total: number;
  available: number;
  queue_depth: number;
  schema_ready: boolean;
  gate_enabled: boolean;
}

function computeCapacity(): CapacitySnapshot {
  const schema = probeSchema();
  const total = readSystemCap();
  const db = getDb();

  // "Used" = agent_keys rows that occupy a slot. Once the schema is migrated
  // this means "active and not paused and not exempt". Before migration we
  // can only filter by deleted_at, which counts santa too — that's why the
  // schema_ready flag is exposed so the UI can suppress the number until
  // the migration applies.
  let used = 0;
  try {
    if (schema.hasSlotExempt && schema.hasPausedAt) {
      const row = db
        .prepare(
          'SELECT COUNT(*) AS n FROM agent_keys ' +
            'WHERE deleted_at IS NULL AND slot_exempt = 0 AND paused_at IS NULL',
        )
        .get() as { n: number } | undefined;
      used = row?.n ?? 0;
    } else {
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM agent_keys WHERE deleted_at IS NULL')
        .get() as { n: number } | undefined;
      used = row?.n ?? 0;
    }
  } catch {
    used = 0;
  }

  let queueDepth = 0;
  if (schema.hasWaitlist) {
    try {
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM alpha_waitlist WHERE status = 'waiting'")
        .get() as { n: number } | undefined;
      queueDepth = row?.n ?? 0;
    } catch {
      queueDepth = 0;
    }
  }

  const available = Math.max(0, total - used);
  return {
    used,
    total,
    available,
    queue_depth: queueDepth,
    schema_ready: schema.hasSlotExempt && schema.hasPausedAt && schema.hasWaitlist,
    gate_enabled: isAlphaGateEnabled(),
  };
}

interface HealthSnapshot {
  schema_ready: boolean;
  gate_enabled: boolean;
  // Populated by PR-2's alpha-tick cron. Null until then.
  last_run_at: number | null;
  stale_seconds: number | null;
  stale: boolean | null;
}

const ALPHA_TICK_STALE_THRESHOLD_S = 300;

function computeHealth(): HealthSnapshot {
  const schema = probeSchema();
  const gate = isAlphaGateEnabled();
  let lastRun: number | null = null;
  try {
    const row = getDb()
      .prepare("SELECT last_run FROM cron_status WHERE name = 'alpha-tick'")
      .get() as { last_run: number } | undefined;
    lastRun = row?.last_run ?? null;
  } catch {
    lastRun = null;
  }

  let staleSeconds: number | null = null;
  let stale: boolean | null = null;
  // Only mark stale once cron is expected to be running. Without the gate
  // there's no cron, so a missing timestamp is normal and shouldn't trigger
  // a false alarm in operator monitoring.
  if (gate && lastRun !== null) {
    staleSeconds = Math.floor((Date.now() - lastRun) / 1000);
    stale = staleSeconds > ALPHA_TICK_STALE_THRESHOLD_S;
  }

  return {
    schema_ready: schema.hasSlotExempt && schema.hasPausedAt && schema.hasWaitlist,
    gate_enabled: gate,
    last_run_at: lastRun,
    stale_seconds: staleSeconds,
    stale,
  };
}

function writeJson(
  res: import('node:http').ServerResponse,
  status: number,
  headers: Record<string, string>,
  payload: unknown,
): void {
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

/**
 * Returns true if the URL matched an alpha route; caller should stop routing.
 * PR-1 only exposes read-only GET endpoints — POST / mutation handlers will
 * land with PR-2.
 */
export async function handleAlphaRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  url: URL,
  baseCorsHeaders: Record<string, string>,
): Promise<boolean> {
  if (!url.pathname.startsWith('/api/nasun-ai/alpha/')) return false;

  const corsHeaders: Record<string, string> = {
    ...baseCorsHeaders,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  if (req.method !== 'GET') {
    writeJson(res, 405, corsHeaders, { error: 'method_not_allowed' });
    return true;
  }

  try {
    if (url.pathname === '/api/nasun-ai/alpha/capacity') {
      writeJson(res, 200, corsHeaders, computeCapacity());
      return true;
    }
    if (url.pathname === '/api/nasun-ai/alpha/health') {
      writeJson(res, 200, corsHeaders, computeHealth());
      return true;
    }
    writeJson(res, 404, corsHeaders, { error: 'not_found' });
    return true;
  } catch (err) {
    console.error('[alpha-routes] handler error:', (err as Error).message);
    if (!res.headersSent) {
      writeJson(res, 500, corsHeaders, { error: 'internal_error' });
    }
    return true;
  }
}

// Test seam: lets unit tests reset the probe cache without restarting the
// process. Not exported through the public alpha barrel.
export const __testing__ = {
  resetSchemaCache(): void {
    cachedSchemaState = null;
  },
  readSystemCap,
  isAlphaGateEnabled,
  probeSchema,
};
