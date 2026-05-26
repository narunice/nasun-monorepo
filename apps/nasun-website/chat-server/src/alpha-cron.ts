// Nasun AI alpha · single-tick cron.
//
// Runs every ~60s while `ALPHA_GATE_ENABLED=true`. Each tick performs five
// short phases in sequence; SQL inside each phase commits synchronously
// (better-sqlite3), and any expensive I/O — pm2 delete, Telegram send — is
// dispatched off the transaction with `Promise.allSettled` so a single
// stuck call cannot starve the others.
//
// Phases:
//   1. last_run heartbeat (dead-man monitor outside tracks staleness)
//   2. warning fan-out (T+30h enters the 6h warn window)
//   3. expiry (T+36h): SQL pause + best-effort pm2 delete + TG notice
//   4. invite (free slots → queue head)
//   5. invite expiry (claim window elapsed → re-queue or expire)
//
// Why one big function instead of separate timers per phase: the 2026-05-13
// chat-server aggregator incident showed that overlapping `setInterval`s
// compound event-loop blocking. Single tick keeps the worst-case duration
// observable in a single log line.

import { getDb } from './store.js';
import { getClaimWindowMs, getSystemCap, isAlphaGateEnabled } from './alpha-guards.js';
import { pushUserMessage } from './baram-telegram.js';
import { stopAgentPm2, pm2Save } from './agent-orchestrator.js';
import { traceAsync, traceSync } from './perf-trace.js';
import { ensureTimerPauseSchema, loadTimerPauseKeys } from './alpha-timer-pause.js';

const TICK_INTERVAL_MS = 60_000;
const WARN_LEAD_MS = 6 * 60 * 60 * 1000;  // T-6h warning before expiry (= claim window length)

let tickTimer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

// Module-public lifecycle. Server.ts calls these once based on the flag.
export function startAlphaCron(): void {
  if (tickTimer) return;
  // Ensure the alpha_timer_pause table exists before the first tick reads
  // it — keeps fresh environments (dev, staging post-reset) from crashing
  // the cron in loadTimerPauseKeys() on the first iteration.
  try {
    ensureTimerPauseSchema();
  } catch (err) {
    console.warn('[alpha-cron] ensureTimerPauseSchema failed:', (err as Error).message);
  }
  // Best-effort initial tick on boot so a chat-server restart doesn't
  // miss an expiry by up to one interval. Errors here must not crash the
  // boot path — they're already logged by tick() internally.
  void tick().catch(() => { /* swallowed */ });
  tickTimer = setInterval(() => {
    void tick().catch(() => { /* swallowed */ });
  }, TICK_INTERVAL_MS);
  tickTimer.unref();
  console.log(`[alpha-cron] started (interval=${TICK_INTERVAL_MS}ms)`);
}

export function stopAlphaCron(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

/**
 * Run an immediate invite pass — used by /alpha/leave and vault-delete
 * paths so a freed slot is reassigned without waiting up to 60s for the
 * next regular tick. Safe to call when the gate is OFF (no-op) or when
 * a regular tick is in flight (returns immediately).
 */
export async function processQueueTick(): Promise<void> {
  if (!isAlphaGateEnabled()) return;
  if (tickInFlight) return;
  await phaseInvite();
}

// === Tick orchestration ===

async function tick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  const startedAt = Date.now();
  try {
    traceSync('alpha-cron.heartbeat', phaseHeartbeat, { threshold: 50 });
    await traceAsync('alpha-cron.warn', phaseWarn, { threshold: 200 });
    await traceAsync('alpha-cron.expire', phaseExpire, { threshold: 200 });
    await traceAsync('alpha-cron.invite', phaseInvite, { threshold: 200 });
    await traceAsync('alpha-cron.invite-expire', phaseInviteExpire, { threshold: 200 });
  } catch (err) {
    console.error('[alpha-cron] tick error:', (err as Error).message);
  } finally {
    tickInFlight = false;
    const took = Date.now() - startedAt;
    if (took > 1_000) {
      console.warn(`[alpha-cron] slow tick took ${took}ms`);
    }
  }
}

// === Phase 1: heartbeat ===

