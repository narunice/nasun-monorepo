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
import { getAgentTtlMs, getClaimWindowMs, getSystemCap, isAlphaGateEnabled } from './alpha-guards.js';
import { pushUserMessage } from './baram-telegram.js';
import { stopAgentPm2, pm2Save } from './agent-orchestrator.js';
import { traceAsync, traceSync } from './perf-trace.js';
import { ensureTimerPauseSchema, loadTimerPauseKeys } from './alpha-timer-pause.js';
import { isAlphaTgBound } from './alpha-tg-link.js';

/**
 * Idempotent migration for `alpha_waitlist.notified_at`, repeated here as a
 * self-heal before the phases that write the column.
 *
 * The canonical copies are store.ts (store init, so every process gets it)
 * and scripts/alpha-migration.sql. This one exists because phaseInvite's
 * promotion UPDATE names the column: on a database that somehow lacks it the
 * phase would throw and take phaseInviteExpire down with it, leaving every
 * outstanding invite holding a cap slot.
 *
 * Why the column exists: an invite is only a real chance if the user was told
 * about it. Without this, a user we could not reach burned both of their
 * windows in silence and ended terminally 'expired'. By 2026-10-11 that had
 * happened to 133 of 136 waitlisted wallets, draining the queue to zero while
 * every slot sat free.
 */
export function ensureAlphaNotifiedColumn(): void {
  try {
    getDb().exec('ALTER TABLE alpha_waitlist ADD COLUMN notified_at INTEGER');
  } catch {
    /* column already present, or the table does not exist yet */
  }
}

/**
 * Could an invite DM actually reach this wallet?
 *
 * Mirrors pushUserMessage's two lookups (live agent session, then the alpha
 * waitlist Telegram binding) without sending anything, so phaseInvite can
 * decide who to spend a cap slot on. Fails closed: a wallet we cannot prove
 * reachable is treated as unreachable, which only costs it queue priority.
 */
function canNotify(walletAddress: string): boolean {
  const wallet = walletAddress.toLowerCase();
  try {
    const row = getDb()
      .prepare(
        `SELECT 1 FROM baram_sessions
          WHERE wallet = ? AND revoked_at IS NULL AND expires_at > ?
            AND tg_user_id IS NOT NULL
          LIMIT 1`,
      )
      .get(wallet, Date.now());
    if (row) return true;
  } catch {
    /* pre-migration DB without baram_sessions */
  }
  return isAlphaTgBound(wallet);
}

