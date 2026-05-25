// Nasun AI alpha · runtime guards shared by createAgent + waitlist endpoints.
//
// Centralizes:
//   - feature flag check (ALPHA_GATE_ENABLED) — single escape hatch
//   - per-wallet slot exemption check (santa, admin)
//   - waitlist 'invited' verification
//   - per-wallet cap (1 active agent / wallet)
//   - system cap (8) + in-memory `pendingSlots` mutex for the SSM-put gap
//   - Genesis Pass eligibility (6h cache + Lambda refresh, fail-closed)
//
// Why an in-memory mutex: better-sqlite3 is synchronous, so all SQL races
// inside a single tick are impossible. But createAgent must await SSM
// PutParameter before the agent_keys INSERT, which yields the event loop.
// Two concurrent uploads can both pass the SQL count and only collide at
// INSERT time. The pendingSlots counter holds a reservation across the
// SSM await so cap=8 stays correct under contention.

import { getDb } from './store.js';
import { setGenesisPassStatus, getGenesisPassCheckedAt, getGenesisPassStatus } from './store.js';

export class GuardError extends Error {
  constructor(public code: string, public httpStatus: number) {
    super(code);
  }
}

// === Env tunables (read on first call, not cached — env changes between
// pm2 restarts only, and reads are cheap) ===

function systemCap(): number {
  const raw = process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
  if (raw === undefined || raw === '') return 8;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 8;
}

function agentTtlMs(): number {
  const raw = process.env.NASUN_AI_ALPHA_AGENT_TTL_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 36 * 60 * 60 * 1000;
}

function claimWindowMs(): number {
  const raw = process.env.NASUN_AI_ALPHA_CLAIM_WINDOW_MS;
  if (raw === undefined || raw === '') return 10 * 60 * 60 * 1000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 10 * 60 * 60 * 1000;
}

// Grace window for the killer's re-invite. Long enough that a user who
// killed by mistake (or to rotate keys) can recreate before the slot is
// re-issued to the next waiter; short enough that an abandoned kill does
// not park a slot indefinitely. 24h matches the typical 36h session TTL
// rhythm without doubling it.
function killGraceMs(): number {
  const raw = process.env.NASUN_AI_ALPHA_KILL_GRACE_MS;
  if (raw === undefined || raw === '') return 24 * 60 * 60 * 1000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000;
}

export function getKillGraceMs(): number {
  return killGraceMs();
}

const PER_WALLET_CAP = 1;

export function getPerWalletCap(): number {
  return PER_WALLET_CAP;
}
// Slop so that a freshly-invited user whose `invite_expires_at` just ticked
// past while their wallet was signing the upload challenge still passes the
// guard. Picked to be > worst-case sig-sign + body roundtrip (~30s on slow
// links); not user-tunable.
const INVITE_GRACE_MS = 5 * 60 * 1000;

export function isAlphaGateEnabled(): boolean {
  return process.env.ALPHA_GATE_ENABLED === 'true';
}

export function getAgentTtlMs(): number {
  return agentTtlMs();
}

export function getClaimWindowMs(): number {
  return claimWindowMs();
}

export function getSystemCap(): number {
  return systemCap();
}

// === in-memory slot reservation ===

let pendingSlots = 0;

/**
 * Wraps an async fn (SSM put + SQL insert) with a slot reservation that
 * survives await boundaries. Throws `alpha_full` when the cap (active +
 * pending) would be exceeded.
 *
 * No-op for slot-exempt callers (santa) — they bypass the cap entirely.
 *
 * Reserved slots are released in `finally`, so an SQL error inside `fn`
 * does not strand the counter. crash recovery: if chat-server dies mid-
 * upload, the counter resets to 0 on restart — at most N (=8) extra slots
 * could be granted in the worst case, which is acceptable for alpha scale.
 */