function phaseHeartbeat(): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO cron_status (name, last_run) VALUES ('alpha-tick', ?)
       ON CONFLICT(name) DO UPDATE SET last_run = excluded.last_run`,
    )
    .run(now);
}

// === Phase 2: T-6h warning ===

interface ExpiringAgentRow {
  agent_address: string;
  wallet_address: string;
  expires_at: number;
}

async function phaseWarn(): Promise<void> {
  const now = Date.now();
  const { pausedAgents } = loadTimerPauseKeys();
  // Window: now + WARN_LEAD_MS >= expires_at > now
  // i.e. an agent expiring within the next 6h that hasn't been warned yet.
  // Paused agents are skipped: their `expires_at` is already NULL via the
  // pause helper, but the explicit guard prevents an out-of-band SQL update
  // from leaking a warning during a maintenance freeze.
  const rows = (getDb()
    .prepare(
      `SELECT agent_address, wallet_address, expires_at
         FROM agent_keys
        WHERE deleted_at IS NULL
          AND slot_exempt = 0
          AND paused_at IS NULL
          AND expires_at IS NOT NULL
          AND expires_at > ?
          AND expires_at - ? <= ?
          AND warned_at IS NULL`,
    )
    .all(now, now, WARN_LEAD_MS) as ExpiringAgentRow[])
    .filter((r) => !pausedAgents.has(r.agent_address));
  if (rows.length === 0) return;

  // Mark warned_at first so a slow Telegram fan-out doesn't double-fire on
  // the next tick if it overruns the interval.
  const update = getDb().prepare(
    `UPDATE agent_keys SET warned_at = ? WHERE agent_address = ?`,
  );
  const tx = getDb().transaction((batch: ExpiringAgentRow[]) => {
    for (const r of batch) update.run(now, r.agent_address);
  });
  tx(rows);

  await Promise.allSettled(
    rows.map((r) => {
      const expiresAtIso = new Date(r.expires_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
      const html =
        `⏰ <b>Alpha session ends in ~6 hours.</b>\n` +
        `Your Nasun AI agent will auto-pause at <code>${expiresAtIso}</code>. ` +
        `Withdraw via Deactivate if needed before then.`;
      return pushUserMessage(r.wallet_address, html);
    }),
  );
}

// === Phase 3: T+36h expiry ===

interface ExpiredAgentRow {
  agent_address: string;
  wallet_address: string;
  pm2_name: string;
}

async function phaseExpire(): Promise<void> {
  const now = Date.now();
  const { pausedAgents } = loadTimerPauseKeys();
  const rows = (getDb()
    .prepare(
      `SELECT agent_address, wallet_address, pm2_name
         FROM agent_keys
        WHERE deleted_at IS NULL
          AND slot_exempt = 0
          AND paused_at IS NULL
          AND expires_at IS NOT NULL
          AND expires_at < ?`,
    )
    .all(now) as ExpiredAgentRow[])
    .filter((r) => !pausedAgents.has(r.agent_address));
  if (rows.length === 0) return;

  // Sync SQL first: drop endpoints + flag paused_at. This frees the cap
  // slot in `countActiveAgents` immediately, so a fresh invite later in
  // this same tick can see the new headroom.
  const tx = getDb().transaction((batch: ExpiredAgentRow[]) => {
    const dropEndpoint = getDb().prepare(
      `DELETE FROM baram_agent_endpoints WHERE agent = ?`,
    );
    const pause = getDb().prepare(
      `UPDATE agent_keys SET paused_at = ? WHERE agent_address = ?`,
    );
    for (const r of batch) {
      dropEndpoint.run(r.agent_address);
      pause.run(now, r.agent_address);
    }
  });
  tx(rows);

  // Best-effort fan-out off the transaction. pm2 delete failures leave an
  // orphan process — operator can clean it up; the cap is already freed
  // because the endpoint row is gone (heartbeat lookup misses).
  await Promise.allSettled(
    rows.flatMap((r) => [
      stopAgentPm2(r.pm2_name).catch((err) => {
        console.warn(`[alpha-cron] pm2 delete failed for ${r.pm2_name}: ${(err as Error).message}`);
      }),
      pushUserMessage(
        r.wallet_address,
        `⏸ <b>Alpha session ended.</b>\n` +
        `Your agent is paused. Funds and SSM key are preserved — open the app ` +
        `and tap Deactivate any time to withdraw.`,
      ),
    ]),
  );

  // Persist the post-delete process list so the next chat-server / EC2
  // restart does not resurrect the just-expired agents from a stale
  // dump.pm2. The drift poll's alphaPaused check is the durable backstop
  // when this fails, so a save error is logged but not fatal to the tick.
  await pm2Save().catch((err) => {
    console.warn(`[alpha-cron] pm2 save failed after expiry batch: ${(err as Error).message}`);
  });
}

// === Phase 4: invite from queue ===

interface QueueHeadRow {
  wallet_address: string;
}

async function phaseInvite(): Promise<void> {
  const now = Date.now();
  const cap = getSystemCap();
  const free = Math.max(0, cap - countActiveAndPending());
  if (free === 0) return;

  const heads = getDb()
    .prepare(
      `SELECT wallet_address FROM alpha_waitlist
        WHERE status = 'waiting'
        ORDER BY joined_at ASC
        LIMIT ?`,
    )
    .all(free) as QueueHeadRow[];
  if (heads.length === 0) return;

  const inviteExpiresAt = now + getClaimWindowMs();
  const update = getDb().prepare(
    `UPDATE alpha_waitlist
        SET status = 'invited', invited_at = ?, invite_expires_at = ?
      WHERE wallet_address = ? AND status = 'waiting'`,
  );
  const tx = getDb().transaction((batch: QueueHeadRow[]) => {
    for (const r of batch) update.run(now, inviteExpiresAt, r.wallet_address);
  });
  tx(heads);

  await Promise.allSettled(
    heads.map((r) =>
      pushUserMessage(
        r.wallet_address,
        `🎟 <b>Your Nasun AI alpha slot is ready.</b>\n` +
        `Activate within 6 hours: <a href="https://nasun.io/my-account?tab=ai">nasun.io</a>\n` +
        `If you miss this window, you'll go back in queue once.`,
      ),
    ),
  );
}