const TICK_INTERVAL_MS = 60_000;
const WARN_LEAD_MS = 6 * 60 * 60 * 1000;  // T-6h warning before agent session (TTL) expiry

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
  // Same reason, one tick earlier: phaseInvite stamps notified_at and
  // phaseInviteExpire reads it, so the column has to exist before the boot
  // tick below runs.
  ensureAlphaNotifiedColumn();
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

  const windowHours = Math.round(getAgentTtlMs() / 3_600_000);
  await Promise.allSettled(
    rows.map((r) => {
      const expiresAtIso = new Date(r.expires_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
      const html =
        `⏰ <b>~6 hours left in your alpha test window.</b>\n` +
        `Your ${windowHours}h turn ends at <code>${expiresAtIso}</code> and the agent will pause. ` +
        `You will go back in the waitlist and can resume the same agent when your ` +
        `turn comes around again, so no action is needed. ` +
        `Want to exit and withdraw instead? Tap Deactivate before then.`;
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

  // Sync SQL first: drop endpoints + flag paused_at + re-queue. This frees
  // the cap slot in `countActiveAgents` immediately, so a fresh invite later
  // in this same tick can see the new headroom.
  //
  // Re-queue: a 24h test window is one turn. When it ends the tester goes to
  // the BACK of the waitlist (fresh joined_at) and waits for their turn to
  // come around again, at which point they resume the SAME paused agent
  // (funds + vault key preserved) via /vault/agent/:addr/resume. Without this
  // UPSERT the paused wallet had no waitlist row at all — a dead end.
  const tx = getDb().transaction((batch: ExpiredAgentRow[]) => {
    const dropEndpoint = getDb().prepare(
      `DELETE FROM baram_agent_endpoints WHERE agent = ?`,
    );
    const pause = getDb().prepare(
      `UPDATE agent_keys SET paused_at = ? WHERE agent_address = ?`,
    );
    const requeue = getDb().prepare(
      `INSERT INTO alpha_waitlist
         (wallet_address, joined_at, status, invited_at, invite_expires_at, miss_count, created_at)
       VALUES (?, ?, 'waiting', NULL, NULL, 0, ?)
       ON CONFLICT(wallet_address) DO UPDATE SET
         status = 'waiting', joined_at = excluded.joined_at,
         invited_at = NULL, invite_expires_at = NULL, miss_count = 0`,
    );
    for (const r of batch) {
      dropEndpoint.run(r.agent_address);
      pause.run(now, r.agent_address);
      requeue.run(r.wallet_address, now, now);
    }
  });
  tx(rows);

  // Best-effort fan-out off the transaction. pm2 delete failures leave an
  // orphan process — operator can clean it up; the cap is already freed
  // because the endpoint row is gone (heartbeat lookup misses).
  const windowHours = Math.round(getAgentTtlMs() / 3_600_000);
  await Promise.allSettled(
    rows.flatMap((r) => [
      stopAgentPm2(r.pm2_name).catch((err) => {
        console.warn(`[alpha-cron] pm2 delete failed for ${r.pm2_name}: ${(err as Error).message}`);
      }),
      pushUserMessage(
        r.wallet_address,
        `⏸ <b>Your alpha test window has ended.</b>\n` +
        `This is normal: each turn lasts ${windowHours}h. You are now back in the waitlist. ` +
        `Your funds and agent are preserved, so when your turn comes around again ` +
        `you can resume the same agent in one tap. We will notify you here and in the app. ` +
        `Prefer to exit now and withdraw? Open the app and tap Deactivate.`,
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
  // Self-heal before any statement that names notified_at. Both the promotion
  // UPDATE and the stamp reference it, so on a database that never got the
  // column this phase would throw and take phaseInviteExpire down with it --
  // leaving every outstanding invite holding a cap slot indefinitely.
  ensureAlphaNotifiedColumn();
  const now = Date.now();
  const cap = getSystemCap();
  const free = Math.max(0, cap - countActiveAndPending());
  if (free === 0) return;

  // Whole queue in FIFO order, not just the first `free` rows: the choice
  // below needs to see past unreachable waiters.
  const queue = getDb()
    .prepare(
      `SELECT wallet_address FROM alpha_waitlist
        WHERE status = 'waiting'
        ORDER BY joined_at ASC`,
    )
    .all() as QueueHeadRow[];
  if (queue.length === 0) return;

  // An 'invited' row holds a cap slot for the whole claim window, so spending
  // invites on wallets we cannot notify starves the ones we can -- and with
  // 133 of 136 wallets unreachable on 2026-10-11 that is the normal case, not
  // the edge case. Reachable waiters go first, in queue order.
  //
  // Fairness note: this reorders the queue, it does not drop anyone. An
  // unreachable waiter keeps its place among unreachable waiters and is still
  // invited once no reachable waiter is left, so an all-unreachable queue
  // still gets served rather than leaving slots idle forever.
  const reachable: QueueHeadRow[] = [];
  const unreachable: QueueHeadRow[] = [];
  for (const r of queue) {
    (canNotify(r.wallet_address) ? reachable : unreachable).push(r);
  }
  const heads = [...reachable, ...unreachable].slice(0, free);
  // Only count the ones that actually lost their turn. When `free` covers the
  // whole queue nobody is passed over, and warning anyway would put a
  // standing false positive on the channel meant to signal that Telegram
  // opt-in is not landing.
  const invited = new Set(heads.map((r) => r.wallet_address));
  const passedOver = unreachable.filter((r) => !invited.has(r.wallet_address)).length;
  if (passedOver > 0) {
    console.warn(
      `[alpha-cron] ${passedOver} waiting wallet(s) with no notification channel ` +
      `were passed over in favour of reachable ones`,
    );
  }

  const inviteExpiresAt = now + getClaimWindowMs();
  // notified_at is reset on every promotion from the queue. Clearing it only
  // on the re-queue paths left a stamp from an earlier cycle able to make a
  // later undelivered invite look delivered (reachable via terminal expire ->
  // /alpha/join, or via phaseExpire's agent-TTL requeue), which would charge a
  // miss for a message nobody received. grantKillRecoveryInvite in
  // alpha-guards.ts is the other way into 'invited' and clears it too.
  const update = getDb().prepare(
    `UPDATE alpha_waitlist
        SET status = 'invited', invited_at = ?, invite_expires_at = ?,
            notified_at = NULL
      WHERE wallet_address = ? AND status = 'waiting'`,
  );
  const tx = getDb().transaction((batch: QueueHeadRow[]) => {
    for (const r of batch) update.run(now, inviteExpiresAt, r.wallet_address);
  });
  tx(heads);

  // Returning testers have a paused agent waiting to resume; first-timers run
  // the setup wizard. Branch the DM so the CTA matches what they will do.
  const hasPausedAgent = getDb().prepare(
    `SELECT 1 FROM agent_keys
      WHERE wallet_address = ? AND deleted_at IS NULL
        AND slot_exempt = 0 AND paused_at IS NOT NULL
      LIMIT 1`,
  );
  // Prepared BEFORE any DM goes out. On a database whose notified_at column is
  // missing this throws, and throwing after the sends would abort the tick
  // mid-phase: phaseInviteExpire would never run, so every invite would hold
  // its cap slot forever. Failing here instead means no DM is wasted, and a
  // null statement makes every invite count as undelivered, which is the
  // forgiving side.
  // Narrow structural type: better-sqlite3's generic Statement types `run`
  // with a single bind argument, which this two-parameter call does not fit.
  let stampNotified: { run: (notifiedAt: number, wallet: string) => unknown } | null = null;
  try {
    stampNotified = getDb().prepare(
      `UPDATE alpha_waitlist SET notified_at = ?
        WHERE wallet_address = ? AND status = 'invited'`,
    );
  } catch (err) {
    console.warn(
      `[alpha-cron] notified_at column unavailable, treating invites as ` +
      `undelivered: ${(err as Error).message}`,
    );
  }

  // pushUserMessage reports whether it actually reached the user, and that
  // answer decides whether a missed window counts against them later. Before
  // 2026-10-11 the result was discarded, so an invite nobody could see was
  // indistinguishable from one they ignored.
  const results = await Promise.allSettled(
    heads.map((r) => {
      const returning = !!hasPausedAgent.get(r.wallet_address);
      const html = returning
        ? `🎟 <b>Your turn is back.</b>\n` +
          `Resume your agent: <a href="https://nasun.io/my-account?tab=ai">nasun.io</a>\n` +
          `Your funds and agent are preserved, so this is a one-tap resume. If you miss the claim window, you'll go back in queue once.`
        : `🎟 <b>Your Nasun AI alpha slot is ready.</b>\n` +
          `Activate now: <a href="https://nasun.io/my-account?tab=ai">nasun.io</a>\n` +
          `Complete the setup wizard while your slot is reserved. If you miss the claim window, you'll go back in queue once.`;
      return pushUserMessage(r.wallet_address, html);
    }),
  );

  const undelivered: string[] = [];
  const stampTx = getDb().transaction(() => {
    results.forEach((res, i) => {
      const wallet = heads[i].wallet_address;
      if (res.status === 'fulfilled' && res.value === true && stampNotified) {
        stampNotified.run(Date.now(), wallet);
      } else {
        undelivered.push(wallet);
      }
    });
  });
  try {
    stampTx();
  } catch (err) {
    // A failed stamp reads as "not notified", which is the forgiving side.
    console.warn(`[alpha-cron] notified_at stamp failed: ${(err as Error).message}`);
  }
  if (undelivered.length > 0) {
    // Visible on purpose: invites spent on windows nobody can see mean the
    // only notification channel (Telegram opt-in) is not landing.
    console.warn(
      `[alpha-cron] invite DM did not reach ${undelivered.length} wallet(s): ` +
      `${undelivered.map((w) => w.slice(0, 10)).join(', ')}`,
    );
  }
}

// "Active and pending" view: counts paused/exempt out (matches countActiveAgents)
// AND adds rows in 'invited' status so a freshly issued invite doesn't get
// re-issued on the next tick before the user can claim it. We do NOT subtract
// `pendingSlots` (alpha-guards in-memory): the vault-write race window is
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
  notified_at: number | null;
}

async function phaseInviteExpire(): Promise<void> {
  const now = Date.now();
  const { pausedInvites } = loadTimerPauseKeys();
  const rows = (getDb()
    .prepare(
      `SELECT wallet_address, miss_count, notified_at FROM alpha_waitlist
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
            notified_at = NULL,
            joined_at = ?
      WHERE wallet_address = ?`,
  );
  // Un-notified invite: back to the queue with the miss NOT counted. Charging
  // a strike for a message we never delivered is what emptied the queue --
  // 133 of 136 wallets reached terminal 'expired' this way while every slot
  // sat free. notified_at is cleared so the next invite is judged on its own
  // delivery.
  // joined_at moves to the tail even though no strike is charged. Without the
  // rotation the head of an unreachable cohort would be re-invited every
  // window forever and everyone behind it would starve (cap 1 with 10 unbound
  // waiters: #1 cycles, #2..#10 never get a turn). Rotation and punishment are
  // separate levers: this path uses only the first.
  const reQueueUnnotifiedStmt = getDb().prepare(
    `UPDATE alpha_waitlist
        SET status = 'waiting',
            invited_at = NULL,
            invite_expires_at = NULL,
            notified_at = NULL,
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
  const unnotified: string[] = [];
  const tx = getDb().transaction((batch: ExpiredInviteRow[]) => {
    for (const r of batch) {
      // A window we could not announce never costs a strike, whatever the
      // reason the DM did not land. Rotation, not punishment, is what keeps
      // the queue moving: the wallet goes to the tail (see
      // reQueueUnnotifiedStmt) so the next waiter gets the slot, and a wallet
      // whose channel is merely broken costs the alpha one claim window per
      // full rotation instead of holding a slot forever.
      //
      // Deliberately NOT re-checking canNotify here: a user who links
      // Telegram during the claim window would otherwise be charged for an
      // invite that provably never reached them, terminally expiring exactly
      // the people who just fixed their channel.
      if (r.notified_at === null) {
        reQueueUnnotifiedStmt.run(now, r.wallet_address);
        unnotified.push(r.wallet_address);
      } else if (r.miss_count >= 1) {
        expireStmt.run(r.wallet_address);
        expired.push(r.wallet_address);
      } else {
        reQueueStmt.run(now, r.wallet_address);
        requeued.push(r.wallet_address);
      }
    }
  });
  tx(rows);

  if (unnotified.length > 0) {
    console.warn(
      `[alpha-cron] ${unnotified.length} invite(s) lapsed un-notified; re-queued ` +
      `without counting a miss: ${unnotified.map((w) => w.slice(0, 10)).join(', ')}`,
    );
  }

  // No DM for the un-notified group: by definition we have no channel to
  // them. They keep their place in the queue instead.
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
