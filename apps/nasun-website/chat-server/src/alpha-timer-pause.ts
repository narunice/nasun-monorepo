// Nasun AI alpha · timer pause helpers.
//
// Why this exists: when admin reworks the alpha UI (or any other reason the
// queue must be frozen without burning user time), the natural impulse is to
// "stop the clock" on (a) live agents — so their TTL doesn't tick down while
// the UI is broken — and (b) outstanding invites — so the claim window
// doesn't expire while the user can't realistically claim.
//
// alpha-cron already filters on `expires_at IS NOT NULL` and
// `invite_expires_at IS NOT NULL`, so the cheap way to freeze a clock is to
// stash the original timestamp somewhere safe and NULL out the column. On
// resume, we add the paused duration to the original timestamp so the user
// gets back exactly the time they had remaining.
//
// 2026-05-22 incident motivating this code: the table was created manually
// in prod and populated by ad-hoc SQL during a UI rework, but nothing in
// the chat-server source referenced it — alpha-cron kept ticking against
// the live `expires_at` / `invite_expires_at` columns and auto-requeued
// ~8 alpha testers (incl. @sunominq) into the back of the queue. The
// helpers here make the pause/resume primitives explicit, idempotent, and
// safe to call from admin tooling.

import { getDb } from './store.js';

let schemaEnsured = false;

export function ensureTimerPauseSchema(): void {
  if (schemaEnsured) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS alpha_timer_pause (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      original_ts INTEGER NOT NULL,
      paused_at INTEGER NOT NULL,
      PRIMARY KEY (scope, key)
    )
  `);
  schemaEnsured = true;
}

interface PauseRow { original_ts: number; paused_at: number }

// === Agent timer (expires_at on agent_keys) ===

/**
 * Freeze an agent's expires_at clock. Idempotent: re-calling on an already
 * paused agent is a no-op and returns false. Returns true when a new pause
 * was recorded. Throws if the agent doesn't exist or is already past expiry
 * — callers should resume + re-stamp instead of pausing a corpse.
 */
export function pauseAgentTimer(agentAddress: string): boolean {
  ensureTimerPauseSchema();
  const db = getDb();
  const now = Date.now();
  const agent = agentAddress.toLowerCase();

  const existing = db
    .prepare(`SELECT 1 AS n FROM alpha_timer_pause WHERE scope = 'agent' AND key = ?`)
    .get(agent) as { n: number } | undefined;
  if (existing) return false;

  const row = db
    .prepare(`SELECT expires_at FROM agent_keys WHERE agent_address = ? AND deleted_at IS NULL`)
    .get(agent) as { expires_at: number | null } | undefined;
  if (!row) throw new Error(`agent ${agent} not found or deleted`);
  if (row.expires_at === null) {
    // expires_at NULL means either slot_exempt (santa) or already past
    // post-expire pause (paused_at set by phaseExpire). Either way there
    // is no clock to freeze; record this as a no-op so callers can't
    // accidentally turn an exempt row into a "paused" row.
    return false;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO alpha_timer_pause (scope, key, original_ts, paused_at) VALUES ('agent', ?, ?, ?)`,
    ).run(agent, row.expires_at, now);
    db.prepare(`UPDATE agent_keys SET expires_at = NULL WHERE agent_address = ?`).run(agent);
  });
  tx();
  return true;
}

/**
 * Resume an agent's clock. The new expires_at is original_ts + (now -
 * paused_at), giving the user back the exact remaining time they had at
 * pause time (not the original full TTL). Returns true when a pause was
 * cleared, false when no pause existed.
 */
