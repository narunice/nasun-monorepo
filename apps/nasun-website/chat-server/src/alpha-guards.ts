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
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 8;
}

function agentTtlMs(): number {
  const raw = process.env.NASUN_AI_ALPHA_AGENT_TTL_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 36 * 60 * 60 * 1000;
}

function claimWindowMs(): number {
  const raw = process.env.NASUN_AI_ALPHA_CLAIM_WINDOW_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 6 * 60 * 60 * 1000;
}

const PER_WALLET_CAP = 1;
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

function countMyActiveAgents(walletAddress: string): number {
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
 * Called after a successful createAgent / restore to clear the user's
 * waitlist row. Idempotent — safe to call even when no row exists
 * (e.g. santa, or when the gate is OFF and no row was ever created).
 */
export function consumeWaitlistInvite(walletAddress: string): void {
  getDb()
    .prepare(`DELETE FROM alpha_waitlist WHERE wallet_address = ?`)
    .run(walletAddress.toLowerCase());
}