export async function withSlotReservation<T>(
  slotExempt: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  if (slotExempt) return fn();
  const active = countActiveAgents();
  const cap = systemCap();
  if (active + pendingSlots >= cap) {
    throw new GuardError('alpha_full', 503);
  }
  pendingSlots++;
  try {
    return await fn();
  } finally {
    if (pendingSlots > 0) pendingSlots--;
  }
}

/** Test-only: peek the reservation counter. */
export function __peekPendingSlots(): number {
  return pendingSlots;
}

// === SQL helpers ===

interface AgentKeyExemptRow { slot_exempt?: number }

function lookupSlotExempt(agentAddress: string): boolean {
  const row = getDb()
    .prepare('SELECT slot_exempt FROM agent_keys WHERE agent_address = ?')
    .get(agentAddress.toLowerCase()) as AgentKeyExemptRow | undefined;
  return row?.slot_exempt === 1;
}

/** Counts agent_keys that occupy a cap slot. Excludes santa + paused + soft-deleted. */
export function countActiveAgents(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM agent_keys
        WHERE deleted_at IS NULL AND slot_exempt = 0 AND paused_at IS NULL`,
    )
    .get() as { n: number };
  return row?.n ?? 0;
}

export function countMyActiveAgents(walletAddress: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM agent_keys
        WHERE wallet_address = ?
          AND deleted_at IS NULL
          AND slot_exempt = 0
          AND paused_at IS NULL`,
    )
    .get(walletAddress.toLowerCase()) as { n: number };
  return row?.n ?? 0;
}

interface WaitlistInviteRow {
  wallet_address: string;
  invite_expires_at: number | null;
}

function lookupInvited(walletAddress: string): WaitlistInviteRow | null {
  const row = getDb()
    .prepare(
      `SELECT wallet_address, invite_expires_at FROM alpha_waitlist
        WHERE wallet_address = ? AND status = 'invited'`,
    )
    .get(walletAddress.toLowerCase()) as WaitlistInviteRow | undefined;
  return row ?? null;
}

// === Genesis Pass eligibility ===

const GP_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

