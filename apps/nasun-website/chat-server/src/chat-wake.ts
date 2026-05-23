// Web chat-wake surface.
//
// Mirrors what the Telegram bot does for an incoming text message
// (see baram-telegram.ts handleTextMessage) but is reachable from a browser:
//
//   1. POST /api/nasun-ai/chat/challenge   — mint challenge for (wallet, agent, capability)
//   2. POST /api/nasun-ai/chat/session     — wallet sig → chatToken (10 min)
//   3. POST /api/nasun-ai/chat/wake        — chatToken + message → jobId (async)
//   4. GET  /api/nasun-ai/chat/wake/:jobId — poll jobId → outcome
//
// The /wake forward to the agent-runner happens off the request lifecycle
// (setImmediate), so the browser doesn't have to hold an HTTP connection
// open for 60-120s through CloudFront's origin-response timeout. The job
// row in chat_wake_jobs is the source of truth for "did the wake finish".
//
// Why we cannot just reuse the Telegram flow: TG paths assume one bound
// tg_user_id and HTTP-200-immediate-Telegram-webhook semantics. Web needs
// (a) the browser as authoritative caller (wallet signature, not webhook
// secret), (b) explicit polling so a CloudFront edge timeout doesn't strand
// the user.

import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import { isValidSuiAddress } from './auth.js';
import { getDb } from './store.js';
import { getEndpoint, isEndpointFresh } from './baram-agent-registry.js';
import { checkBudgetSufficient } from './baram-budget-guard.js';
import { reserveCognitionSlot, releaseCognitionSlot } from './baram-message-caps.js';
import { isWalletAlphaActiveForChat, isAlphaGateEnabled } from './alpha-guards.js';
import { verifyCapabilityOwner } from './sui-capability-utils.js';
import {
  createSession,
  getActiveSessionByWalletAgent,
  getSession,
  issueChatToken,
  verifyChatToken,
  issueShortLivedJWT,
  SessionInactiveError,
  type VerifyChatTokenFailure,
} from './baram-session.js';
import {
  pendingChallenges,
  buildChallengeText,
  consumeChallenge,
  cleanupExpiredChallenges,
  readJsonBody,
  writeJson,
  type ChallengeEntry,
} from './baram-telegram-routes.js';
import { forwardToWake, type WakeBody, type WakeResult } from './wake-proxy.js';

const CHAT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 5_000;
const JOB_TTL_MS = 10 * 60 * 1000;
const MAX_MESSAGE_CHARS = 4_000;

// idempotencyKey is supplied by the browser per Send click. Restrict to a
// printable charset so it can't smuggle control chars / NULs into SQLite
// indexes or future log lines. ULID (Crockford) and URL-safe base64 both
// fit cleanly inside [A-Za-z0-9_-].
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

// Whitelist of safe reason codes persisted to chat_wake_jobs.reason and
// returned to the client via /chat/wake/:jobId. Anything from the runtime
// that doesn't match a known prefix collapses to 'wake_failed' so we don't
// leak raw fetch/HTTP/internal-state strings (ECONNREFUSED, body slices,
// stack hints, etc.) to the browser.
function mapRuntimeReason(raw: string | undefined): string {
  if (!raw) return 'wake_failed';
  const r = raw.toLowerCase();
  if (r.includes('no valid gas coins') || r.includes('gas coin') || r.includes('gasbalancetoolow')) return 'gas_insufficient';
  if (r.includes('e_escrow_no_balance') || r.includes('e_insufficient_escrow_balance')) return 'escrow_insufficient';
  if (r.includes('e_payment_exceeds_notional_cap')) return 'notional_cap_exceeded';
  if (r.includes('http 429') || r.includes('rate limit') || r.includes('rate_limit')) return 'rate_limited';
  if (r.includes('infer_failed') || r.includes('inference')) return 'infer_failed';
  if (r.includes('budget') || r.includes('inference balance')) return 'budget_insufficient';
  if (r.includes('capability_owner_mismatch')) return 'capability_owner_mismatch';
  if (r.includes('pending_lock')) return 'pending_lock';
  if (r.includes('wake_http_5')) return 'runtime_error';
  if (r.includes('wake_http_4')) return 'runtime_rejected';
  if (r.includes('econnrefused') || r.includes('econnreset') || r.includes('fetch failed')) return 'agent_unreachable';
  if (r === 'daily_cap_reached') return 'daily_cap_reached';
  if (r === 'server_restarted') return 'server_restarted';
  if (r === 'dispatch_error') return 'dispatch_error';
  return 'wake_failed';
}