// "Active and pending" view: counts paused/exempt out (matches countActiveAgents)
// AND adds rows in 'invited' status so a freshly issued invite doesn't get
// re-issued on the next tick before the user can claim it. We do NOT subtract
// `pendingSlots` (alpha-guards in-memory): the SSM-in-flight race window is
// short (seconds) and the cron only runs once per minute — racing the cron
// with a vault-upload that just decremented pendingSlots would only cause one
// extra invite at worst, and the per-wallet cap + Genesis Pass requirement
// makes such a user benign.
function countActiveAndPending(): number {
  const a = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM agent_keys
        WHERE deleted_at IS NULL AND slot_exempt = 0 AND paused_at IS NULL`,
    )
    .get() as { n: number };
  const i = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM alpha_waitlist
        WHERE status = 'invited'`,
    )
    .get() as { n: number };
  return (a?.n ?? 0) + (i?.n ?? 0);
}

// === Phase 5: invite expiry (claim window elapsed) ===

interface ExpiredInviteRow {
  wallet_address: string;
  miss_count: number;
}

async function phaseInviteExpire(): Promise<void> {
  const now = Date.now();
  const { pausedInvites } = loadTimerPauseKeys();
  const rows = (getDb()
    .prepare(
      `SELECT wallet_address, miss_count FROM alpha_waitlist
        WHERE status = 'invited'
          AND invite_expires_at IS NOT NULL
          AND invite_expires_at < ?`,
    )
    .all(now) as ExpiredInviteRow[])
    .filter((r) => !pausedInvites.has(r.wallet_address));
  if (rows.length === 0) return;

  // miss_count = 0 → first miss: re-queue at tail (new joined_at).
  // miss_count >= 1 → second miss: mark expired, kept around so user
  // can see the state in /status and explicitly re-join.
  const reQueueStmt = getDb().prepare(
    `UPDATE alpha_waitlist
        SET status = 'waiting',
            miss_count = miss_count + 1,
            invited_at = NULL,
            invite_expires_at = NULL,
            joined_at = ?
      WHERE wallet_address = ?`,
  );
  const expireStmt = getDb().prepare(
    `UPDATE alpha_waitlist
        SET status = 'expired',
            miss_count = miss_count + 1,
            invited_at = NULL,
            invite_expires_at = NULL
      WHERE wallet_address = ?`,
  );

  const requeued: string[] = [];
  const expired: string[] = [];
  const tx = getDb().transaction((batch: ExpiredInviteRow[]) => {
    for (const r of batch) {
      if (r.miss_count >= 1) {
        expireStmt.run(r.wallet_address);
        expired.push(r.wallet_address);
      } else {
        reQueueStmt.run(now, r.wallet_address);
        requeued.push(r.wallet_address);
      }
    }
  });
  tx(rows);

  await Promise.allSettled([
    ...requeued.map((w) =>
      pushUserMessage(
        w,
        `↪ <b>Invite expired.</b>\n` +
        `You're back in queue. One more miss = manual re-join required.`,
      ),
    ),
    ...expired.map((w) =>
      pushUserMessage(
        w,
        `⏹ <b>Alpha invite expired.</b>\n` +
        `You missed two slot windows. Visit your Dashboard to re-join the queue.`,
      ),
    ),
  ]);
}

// === Test seam ===
export const __testing__ = {
  tick,
  phaseHeartbeat,
  phaseWarn,
  phaseExpire,
  phaseInvite,
  phaseInviteExpire,
  countActiveAndPending,
  TICK_INTERVAL_MS,
  WARN_LEAD_MS,
};
