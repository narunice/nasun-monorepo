/**
 * Nasun AI alpha · slot + waitlist HTTP routes.
 *
 * PR-1 (shipped): read-only GETs for capacity + health introspection.
 *
 * PR-2 (this file): adds waitlist mutation + status:
 *   - POST /api/nasun-ai/alpha/challenge — mint sig challenge (purpose=alpha-join|alpha-leave)
 *   - POST /api/nasun-ai/alpha/join      — wallet sig + Genesis Pass → queue
 *   - POST /api/nasun-ai/alpha/leave     — wallet sig → DELETE row + immediate re-invite
 *   - GET  /api/nasun-ai/alpha/status    — per-wallet state (none|waiting|invited|active|paused|expired|exempt)
 *
 * Schema dependency:
 *   The agent_keys columns (slot_exempt, paused_at, expires_at, warned_at)
 *   and alpha_waitlist / cron_status tables come from
 *   scripts/alpha-migration.sql which is applied manually at PR-2 deploy
 *   time. Read paths are defensive — when a column or table is missing we
 *   return safe defaults instead of crashing chat-server.
 *
 * Feature flag:
 *   ALPHA_GATE_ENABLED. When false, mutation endpoints reject with 503
 *   (cannot mint challenges yet) and status returns kind='none'. The flag
 *   is the single rollback lever — see plan v2 §11.
 */

import { randomBytes } from 'node:crypto';
import { isValidSuiAddress } from './auth.js';
import { getDb } from './store.js';
import {
  pendingChallenges,
  consumeChallenge,
  buildChallengeText,
  VAULT_CHALLENGE_TTL_MS,
  VAULT_MAX_PENDING_CHALLENGES,
  type ChallengeEntry,
  type Purpose,
} from './baram-telegram-routes.js';
import {
  isAlphaGateEnabled,
  checkGenesisPassEligibility,
  getSystemCap,
  getAgentTtlMs,
} from './alpha-guards.js';
import { processQueueTick } from './alpha-cron.js';