function normalize(addr: string): string {
  return addr.toLowerCase();
}

// Killswitch — set CHAT_WAKE_KILLSWITCH=true to reject all chat-wake requests
// at the edge without redeploying. Useful as an instant rollback lever after
// PR3 prod cutover. Other env-driven feature gates (alpha) still apply.
function isChatWakeKilled(): boolean {
  return process.env.CHAT_WAKE_KILLSWITCH === 'true';
}

// ===== /chat/challenge =====

export async function handleChatChallenge(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  if (isChatWakeKilled()) {
    writeJson(res, 503, corsHeaders, { error: 'chat_wake_disabled' });
    return;
  }

  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const b = body as Record<string, unknown>;
  const wallet = typeof b.wallet === 'string' ? b.wallet : null;
  const agent = typeof b.agent === 'string' ? b.agent : null;
  const capabilityId = typeof b.capabilityId === 'string' ? b.capabilityId : null;

  if (!wallet || !isValidSuiAddress(wallet)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_wallet' });
    return;
  }
  if (!agent || !isValidSuiAddress(agent)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_agent' });
    return;
  }
  if (!capabilityId || !isValidSuiAddress(capabilityId)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_capability_id' });
    return;
  }

  if (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
    // Try a sweep before giving up — the shared Map is cleaned every 60s by
    // baram-telegram-routes' interval, but a burst can fill it between ticks.
    cleanupExpiredChallenges();
    if (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
      writeJson(res, 503, corsHeaders, { error: 'challenge_capacity' });
      return;
    }
  }

  const now = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const issuedIso = new Date(now).toISOString();
  const entry: Omit<ChallengeEntry, 'expiresAt'> = {
    wallet: normalize(wallet),
    purpose: 'chat-wake',
    agent: normalize(agent),
    capabilityId: normalize(capabilityId),
  };
  const challenge = buildChallengeText(entry, nonce, issuedIso);
  const expiresAt = now + CHAT_CHALLENGE_TTL_MS;
  pendingChallenges.set(challenge, { ...entry, expiresAt });

  writeJson(res, 200, corsHeaders, { challenge, expiresAt });
}

// ===== /chat/session =====