async function fetchGenesisPassOwnership(walletAddress: string): Promise<boolean | null> {
  const apiUrl = process.env.GENESIS_PASS_API_URL;
  if (!apiUrl) return null;
  try {
    const res = await fetch(
      `${apiUrl}/genesis-pass/check?nasunAddress=${encodeURIComponent(walletAddress)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      data?: { hasGenesisPass?: boolean };
    };
    if (data.success !== true) return null;
    return data.data?.hasGenesisPass === true;
  } catch (err) {
    console.warn(`[alpha-guards] GP fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Returns true if the wallet currently holds a Genesis Pass. Cached for 6h
 * in `users.has_genesis_pass`. Cache miss falls back to the Lambda; if the
 * Lambda is unreachable AND there is no cached answer, returns null
 * (fail-closed at the caller).
 */
export async function checkGenesisPassEligibility(walletAddress: string): Promise<boolean | null> {
  const wallet = walletAddress.toLowerCase();
  const checkedAt = getGenesisPassCheckedAt(wallet);
  if (checkedAt > 0 && Date.now() - checkedAt < GP_CACHE_TTL_MS) {
    return getGenesisPassStatus(wallet);
  }
  const fresh = await fetchGenesisPassOwnership(wallet);
  if (fresh === null) {
    // Lambda unreachable. If a cache value (even stale) exists, surface it
    // so users with previously confirmed GP don't get locked out by
    // transient outages. Otherwise return null and let the caller 503.
    if (checkedAt > 0) return getGenesisPassStatus(wallet);
    return null;
  }
  setGenesisPassStatus(wallet, fresh);
  return fresh;
}

// === Main guard ===

export interface GuardContext {
  /** true if the agent row is santa/admin, so caps are bypassed for it. */
  slotExempt: boolean;
}

/**
 * The single createAgent gate. Called from `handleVaultUpload` AND
 * `handleVaultRestore` before any SSM/SQL mutation. Throws GuardError
 * on rejection; returns a context flag the caller passes to
 * `withSlotReservation` so the in-memory cap counter stays consistent.
 *
 * Order matters:
 *   0. flag check — escape hatch
 *   1. slot_exempt — santa bypass
 *   2. waitlist 'invited' — Genesis Pass + queue gating already passed
 *      at /alpha/join, so this is a fast SQL check
 *   3. per-wallet cap — protects against a single Genesis Pass holder
 *      activating two agents in quick succession
 *
 * System cap (step 4) is enforced inside `withSlotReservation` so the
 * caller can scope the reservation around the SSM call.
 */
export function enforceAlphaGuards(
  walletAddress: string,
  agentAddress: string,
): GuardContext {
  if (!isAlphaGateEnabled()) {
    // Pre-launch: every callsite continues to work without alpha gating.
    return { slotExempt: false };
  }
  const slotExempt = lookupSlotExempt(agentAddress);
  if (slotExempt) return { slotExempt: true };

  const invite = lookupInvited(walletAddress);
  if (!invite) {
    throw new GuardError('not_invited', 403);
  }
  // Treat NULL invite_expires_at as expired (defensive): the cron always
  // stamps it when promoting to 'invited', so NULL here means manual SQL
  // or a future schema regression — fail closed rather than letting an
  // un-bounded invite through the guard.
  const expiresAt = invite.invite_expires_at;
  if (expiresAt === null || expiresAt < Date.now() - INVITE_GRACE_MS) {
    // The cron will sweep this row at the next tick; meanwhile reject the
    // upload so the user gets feedback instead of a silent acceptance.
    throw new GuardError('invite_expired', 410);
  }

  const mine = countMyActiveAgents(walletAddress);
  if (mine >= PER_WALLET_CAP) {
    throw new GuardError('per_wallet_cap_reached', 409);
  }

  return { slotExempt: false };
}

/**
 * Read-only gate for the web chat surface. Unlike `enforceAlphaGuards`,
 * this is NOT a createAgent context — there is no SSM put, no per-wallet
 * cap collision, no new slot to reserve. The user already passed
 * `enforceAlphaGuards` when their agent was created; this function only
 * verifies that the wallet still has the right to use the runtime they
 * already provisioned.
 *
 * Returns `{ ok: true }` when chat is allowed, or `{ ok: false, reason }`
 * with a stable code the caller maps to user-facing text.
 *
 * Allowed when:
 *   - alpha gate disabled (pre-launch / staging escape hatch), OR
 *   - the agent row is slot-exempt (santa/admin), OR
 *   - the wallet has at least one active agent in agent_keys
 *     (deleted_at IS NULL AND paused_at IS NULL).
 *
 * Rejected when the wallet has no active agent OR the agent row is paused
 * (compliance pause, suspected abuse). 'invited' state without an active
 * agent is also rejected — the user needs to complete agent creation first.
 */
export interface ChatGuardResult {
  ok: boolean;
  reason?: 'alpha_gate_off_but_no_agent' | 'no_active_agent' | 'agent_paused' | 'wallet_not_authorized';
}

interface AgentChatRow { paused_at: number | null; slot_exempt: number }

export function isWalletAlphaActiveForChat(walletAddress: string, agentAddress: string): ChatGuardResult {
  const wallet = walletAddress.toLowerCase();
  const agent = agentAddress.toLowerCase();

  // Wallet must own this specific agent row (defense-in-depth on top of the
  // on-chain capability owner check the caller does separately).
  //
  // paused_at + slot_exempt are added by scripts/alpha-migration.sql; in
  // pre-migration environments fall back to a column-agnostic query so chat
  // still works on dev boxes that haven't applied the migration yet.
  let row: AgentChatRow | undefined;
  try {
    row = getDb()
      .prepare(
        `SELECT paused_at, slot_exempt FROM agent_keys
          WHERE wallet_address = ? AND agent_address = ? AND deleted_at IS NULL`,
      )
      .get(wallet, agent) as AgentChatRow | undefined;
  } catch {
    // Column missing — try the minimal query.
    const fallback = getDb()
      .prepare(
        `SELECT 1 AS ok FROM agent_keys
          WHERE wallet_address = ? AND agent_address = ? AND deleted_at IS NULL`,
      )
      .get(wallet, agent) as { ok: number } | undefined;
    return fallback ? { ok: true } : { ok: false, reason: 'wallet_not_authorized' };
  }

  if (!row) {
    return { ok: false, reason: 'wallet_not_authorized' };
  }

  if (row.paused_at !== null) {
    // slot_exempt rows can still be paused (e.g. for ops); honor the pause.
    return { ok: false, reason: 'agent_paused' };
  }

  return { ok: true };
}

/**
 * Called after a successful createAgent / restore to clear the user's
 * waitlist row. Idempotent — safe to call even when no row exists
 * (e.g. santa, or when the gate is OFF and no row was ever created).
 */
export function consumeWaitlistInvite(walletAddress: string): void {
  getDb()
    .prepare(`DELETE FROM alpha_waitlist WHERE wallet_address = ?`)
    .run(walletAddress.toLowerCase());
}

/**
 * Re-grants the killing wallet a fresh 'invited' row so the user can
 * recreate without falling to the back of a 60-deep queue. Without this,
 * a kill (intentional rotation or accidental) silently disenfranchises an
 * alpha tester who has already cleared the Genesis Pass + slot lottery
 * gates — the next /alpha/status call returns state='none' and the
 * Quick Start CTA is blocked.
 *
 * Counted against system cap via phaseInvite.countActiveAndPending, so
 * processQueueTick (called immediately after handleVaultDelete) won't
 * promote a new waiter into the slot we are reserving for the killer.
 * After the grace window the invite expires through the normal
 * phaseInviteExpire path (miss_count=0 → re-queue at tail, same as a
 * regular missed claim).
 *
 * No-op when:
 *   - the alpha gate is disabled (no waitlist concept)
 *   - the wallet is slot_exempt (santa bypasses caps entirely)
 *
 * Always resets miss_count to 0: the user is voluntarily acting, not
 * passively missing a window, so the next-miss-is-permanent state should
 * not carry over from a prior expired invite.
 */
export function grantKillRecoveryInvite(walletAddress: string): void {
  if (!isAlphaGateEnabled()) return;
  const wallet = walletAddress.toLowerCase();
  // Slot-exempt (santa / ops) wallets bypass the cap entirely; granting them
  // a waitlist row would pollute the queue without giving them anything new.
  // Filter without `deleted_at IS NULL` because this is called *after* the
  // delete sets deleted_at — we want to know historical exemption, not the
  // current active set.
  try {
    const row = getDb()
      .prepare(
        `SELECT 1 AS ok FROM agent_keys WHERE wallet_address = ? AND slot_exempt = 1 LIMIT 1`,
      )
      .get(wallet) as { ok: number } | undefined;
    if (row) return;
  } catch {
    // slot_exempt column missing on pre-migrated DBs — fall through and
    // grant the invite. Pre-migration environments have no waitlist
    // semantics anyway, so the row is harmless.
  }
  const now = Date.now();
  const expiresAt = now + killGraceMs();
  getDb()
    .prepare(
      `INSERT INTO alpha_waitlist (wallet_address, status, joined_at, invited_at, invite_expires_at, miss_count)
       VALUES (?, 'invited', ?, ?, ?, 0)
       ON CONFLICT(wallet_address) DO UPDATE SET
         status = 'invited',
         invited_at = excluded.invited_at,
         invite_expires_at = excluded.invite_expires_at,
         miss_count = 0`,
    )
    .run(wallet, now, now, expiresAt);
}