interface SchemaState {
  hasSlotExempt: boolean;
  hasPausedAt: boolean;
  hasExpiresAt: boolean;
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
  let hasExpiresAt = false;
  let hasWaitlist = false;
  try {
    const cols = db.prepare('PRAGMA table_info(agent_keys)').all() as Array<{ name: string }>;
    hasSlotExempt = cols.some((c) => c.name === 'slot_exempt');
    hasPausedAt = cols.some((c) => c.name === 'paused_at');
    hasExpiresAt = cols.some((c) => c.name === 'expires_at');
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
  cachedSchemaState = { hasSlotExempt, hasPausedAt, hasExpiresAt, hasWaitlist };
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
  const total = getSystemCap();
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

// === HTTP helpers ===

const ALPHA_BODY_MAX = 4 * 1024;

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > ALPHA_BODY_MAX) { req.destroy(); reject(new Error('body_too_large')); return; }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (body.length === 0) { resolve({}); return; }
      try { resolve(JSON.parse(body)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function writeJson(
  res: import('node:http').ServerResponse,
  status: number,
  headers: Record<string, string>,
  payload: unknown,
): void {
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function clientIp(req: import('node:http').IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// === Per-wallet rate limit ===
//
// Why per-wallet and not per-IP: alpha join requires a wallet signature,
// so the per-wallet bucket maps 1:1 with the cost (one Cognito challenge
// + Lambda Genesis Pass check). Per-IP would punish corporate / mobile
// NAT users sharing a real IP.

interface RateBucket { count: number; resetAt: number; }
const rateBuckets = new Map<string, RateBucket>();
const RATE_LIMIT_PER_WALLET_PER_HOUR = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function rateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
}, 5 * 60 * 1000).unref();

// === Santa exclusion ===
//
// santa is `slot_exempt=1` AND has `expires_at IS NULL`. Its wallet is
// captured at chat-server boot from agent_keys; we reject any /alpha/join
// signed by that wallet at the route boundary so a misuse can't dirty the
// waitlist with an exempt row.

function lookupExemptWallets(): Set<string> {
  const schema = probeSchema();
  if (!schema.hasSlotExempt) return new Set();
  try {
    const rows = getDb()
      .prepare(
        `SELECT wallet_address FROM agent_keys
          WHERE slot_exempt = 1 AND deleted_at IS NULL`,
      )
      .all() as Array<{ wallet_address: string }>;
    return new Set(rows.map((r) => r.wallet_address.toLowerCase()));
  } catch {
    return new Set();
  }
}

// === Challenge handler ===
//
// Reuses the same `pendingChallenges` Map / `consumeChallenge` machinery
// as the baram-telegram and agent-vault flows. The `Purpose` namespace
// keeps the challenge text + verify path bound to the intent — a
// vault-upload-signed challenge can't be replayed as an alpha-join.

async function handleAlphaChallenge(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const b = body as Record<string, unknown>;
  const wallet = typeof b.wallet === 'string' ? b.wallet : null;
  const purpose = b.purpose as Purpose | undefined;

  if (!wallet || !isValidSuiAddress(wallet)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_wallet' }); return;
  }
  if (purpose !== 'alpha-join' && purpose !== 'alpha-leave') {
    writeJson(res, 400, corsHeaders, { error: 'invalid_purpose' }); return;
  }
  if (!isAlphaGateEnabled()) {
    writeJson(res, 503, corsHeaders, { error: 'alpha_gate_disabled' }); return;
  }
  if (!rateLimit(`alpha-challenge:${wallet.toLowerCase()}`, RATE_LIMIT_PER_WALLET_PER_HOUR)) {
    writeJson(res, 429, corsHeaders, { error: 'rate_limited' }); return;
  }

  // santa block: reject alpha mutations from exempt wallets so the waitlist
  // can never gain an entry that bypasses the cap.
  if (lookupExemptWallets().has(wallet.toLowerCase())) {
    writeJson(res, 403, corsHeaders, { error: 'slot_exempt' }); return;
  }

  if (pendingChallenges.size >= VAULT_MAX_PENDING_CHALLENGES) {
    writeJson(res, 503, corsHeaders, { error: 'challenge_capacity' }); return;
  }

  const now = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const issuedIso = new Date(now).toISOString();
  const entry: Omit<ChallengeEntry, 'expiresAt'> = {
    wallet: wallet.toLowerCase(),
    purpose,
  };
  const challenge = buildChallengeText(entry, nonce, issuedIso);
  pendingChallenges.set(challenge, { ...entry, expiresAt: now + VAULT_CHALLENGE_TTL_MS });

  writeJson(res, 200, corsHeaders, { challenge, expiresAt: now + VAULT_CHALLENGE_TTL_MS });
}

// === Join handler ===

async function handleAlphaJoin(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  if (!isAlphaGateEnabled()) {
    writeJson(res, 503, corsHeaders, { error: 'alpha_gate_disabled' }); return;
  }
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'alpha-join');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401
                 : result.reason === 'expired' ? 410 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason });
    return;
  }
  const wallet = result.entry.wallet;

  // santa cannot join — double check (also enforced at challenge).
  if (lookupExemptWallets().has(wallet)) {
    writeJson(res, 403, corsHeaders, { error: 'slot_exempt' }); return;
  }

  // Genesis Pass gate. fail-closed when both cache and Lambda are
  // unavailable so a Lambda outage can't open the gate to non-holders.
  const eligible = await checkGenesisPassEligibility(wallet);
  if (eligible === null) {
    writeJson(res, 503, corsHeaders, { error: 'eligibility_check_unavailable' }); return;
  }
  if (eligible === false) {
    writeJson(res, 403, corsHeaders, { error: 'genesis_pass_required' }); return;
  }

  // Already active: surface that state to the UI instead of silently
  // queueing them behind themselves.
  const active = getDb()
    .prepare(
      `SELECT 1 FROM agent_keys
        WHERE wallet_address = ?
          AND deleted_at IS NULL
          AND slot_exempt = 0
          AND paused_at IS NULL
        LIMIT 1`,
    )
    .get(wallet);
  if (active) {
    writeJson(res, 409, corsHeaders, { error: 'already_active' }); return;
  }

  const now = Date.now();
  // PK is wallet_address. Use INSERT ... ON CONFLICT to handle:
  //   - re-join after status='expired'      → reset to waiting, miss_count=0
  //   - re-join during status='waiting'     → idempotent (no-op, return state)
  //   - re-join during status='invited'     → idempotent (no-op, return state)
  // The CASE WHEN guards prevent an idle join from clobbering an active
  // invite.
  getDb()
    .prepare(
      `INSERT INTO alpha_waitlist
         (wallet_address, joined_at, status, invited_at, invite_expires_at, miss_count, created_at)
       VALUES (?, ?, 'waiting', NULL, NULL, 0, ?)
       ON CONFLICT(wallet_address) DO UPDATE SET
         status = CASE WHEN alpha_waitlist.status = 'expired' THEN 'waiting' ELSE alpha_waitlist.status END,
         joined_at = CASE WHEN alpha_waitlist.status = 'expired' THEN excluded.joined_at ELSE alpha_waitlist.joined_at END,
         miss_count = CASE WHEN alpha_waitlist.status = 'expired' THEN 0 ELSE alpha_waitlist.miss_count END,
         invited_at = CASE WHEN alpha_waitlist.status = 'expired' THEN NULL ELSE alpha_waitlist.invited_at END,
         invite_expires_at = CASE WHEN alpha_waitlist.status = 'expired' THEN NULL ELSE alpha_waitlist.invite_expires_at END`,
    )
    .run(wallet, now, now);

  // Trigger an immediate invite pass: if there are free slots the user
  // skips the 60s tick wait and is promoted to 'invited' inside this same
  // request. Fire-and-forget (sends own TG message); response below
  // reflects current state regardless.
  void processQueueTick().catch((err) => {
    console.warn('[alpha] processQueueTick after join failed:', (err as Error).message);
  });

  // Read back current state (may have been promoted to invited by the
  // queue tick above).
  const row = getDb()
    .prepare(
      `SELECT status, joined_at, invite_expires_at FROM alpha_waitlist WHERE wallet_address = ?`,
    )
    .get(wallet) as
      { status: string; joined_at: number; invite_expires_at: number | null } | undefined;

  writeJson(res, 200, corsHeaders, {
    ok: true,
    state: row?.status ?? 'waiting',
    joined_at: row?.joined_at ?? now,
    invite_expires_at: row?.invite_expires_at ?? null,
  });
}