export async function handleChatSession(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  if (isChatWakeKilled()) {
    writeJson(res, 503, corsHeaders, { error: 'chat_wake_disabled' });
    return;
  }

  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const result = await consumeChallenge(body as Record<string, unknown>, 'chat-wake');
  if (!result.ok) {
    const status = result.reason === 'bad_signature' ? 401 : 400;
    writeJson(res, status, corsHeaders, { error: result.reason });
    return;
  }
  const { entry } = result;
  if (!entry.agent || !entry.capabilityId) {
    writeJson(res, 500, corsHeaders, { error: 'internal_state' });
    return;
  }

  // Tuple validation: the (wallet, agent, capabilityId) triple must already
  // exist in agent_keys as the user's own provisioned agent. This blocks the
  // cross-agent abuse where a user (who controls capability C bound to A1)
  // mints a challenge claiming agent=A2 — verifyCapabilityOwner alone only
  // checks owner==wallet and would let that through, but agent_keys is the
  // source of truth for which agent a capability was provisioned against.
  const agentRow = getDb()
    .prepare(
      `SELECT 1 AS ok FROM agent_keys
        WHERE wallet_address = ? AND agent_address = ? AND capability_id = ?
          AND deleted_at IS NULL`,
    )
    .get(entry.wallet, entry.agent, entry.capabilityId) as { ok: number } | undefined;
  if (!agentRow) {
    writeJson(res, 403, corsHeaders, { error: 'agent_capability_mismatch' });
    return;
  }

  // Defense-in-depth: on-chain capability owner check (in case agent_keys
  // is stale relative to chain state, or the cap was transferred off-chain).
  // Wrapped in a wallclock timeout so a degraded RPC doesn't hang /session.
  let ownerOk = false;
  try {
    ownerOk = await Promise.race([
      verifyCapabilityOwner(entry.capabilityId, entry.wallet),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('capability_check_timeout')), 8_000),
      ),
    ]);
  } catch (err) {
    console.warn('[chat-wake] capability owner check failed:', (err as Error).message);
    writeJson(res, 503, corsHeaders, { error: 'capability_check_failed' });
    return;
  }
  if (!ownerOk) {
    writeJson(res, 403, corsHeaders, { error: 'capability_owner_mismatch' });
    return;
  }

  // Alpha gate — chat-only variant. NOT enforceAlphaGuards (that path is
  // createAgent-scoped and would false-reject existing users at the
  // per_wallet_cap check).
  if (isAlphaGateEnabled()) {
    const gate = isWalletAlphaActiveForChat(entry.wallet, entry.agent);
    if (!gate.ok) {
      const code = gate.reason === 'agent_paused' ? 423 : 403;
      writeJson(res, code, corsHeaders, { error: gate.reason });
      return;
    }
  }

  // Find an existing session, lazy-create one only if none exists. This
  // avoids piling new rows on every chat session — a returning user reuses
  // the same sid.
  let session = getActiveSessionByWalletAgent(entry.wallet, entry.agent, entry.capabilityId);
  if (!session) {
    session = createSession({
      wallet: entry.wallet,
      agent: entry.agent,
      capabilityId: entry.capabilityId,
    });
  }

  let issued: { token: string; expiresAt: number };
  try {
    issued = issueChatToken(session.sid);
  } catch (err) {
    if (err instanceof SessionInactiveError) {
      writeJson(res, 401, corsHeaders, { error: 'session_inactive' });
      return;
    }
    console.error('[chat-wake] issueChatToken failed:', (err as Error).message);
    writeJson(res, 500, corsHeaders, { error: 'internal_error' });
    return;
  }

  writeJson(res, 200, corsHeaders, {
    chatToken: issued.token,
    sid: session.sid,
    expiresAt: issued.expiresAt,
  });
}

// ===== /chat/wake (async dispatch) =====

interface WakeJobRow {
  job_id: string;
  status: 'pending' | 'done' | 'error';
}

interface WakeJobFull {
  job_id: string;
  sid: string;
  wallet: string;
  agent: string;
  status: 'pending' | 'done' | 'error';
  outcome_json: string | null;
  reason: string | null;
  user_message: string | null;
}

function lookupExistingJob(sid: string, idempotencyKey: string): WakeJobRow | undefined {
  return getDb()
    .prepare(
      `SELECT job_id, status FROM chat_wake_jobs
        WHERE sid = ? AND idempotency_key = ?`,
    )
    .get(sid, idempotencyKey) as WakeJobRow | undefined;
}