export function resumeAgentTimer(agentAddress: string): boolean {
  ensureTimerPauseSchema();
  const db = getDb();
  const now = Date.now();
  const agent = agentAddress.toLowerCase();

  const pause = db
    .prepare(
      `SELECT original_ts, paused_at FROM alpha_timer_pause WHERE scope = 'agent' AND key = ?`,
    )
    .get(agent) as PauseRow | undefined;
  if (!pause) return false;

  const elapsedPausedMs = Math.max(0, now - pause.paused_at);
  const newExpiresAt = pause.original_ts + elapsedPausedMs;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE agent_keys SET expires_at = ? WHERE agent_address = ? AND deleted_at IS NULL`,
    ).run(newExpiresAt, agent);
    db.prepare(`DELETE FROM alpha_timer_pause WHERE scope = 'agent' AND key = ?`).run(agent);
  });
  tx();
  return true;
}

// === Invite timer (invite_expires_at on alpha_waitlist) ===

/**
 * Freeze a waitlist invite's claim-window clock. Targets the row keyed by
 * wallet_address in status='invited'. Same idempotency contract as
 * pauseAgentTimer.
 */
export function pauseInviteTimer(walletAddress: string): boolean {
  ensureTimerPauseSchema();
  const db = getDb();
  const now = Date.now();
  const wallet = walletAddress.toLowerCase();

  const existing = db
    .prepare(`SELECT 1 AS n FROM alpha_timer_pause WHERE scope = 'invite' AND key = ?`)
    .get(wallet) as { n: number } | undefined;
  if (existing) return false;

  const row = db
    .prepare(
      `SELECT invite_expires_at FROM alpha_waitlist WHERE wallet_address = ? AND status = 'invited'`,
    )
    .get(wallet) as { invite_expires_at: number | null } | undefined;
  if (!row) throw new Error(`invite row for ${wallet} not found or not in 'invited' status`);
  if (row.invite_expires_at === null) return false;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO alpha_timer_pause (scope, key, original_ts, paused_at) VALUES ('invite', ?, ?, ?)`,
    ).run(wallet, row.invite_expires_at, now);
    db.prepare(
      `UPDATE alpha_waitlist SET invite_expires_at = NULL WHERE wallet_address = ?`,
    ).run(wallet);
  });
  tx();
  return true;
}

export function resumeInviteTimer(walletAddress: string): boolean {
  ensureTimerPauseSchema();
  const db = getDb();
  const now = Date.now();
  const wallet = walletAddress.toLowerCase();

  const pause = db
    .prepare(
      `SELECT original_ts, paused_at FROM alpha_timer_pause WHERE scope = 'invite' AND key = ?`,
    )
    .get(wallet) as PauseRow | undefined;
  if (!pause) return false;

  const elapsedPausedMs = Math.max(0, now - pause.paused_at);
  const newInviteExpiresAt = pause.original_ts + elapsedPausedMs;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE alpha_waitlist SET invite_expires_at = ? WHERE wallet_address = ? AND status = 'invited'`,
    ).run(newInviteExpiresAt, wallet);
    db.prepare(`DELETE FROM alpha_timer_pause WHERE scope = 'invite' AND key = ?`).run(wallet);
  });
  tx();
  return true;
}

// === Cron-side guards ===
//
// Defensive double-checks consumed by alpha-cron. The pause helpers above
// NULL the expires_at / invite_expires_at columns, and the cron queries
// already filter on `... IS NOT NULL`, so a correctly-paused row is
// invisible to expiry phases. These guards protect against the case where
// admin tooling inserts a alpha_timer_pause row without NULLing the column
// (e.g. raw SQL during incident recovery) — cron still skips the row.

export interface TimerPauseKeys {
  pausedAgents: Set<string>;
  pausedInvites: Set<string>;
}

export function loadTimerPauseKeys(): TimerPauseKeys {
  ensureTimerPauseSchema();
  const rows = getDb()
    .prepare(`SELECT scope, key FROM alpha_timer_pause`)
    .all() as Array<{ scope: string; key: string }>;
  const pausedAgents = new Set<string>();
  const pausedInvites = new Set<string>();
  for (const r of rows) {
    if (r.scope === 'agent') pausedAgents.add(r.key);
    else if (r.scope === 'invite') pausedInvites.add(r.key);
  }
  return { pausedAgents, pausedInvites };
}