// === Leave handler ===

async function handleAlphaLeave(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  if (!isAlphaGateEnabled()) {
    writeJson(res, 503, corsHeaders, { error: 'alpha_gate_disabled' }); return;
  }
  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'alpha-leave');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401
                 : result.reason === 'expired' ? 410 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason });
    return;
  }
  const wallet = result.entry.wallet;

  const r = getDb()
    .prepare(`DELETE FROM alpha_waitlist WHERE wallet_address = ?`)
    .run(wallet);
  // Trigger an immediate invite pass even on changes=0 — caller's intent
  // is "I'm out", so the slot accounting picture might shift regardless.
  void processQueueTick().catch((err) => {
    console.warn('[alpha] processQueueTick after leave failed:', (err as Error).message);
  });
  writeJson(res, 200, corsHeaders, { ok: true, removed: r.changes > 0 });
}

// === Status handler ===

type AlphaUserState =
  | 'none' | 'waiting' | 'invited' | 'active' | 'paused' | 'expired' | 'exempt';

interface StatusResponse {
  state: AlphaUserState;
  eligible: boolean | null;
  // populated based on state
  agent_address?: string;
  expires_at?: number | null;
  warned?: boolean;
  invite_expires_at?: number | null;
  joined_at?: number;
  queue_position?: number;
  queue_depth?: number;
  paused_at?: number | null;
  capacity: CapacitySnapshot;
}