function insertJobRow(args: {
  jobId: string; sid: string; wallet: string; agent: string;
  idempotencyKey: string; now: number;
}): boolean {
  try {
    getDb()
      .prepare(
        `INSERT INTO chat_wake_jobs
           (job_id, sid, wallet, agent, idempotency_key, status,
            created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        args.jobId, args.sid, args.wallet, args.agent,
        args.idempotencyKey,
        args.now, args.now, args.now + JOB_TTL_MS,
      );
    return true;
  } catch (err) {
    // UNIQUE conflict on (sid, idempotency_key) — caller will re-lookup.
    if ((err as Error).message.includes('UNIQUE')) return false;
    throw err;
  }
}

function finalizeJob(jobId: string, outcome: WakeResult, userMessage: string | undefined): void {
  const now = Date.now();
  const status: 'done' | 'error' = outcome.ok ? 'done' : 'error';
  const outcomeJson = JSON.stringify({
    ok: outcome.ok,
    status: outcome.status,
    summary: outcome.summary,
    proposal: outcome.proposal,
  });
  // Map raw runtime reason → safe code before persisting. The whitelist
  // ensures the poll endpoint never returns ECONNREFUSED / body slices /
  // stack hints to the browser. The original raw reason is kept in chat-
  // server logs only (the .catch path below logs it; success paths don't
  // need to log a redundant reason).
  const safeReason = outcome.ok
    ? (outcome.status === 'skipped' && outcome.reason === 'pending_lock' ? 'pending_lock' : null)
    : mapRuntimeReason(outcome.error ?? outcome.reason);
  try {
    getDb()
      .prepare(
        `UPDATE chat_wake_jobs
           SET status = ?, outcome_json = ?, reason = ?, user_message = ?, updated_at = ?
         WHERE job_id = ?`,
      )
      .run(status, outcomeJson, safeReason, userMessage ?? null, now, jobId);
  } catch (err) {
    // DB error here means the row will stay 'pending' until the periodic
    // cleanup deletes it (10-min expires_at). Log but do not re-throw so
    // the caller's Promise chain doesn't blow up the process.
    console.error('[chat-wake] finalizeJob db error:', (err as Error).message, 'jobId=', jobId);
  }
}

// Map a runtime reason to a user-facing message. Mirrors what
// baram-telegram.ts shows on the Telegram surface so both surfaces give the
// user the same actionable next step.
function formatWakeMessage(outcome: WakeResult): string | undefined {
  if (outcome.ok && outcome.summary) return outcome.summary;
  if (outcome.ok && outcome.status === 'skipped' && outcome.reason === 'pending_lock') {
    return 'Your previous trade is still being processed. Please wait a moment and try again.';
  }
  if (outcome.ok) {
    return 'Done. Check your Dashboard for the latest activity.';
  }
  const r = (outcome.error ?? outcome.reason ?? '').toLowerCase();
  if (r.includes('no valid gas coins') || r.includes('gas coin') || r.includes('gasbalancetoolow')) {
    return 'Your agent has no NSN for gas, so it cannot sign transactions. Open the Funds card on your Dashboard and deposit a small amount of NSN to the agent\'s wallet, then try again.';
  }
  if (r.includes('e_escrow_no_balance') || r.includes('e_insufficient_escrow_balance')) {
    return 'Your agent has no trade capital in its escrow. Open the Funds card on your Dashboard and deposit NUSDC (and/or NBTC) as trading capital, then try again.';
  }
  if (r.includes('budget') || r.includes('inference balance')) {
    return 'Your agent\'s inference balance is empty. Open the Funds card on your Dashboard and top up the Inference Balance, then try again.';
  }
  if (r.includes('http 429') || r.includes('rate limit')) {
    return 'The AI provider is rate-limited right now. Please try again in a moment.';
  }
  if (r.includes('infer_failed') || r.includes('inference')) {
    return 'Your agent could not complete an inference call. Please try again shortly.';
  }
  return 'Your agent could not process that right now. Please try again shortly.';
}

export async function handleChatWake(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  if (isChatWakeKilled()) {
    writeJson(res, 503, corsHeaders, { error: 'chat_wake_disabled' });
    return;
  }

  let body: unknown;
  try { body = await readJsonBody(req); } catch (err) {
    const code = (err as Error).message === 'body_too_large' ? 413 : 400;
    writeJson(res, code, corsHeaders, { error: (err as Error).message });
    return;
  }
  const b = body as Record<string, unknown>;
  const chatToken = typeof b.chatToken === 'string' ? b.chatToken : null;
  const message = typeof b.message === 'string' ? b.message : null;
  const idempotencyKey = typeof b.idempotencyKey === 'string' ? b.idempotencyKey : null;

  if (!chatToken) { writeJson(res, 401, corsHeaders, { error: 'missing_token' }); return; }
  if (!message || message.length === 0) { writeJson(res, 400, corsHeaders, { error: 'empty_message' }); return; }
  if (message.length > MAX_MESSAGE_CHARS) { writeJson(res, 400, corsHeaders, { error: 'message_too_long' }); return; }
  if (!idempotencyKey || !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_idempotency_key' });
    return;
  }

  const verified = verifyChatToken(chatToken);
  if (!verified.ok) {
    writeJson(res, 401, corsHeaders, { error: chatTokenErrorCode(verified.reason) });
    return;
  }
  const session = getSession(verified.sid);
  if (!session || session.revokedAt !== null || session.expiresAt <= Date.now()) {
    writeJson(res, 401, corsHeaders, { error: 'session_inactive' });
    return;
  }

  // Idempotency: same (sid, idempotencyKey) → return the prior jobId so a
  // browser retry on the same Send click doesn't double-bill Budget.
  const existing = lookupExistingJob(session.sid, idempotencyKey);
  if (existing) {
    writeJson(res, 202, corsHeaders, { jobId: existing.job_id, status: existing.status });
    return;
  }

  // Endpoint freshness — agent-runner must be heartbeating for /wake to land.
  const ep = getEndpoint(session.agent);
  if (!ep || !isEndpointFresh(ep)) {
    writeJson(res, 503, corsHeaders, { error: 'agent_offline' });
    return;
  }

  // Budget pre-check — fail fast before we burn a daily cap slot.
  if (!ep.budgetId) {
    writeJson(res, 503, corsHeaders, { error: 'budget_inactive' });
    return;
  }
  const budgetCheck = await checkBudgetSufficient(ep.budgetId);
  if (!budgetCheck.ok) {
    writeJson(res, 402, corsHeaders, { error: 'budget_' + (budgetCheck.reason ?? 'unknown') });
    return;
  }

  // Insert the pending row first, so even if the client disconnects right
  // after submit, the dispatch still happens and the result is poll-able.
  // UNIQUE collision on (sid, idempotency_key) can only happen if a duplicate
  // arrived between our lookupExistingJob and INSERT — re-resolve in that case.
  const jobId = ulid();
  const now = Date.now();
  const inserted = insertJobRow({
    jobId, sid: session.sid, wallet: session.wallet, agent: session.agent,
    idempotencyKey, now,
  });
  if (!inserted) {
    const existingNow = lookupExistingJob(session.sid, idempotencyKey);
    if (existingNow) {
      writeJson(res, 202, corsHeaders, { jobId: existingNow.job_id, status: existingNow.status });
      return;
    }
    writeJson(res, 500, corsHeaders, { error: 'idempotency_race' });
    return;
  }

  // Reserve the daily cognition slot ONLY after the row exists, so a refund
  // (on wake failure) is always tied to a finalized row.
  const reservation = reserveCognitionSlot(session.wallet);
  if (!reservation.ok) {
    finalizeJob(jobId, {
      ok: false,
      error: 'daily_cap_reached',
    }, `Daily message limit reached (${reservation.cap}/day). Limits reset at 00:00 UTC.`);
    writeJson(res, 202, corsHeaders, { jobId, status: 'error' });
    return;
  }

  // Issue the wake JWT (5-min, for runtime verification).
  let wakeJwt: string;
  try {
    wakeJwt = issueShortLivedJWT(session.sid);
  } catch (err) {
    releaseCognitionSlot(session.wallet);
    const reason = err instanceof SessionInactiveError ? err.reason : 'jwt_failed';
    finalizeJob(jobId, { ok: false, error: reason }, 'Your session has expired. Please refresh and try again.');
    writeJson(res, 202, corsHeaders, { jobId, status: 'error' });
    return;
  }

  const wakeBody: WakeBody = {
    job_id: ulid(),
    jwt: wakeJwt,
    trigger_type: 'user_message',
    intent_id: ulid(),
    message: message.slice(0, MAX_MESSAGE_CHARS),
  };

  // Respond immediately. The actual /wake call happens off the request
  // lifecycle so CloudFront/nginx don't time out on a 60-120s response.
  writeJson(res, 202, corsHeaders, { jobId, status: 'pending' });

  // Background dispatch. Wrapped in an async IIFE so a sync throw inside any
  // step (db error in finalizeJob, programming bug) cannot escape as an
  // UnhandledPromiseRejection — every error path ends in finalizeJob within
  // a try, and finalizeJob itself swallows db errors.
  setImmediate(() => {
    void (async () => {
      try {
        const outcome = await forwardToWake(`${ep.httpUrl}/wake`, wakeBody);

        // Refund the cognition slot when the user didn't actually consume an
        // LLM call. Two refund cases:
        //   1. wake returned !ok (RPC timeout, infer_failed, runtime crash).
        //   2. wake returned ok=true but status='skipped' && reason='pending_lock'
        //      — analyst rejected before LLM because a prior proposal is locked.
        //      The user can retry once the lock clears; charging a slot for a
        //      server-side mutex rejection is hostile.
        const isPendingLockSkip =
          outcome.ok &&
          outcome.status === 'skipped' &&
          outcome.reason === 'pending_lock';
        if (!outcome.ok || isPendingLockSkip) {
          releaseCognitionSlot(session.wallet);
        }
        finalizeJob(jobId, outcome, formatWakeMessage(outcome));
      } catch (err) {
        // Should be unreachable: forwardToWake never throws (returns ok:false).
        // This catches any programmer error introduced by a future refactor.
        releaseCognitionSlot(session.wallet);
        console.error('[chat-wake] dispatch error:', (err as Error).message);
        finalizeJob(
          jobId,
          { ok: false, error: 'dispatch_error' },
          'Your agent could not process that right now. Please try again shortly.',
        );
      }
    })();
  });
}

// ===== GET /chat/wake/:jobId =====

export async function handleChatWakePoll(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  corsHeaders: Record<string, string>,
  jobId: string,
): Promise<void> {
  if (isChatWakeKilled()) {
    writeJson(res, 503, corsHeaders, { error: 'chat_wake_disabled' });
    return;
  }

  // chatToken comes via Authorization: Bearer <token> so polling can be a GET
  // without leaking the token into URL/CloudFront logs.
  const auth = req.headers['authorization'];
  const token = typeof auth === 'string' && auth.startsWith('Bearer ')
    ? auth.slice('Bearer '.length)
    : null;
  if (!token) {
    writeJson(res, 401, corsHeaders, { error: 'missing_token' });
    return;
  }
  const verified = verifyChatToken(token);
  if (!verified.ok) {
    writeJson(res, 401, corsHeaders, { error: chatTokenErrorCode(verified.reason) });
    return;
  }

  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(jobId)) {
    writeJson(res, 400, corsHeaders, { error: 'invalid_job_id' });
    return;
  }

  const row = getDb()
    .prepare(
      `SELECT job_id, sid, wallet, agent, status, outcome_json, reason, user_message
       FROM chat_wake_jobs WHERE job_id = ?`,
    )
    .get(jobId) as WakeJobFull | undefined;

  if (!row) {
    writeJson(res, 404, corsHeaders, { error: 'job_not_found' });
    return;
  }
  if (row.sid !== verified.sid) {
    // Token's session does not own this jobId. Don't leak existence beyond 404.
    writeJson(res, 404, corsHeaders, { error: 'job_not_found' });
    return;
  }

  let outcome: unknown;
  if (row.outcome_json) {
    try { outcome = JSON.parse(row.outcome_json); } catch { outcome = undefined; }
  }

  writeJson(res, 200, corsHeaders, {
    jobId: row.job_id,
    status: row.status,
    outcome,
    reason: row.reason ?? undefined,
    userMessage: row.user_message ?? undefined,
  });
}

// ===== Dispatcher =====

const CHAT_PREFIX = '/api/nasun-ai/chat/';
const JOB_ID_RE = /^\/api\/nasun-ai\/chat\/wake\/([0-9A-HJKMNP-TV-Z]{26})$/;

export async function handleChatWakeRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  url: URL,
  baseCorsHeaders: Record<string, string>,
): Promise<boolean> {
  if (!url.pathname.startsWith(CHAT_PREFIX)) return false;

  const corsHeaders: Record<string, string> = {
    ...baseCorsHeaders,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  try {
    if (req.method === 'POST' && url.pathname === '/api/nasun-ai/chat/challenge') {
      await handleChatChallenge(req, res, corsHeaders);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/nasun-ai/chat/session') {
      await handleChatSession(req, res, corsHeaders);
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/nasun-ai/chat/wake') {
      await handleChatWake(req, res, corsHeaders);
      return true;
    }
    const m = url.pathname.match(JOB_ID_RE);
    if (req.method === 'GET' && m) {
      await handleChatWakePoll(req, res, corsHeaders, m[1]);
      return true;
    }
    writeJson(res, 404, corsHeaders, { error: 'not_found' });
    return true;
  } catch (err) {
    console.error('[chat-wake] handler error:', (err as Error).message);
    if (!res.headersSent) {
      writeJson(res, 500, corsHeaders, { error: 'internal_error' });
    }
    return true;
  }
}

// Map verifyChatToken failure reasons to a small set of client-safe codes.
// Only 'expired' is distinguished — that's the signal the frontend uses to
// trigger an automatic re-sign. Internal failure modes (malformed, bad_
// signature, bad_header, bad_payload, bad_scope) all collapse to
// 'invalid_token' so a probing attacker can't tell what went wrong.
function chatTokenErrorCode(reason: VerifyChatTokenFailure['reason']): string {
  return reason === 'expired' ? 'expired' : 'invalid_token';
}