async function handleAlphaStatus(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  url: URL,
  corsHeaders: Record<string, string>,
): Promise<void> {
  const walletParam = url.searchParams.get('wallet');
  if (!walletParam || !isValidSuiAddress(walletParam)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_wallet' }); return;
  }
  const wallet = walletParam.toLowerCase();

  const capacity = computeCapacity();
  const schema = probeSchema();

  // Without the migration, every wallet is effectively 'none' from the
  // alpha system's perspective. Surface the schema_ready=false flag in
  // capacity so the frontend doesn't fabricate UX from junk.
  if (!schema.hasWaitlist) {
    writeJson(res, 200, corsHeaders, {
      state: 'none',
      eligible: null,
      capacity,
    } satisfies StatusResponse);
    return;
  }

  // 1. exempt (santa)
  if (lookupExemptWallets().has(wallet)) {
    writeJson(res, 200, corsHeaders, {
      state: 'exempt',
      eligible: true,
      capacity,
    } satisfies StatusResponse);
    return;
  }

  // 2. active or paused (agent_keys)
  const agent = getDb()
    .prepare(
      `SELECT agent_address, expires_at, warned_at, paused_at
         FROM agent_keys
        WHERE wallet_address = ?
          AND deleted_at IS NULL
          AND slot_exempt = 0
        ORDER BY created_at DESC LIMIT 1`,
    )
    .get(wallet) as
      | { agent_address: string; expires_at: number | null; warned_at: number | null; paused_at: number | null }
      | undefined;
  if (agent) {
    if (agent.paused_at !== null) {
      writeJson(res, 200, corsHeaders, {
        state: 'paused',
        eligible: null,
        agent_address: agent.agent_address,
        paused_at: agent.paused_at,
        capacity,
      } satisfies StatusResponse);
      return;
    }
    writeJson(res, 200, corsHeaders, {
      state: 'active',
      eligible: null,
      agent_address: agent.agent_address,
      expires_at: agent.expires_at,
      warned: agent.warned_at !== null,
      capacity,
    } satisfies StatusResponse);
    return;
  }

  // 3. waitlist (invited/waiting/expired)
  const row = getDb()
    .prepare(
      `SELECT status, joined_at, invite_expires_at
         FROM alpha_waitlist WHERE wallet_address = ?`,
    )
    .get(wallet) as
      | { status: AlphaUserState; joined_at: number; invite_expires_at: number | null }
      | undefined;
  if (row) {
    let queuePosition: number | undefined;
    let queueDepth: number | undefined;
    if (row.status === 'waiting') {
      const ahead = getDb()
        .prepare(
          `SELECT COUNT(*) AS n FROM alpha_waitlist
            WHERE status = 'waiting' AND joined_at < ?`,
        )
        .get(row.joined_at) as { n: number };
      queuePosition = (ahead?.n ?? 0) + 1;
      queueDepth = capacity.queue_depth;
    }
    writeJson(res, 200, corsHeaders, {
      state: row.status,
      eligible: null,
      joined_at: row.joined_at,
      invite_expires_at: row.invite_expires_at,
      queue_position: queuePosition,
      queue_depth: queueDepth,
      capacity,
    } satisfies StatusResponse);
    return;
  }

  // 4. none → surface eligibility so the UI can show "Genesis Pass required"
  // up front instead of waiting until the user signs join. Cache hit is
  // free (no Lambda call); cache miss does one Lambda fetch.
  const eligible = await checkGenesisPassEligibility(wallet);
  writeJson(res, 200, corsHeaders, {
    state: 'none',
    eligible: eligible ?? null,
    capacity,
  } satisfies StatusResponse);
}

// === Router ===

/**
 * Returns true if the URL matched an alpha route; caller should stop routing.
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  try {
    if (req.method === 'GET') {
      if (url.pathname === '/api/nasun-ai/alpha/capacity') {
        writeJson(res, 200, corsHeaders, computeCapacity());
        return true;
      }
      if (url.pathname === '/api/nasun-ai/alpha/health') {
        writeJson(res, 200, corsHeaders, computeHealth());
        return true;
      }
      if (url.pathname === '/api/nasun-ai/alpha/status') {
        await handleAlphaStatus(req, res, url, corsHeaders);
        return true;
      }
      writeJson(res, 404, corsHeaders, { error: 'not_found' });
      return true;
    }
    if (req.method === 'POST') {
      if (url.pathname === '/api/nasun-ai/alpha/challenge') {
        await handleAlphaChallenge(req, res, corsHeaders);
        return true;
      }
      if (url.pathname === '/api/nasun-ai/alpha/join') {
        await handleAlphaJoin(req, res, corsHeaders);
        return true;
      }
      if (url.pathname === '/api/nasun-ai/alpha/leave') {
        await handleAlphaLeave(req, res, corsHeaders);
        return true;
      }
      writeJson(res, 404, corsHeaders, { error: 'not_found' });
      return true;
    }
    writeJson(res, 405, corsHeaders, { error: 'method_not_allowed' });
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
  isAlphaGateEnabled,
  probeSchema,
  computeCapacity,
  computeHealth,
  getAgentTtlMs,
};
