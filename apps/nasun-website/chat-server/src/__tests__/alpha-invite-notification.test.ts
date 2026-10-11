/**
 * An invite only counts as a chance if the user was told about it.
 *
 * Invites are announced over Telegram, and a waitlisted wallet has no
 * Telegram binding unless it opted in. Until 2026-10-11 phaseInvite threw
 * away pushUserMessage's delivery result, so an invite nobody could see
 * expired exactly like one that was ignored: two such windows and the wallet
 * reached terminal 'expired', needing a manual re-join that nothing prompts.
 * By 2026-10-11 that had happened to 133 of 136 waitlisted wallets, leaving
 * queue_depth 0 with every slot free and no agent running.
 *
 * These tests pin both directions: a delivered invite still costs a strike
 * and still terminates on the second miss, and an undelivered one never
 * does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pushUserMessage = vi.hoisted(() => vi.fn());
vi.mock('../baram-telegram.js', () => ({ pushUserMessage }));
vi.mock('../agent-orchestrator.js', () => ({
  stopAgentPm2: vi.fn().mockResolvedValue(undefined),
  pm2Save: vi.fn().mockResolvedValue(undefined),
}));

import { initStore, closeStore, getDb } from '../store.js';
import { DEFAULT_CONFIG, type ChatServerConfig } from '../types.js';
import { __testing__, ensureAlphaNotifiedColumn } from '../alpha-cron.js';
import { ensureTimerPauseSchema } from '../alpha-timer-pause.js';
import { ensureAlphaTgBindingSchema } from '../alpha-tg-link.js';

const { phaseInvite, phaseInviteExpire } = __testing__;

const WALLET = '0x' + 'a'.repeat(64);
const WALLET_B = '0x' + 'b'.repeat(64);

let config: ChatServerConfig;
let originalGate: string | undefined;

function makeConfig(): ChatServerConfig {
  const dir = mkdtempSync(join(tmpdir(), 'alpha-invite-test-'));
  return {
    ...DEFAULT_CONFIG,
    port: 0,
    dbPath: join(dir, 'test.db'),
    allowedOrigins: ['http://localhost:5174'],
  };
}

function createWaitlistTable(): void {
  // Production's schema came from scripts/alpha-migration.sql, applied by
  // hand; nothing in the repo creates it at runtime. Mirror the parts the
  // cron reads, then run the real idempotent ALTER on top.
  const db = getDb();
  const cols = new Set(
    (db.prepare('PRAGMA table_info(agent_keys)').all() as Array<{ name: string }>)
      .map((c) => c.name),
  );
  if (!cols.has('expires_at')) db.exec('ALTER TABLE agent_keys ADD COLUMN expires_at INTEGER');
  if (!cols.has('slot_exempt'))
    db.exec('ALTER TABLE agent_keys ADD COLUMN slot_exempt INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('warned_at')) db.exec('ALTER TABLE agent_keys ADD COLUMN warned_at INTEGER');
  if (!cols.has('paused_at')) db.exec('ALTER TABLE agent_keys ADD COLUMN paused_at INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS alpha_waitlist (
      wallet_address    TEXT PRIMARY KEY,
      joined_at         INTEGER NOT NULL,
      status            TEXT    NOT NULL CHECK(status IN ('waiting','invited','expired')),
      invited_at        INTEGER,
      invite_expires_at INTEGER,
      miss_count        INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL
    );
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS cron_status (
    name TEXT PRIMARY KEY, last_run INTEGER NOT NULL);`);
  ensureAlphaNotifiedColumn();
  // phaseInviteExpire consults the per-wallet invite-pause table.
  ensureTimerPauseSchema();
}

/**
 * Give the wallet an alpha Telegram binding, which is what canNotify reads.
 *
 * Uses the production schema helper rather than a hand-rolled table: a
 * fixture that omitted `link_token` made ensureAlphaTgBindingSchema's index
 * creation throw, getAlphaTgUserId swallow it, and every wallet read as
 * unreachable.
 */
function bindTelegram(wallet: string, tgUserId = '12345'): void {
  ensureAlphaTgBindingSchema();
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO alpha_tg_binding
         (wallet_address, tg_user_id, bound_at, created_at) VALUES (?, ?, ?, ?)`,
    )
    .run(wallet.toLowerCase(), tgUserId, Date.now(), Date.now());
}

/** Drop the binding, as a user unlinking Telegram would. */
function unbindTelegram(wallet: string): void {
  getDb()
    .prepare('DELETE FROM alpha_tg_binding WHERE wallet_address = ?')
    .run(wallet.toLowerCase());
}

function seedWaiting(wallet: string, joinedAt = Date.now()): void {
  getDb()
    .prepare(
      `INSERT INTO alpha_waitlist
         (wallet_address, joined_at, status, miss_count, created_at)
       VALUES (?, ?, 'waiting', 0, ?)`,
    )
    .run(wallet.toLowerCase(), joinedAt, joinedAt);
}

function row(wallet: string) {
  return getDb()
    .prepare('SELECT * FROM alpha_waitlist WHERE wallet_address = ?')
    .get(wallet.toLowerCase()) as {
      status: string;
      miss_count: number;
      notified_at: number | null;
      invite_expires_at: number | null;
    };
}

/** Make the wallet's live invite look like its claim window has elapsed. */
function lapseInvite(wallet: string): void {
  getDb()
    .prepare('UPDATE alpha_waitlist SET invite_expires_at = ? WHERE wallet_address = ?')
    .run(Date.now() - 1_000, wallet.toLowerCase());
}

beforeEach(() => {
  pushUserMessage.mockReset();
  config = makeConfig();
  initStore(config);
  createWaitlistTable();
  originalGate = process.env.ALPHA_GATE_ENABLED;
  process.env.ALPHA_GATE_ENABLED = 'true';
  delete process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
});

afterEach(() => {
  closeStore();
  try {
    rmSync(config.dbPath, { force: true });
    rmSync(config.dbPath + '-wal', { force: true });
    rmSync(config.dbPath + '-shm', { force: true });
  } catch { /* ignore */ }
  if (originalGate === undefined) delete process.env.ALPHA_GATE_ENABLED;
  else process.env.ALPHA_GATE_ENABLED = originalGate;
});

describe('phaseInvite delivery recording', () => {
  it('stamps notified_at when the DM landed', async () => {
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET);

    await phaseInvite();

    const r = row(WALLET);
    expect(r.status).toBe('invited');
    expect(r.notified_at).not.toBeNull();
  });

  it('leaves notified_at null when there is no channel to the user', async () => {
    // pushUserMessage returns false when the wallet has neither a live agent
    // session nor an alpha Telegram binding.
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET);

    await phaseInvite();

    const r = row(WALLET);
    expect(r.status).toBe('invited');
    expect(r.notified_at).toBeNull();
  });

  it('treats a thrown send as undelivered', async () => {
    pushUserMessage.mockRejectedValue(new Error('telegram 500'));
    seedWaiting(WALLET);

    await phaseInvite();

    expect(row(WALLET).notified_at).toBeNull();
  });
});

describe('phaseInviteExpire', () => {
  it('does not count a miss for an invite that was never delivered', async () => {
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET);
    await phaseInvite();
    lapseInvite(WALLET);

    await phaseInviteExpire();

    const r = row(WALLET);
    expect(r.status).toBe('waiting');
    expect(r.miss_count).toBe(0);
    expect(r.notified_at).toBeNull();
  });

  it('never terminally expires a wallet it cannot reach, however many cycles', async () => {
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET);

    for (let i = 0; i < 5; i += 1) {
      await phaseInvite();
      lapseInvite(WALLET);
      await phaseInviteExpire();
    }

    const r = row(WALLET);
    expect(r.status).toBe('waiting');
    expect(r.miss_count).toBe(0);
  });

  it('still charges a strike when the DM did land', async () => {
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET);
    await phaseInvite();
    lapseInvite(WALLET);

    await phaseInviteExpire();

    const r = row(WALLET);
    expect(r.status).toBe('waiting');
    expect(r.miss_count).toBe(1);
    // Cleared so the next invite is judged on its own delivery.
    expect(r.notified_at).toBeNull();
  });

  it('still terminally expires after two delivered invites are ignored', async () => {
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET);

    await phaseInvite();
    lapseInvite(WALLET);
    await phaseInviteExpire();
    await phaseInvite();
    lapseInvite(WALLET);
    await phaseInviteExpire();

    const r = row(WALLET);
    expect(r.status).toBe('expired');
    expect(r.miss_count).toBe(2);
  });

  it('judges each wallet on its own delivery in a mixed batch', async () => {
    pushUserMessage.mockImplementation((wallet: string) =>
      Promise.resolve(wallet.toLowerCase() === WALLET.toLowerCase()),
    );
    seedWaiting(WALLET, Date.now() - 2_000);
    seedWaiting(WALLET_B, Date.now() - 1_000);

    await phaseInvite();
    lapseInvite(WALLET);
    lapseInvite(WALLET_B);
    await phaseInviteExpire();

    expect(row(WALLET).miss_count).toBe(1);
    expect(row(WALLET_B).miss_count).toBe(0);
    expect(row(WALLET).status).toBe('waiting');
    expect(row(WALLET_B).status).toBe('waiting');
  });

  it('sends no DM to the wallet it could not reach', async () => {
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET);
    await phaseInvite();
    lapseInvite(WALLET);
    pushUserMessage.mockClear();

    await phaseInviteExpire();

    // There is no channel by definition; a second doomed send would only add
    // noise to the logs.
    expect(pushUserMessage).not.toHaveBeenCalled();
  });
});

describe('ensureAlphaNotifiedColumn', () => {
  it('is idempotent', () => {
    expect(() => {
      ensureAlphaNotifiedColumn();
      ensureAlphaNotifiedColumn();
    }).not.toThrow();
  });

  it('does not throw when the table does not exist', () => {
    getDb().exec('DROP TABLE alpha_waitlist');
    expect(() => ensureAlphaNotifiedColumn()).not.toThrow();
  });
});

describe('invite selection', () => {
  it('passes over a wallet it cannot notify in favour of a reachable one', async () => {
    // An 'invited' row holds a cap slot for the whole claim window, so an
    // invite spent on an unreachable wallet is a slot a reachable user cannot
    // have. WALLET joined first but has no channel.
    process.env.NASUN_AI_ALPHA_SYSTEM_CAP = '1';
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET, Date.now() - 5_000);
    seedWaiting(WALLET_B, Date.now() - 1_000);
    bindTelegram(WALLET_B);

    await phaseInvite();

    expect(row(WALLET_B).status).toBe('invited');
    expect(row(WALLET).status).toBe('waiting');
    delete process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
  });

  it('still invites unreachable wallets when no reachable waiter is left', async () => {
    // Otherwise a queue of only-unreachable wallets would leave every slot
    // idle forever, which is how the alpha drained to zero in the first place.
    process.env.NASUN_AI_ALPHA_SYSTEM_CAP = '1';
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET);

    await phaseInvite();

    expect(row(WALLET).status).toBe('invited');
    expect(row(WALLET).notified_at).toBeNull();
    delete process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
  });

  it('keeps FIFO order within the reachable group', async () => {
    process.env.NASUN_AI_ALPHA_SYSTEM_CAP = '1';
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET, Date.now() - 5_000);
    seedWaiting(WALLET_B, Date.now() - 1_000);
    bindTelegram(WALLET);
    bindTelegram(WALLET_B);

    await phaseInvite();

    expect(row(WALLET).status).toBe('invited');
    expect(row(WALLET_B).status).toBe('waiting');
    delete process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
  });
});

describe('notified_at lifecycle', () => {
  it('clears a previous stamp when a new invite is issued', async () => {
    // Reachable wallet gets a delivered invite and lets it lapse (miss 1),
    // then unlinks Telegram. The stale stamp must not make the next, silent
    // invite look delivered and charge a second miss -- that is the original
    // bug.
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET);
    bindTelegram(WALLET);
    await phaseInvite();
    expect(row(WALLET).notified_at).not.toBeNull();
    lapseInvite(WALLET);
    await phaseInviteExpire();
    expect(row(WALLET).miss_count).toBe(1);

    unbindTelegram(WALLET);
    pushUserMessage.mockResolvedValue(false);
    await phaseInvite();

    expect(row(WALLET).notified_at).toBeNull();
    lapseInvite(WALLET);
    await phaseInviteExpire();

    // Second window could not be announced at all, so it costs nothing and
    // does not terminate the wallet.
    expect(row(WALLET).status).toBe('waiting');
    expect(row(WALLET).miss_count).toBe(1);
  });

  it('charges no strike even when the wallet holds a broken binding', async () => {
    // A binding whose sends fail (bot blocked, account deleted) is still a
    // window the user never saw. It costs no strike; rotation is what stops
    // it monopolising the slot.
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET);
    bindTelegram(WALLET);

    for (let i = 0; i < 3; i += 1) {
      await phaseInvite();
      lapseInvite(WALLET);
      await phaseInviteExpire();
    }

    expect(row(WALLET).status).toBe('waiting');
    expect(row(WALLET).miss_count).toBe(0);
  });

  it('charges no strike to a wallet that links Telegram mid-window', async () => {
    // The invite went out before the binding existed, so it provably never
    // arrived. Charging for it would terminally expire the users who just
    // fixed their channel.
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET);
    await phaseInvite();
    bindTelegram(WALLET);
    lapseInvite(WALLET);

    await phaseInviteExpire();

    expect(row(WALLET).miss_count).toBe(0);
    expect(row(WALLET).status).toBe('waiting');
  });

  it('rotates an un-notified wallet to the tail so the next waiter gets a turn', async () => {
    // Without the rotation the head of an unreachable cohort is re-invited
    // every window forever and everyone behind it starves.
    process.env.NASUN_AI_ALPHA_SYSTEM_CAP = '1';
    pushUserMessage.mockResolvedValue(false);
    seedWaiting(WALLET, Date.now() - 60_000);
    seedWaiting(WALLET_B, Date.now() - 30_000);

    await phaseInvite();
    expect(row(WALLET).status).toBe('invited');
    lapseInvite(WALLET);
    await phaseInviteExpire();

    // Second rotation must reach the wallet that has been waiting behind it.
    await phaseInvite();
    expect(row(WALLET_B).status).toBe('invited');
    expect(row(WALLET).status).toBe('waiting');
    delete process.env.NASUN_AI_ALPHA_SYSTEM_CAP;
  });

  it('clears the stamp carried through a terminal expiry and re-join', async () => {
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET);
    bindTelegram(WALLET);
    await phaseInvite();
    lapseInvite(WALLET);
    await phaseInviteExpire();
    await phaseInvite();
    lapseInvite(WALLET);
    await phaseInviteExpire();
    expect(row(WALLET).status).toBe('expired');

    // Mirror /alpha/join's ON CONFLICT, which does not touch notified_at.
    getDb()
      .prepare(
        `UPDATE alpha_waitlist SET status = 'waiting', miss_count = 0,
           invited_at = NULL, invite_expires_at = NULL, joined_at = ?
         WHERE wallet_address = ?`,
      )
      .run(Date.now(), WALLET.toLowerCase());

    pushUserMessage.mockResolvedValue(false);
    await phaseInvite();

    expect(row(WALLET).notified_at).toBeNull();
  });
});

describe('missing notified_at column', () => {
  it('re-adds the column instead of taking the tick down', async () => {
    // Both the promotion UPDATE and the stamp name notified_at. Throwing here
    // would abort the tick before phaseInviteExpire, so every outstanding
    // invite would hold its cap slot indefinitely.
    getDb().exec('ALTER TABLE alpha_waitlist DROP COLUMN notified_at');
    pushUserMessage.mockResolvedValue(true);
    seedWaiting(WALLET);

    await expect(phaseInvite()).resolves.toBeUndefined();

    expect(row(WALLET).status).toBe('invited');
    expect(row(WALLET).notified_at).not.toBeNull();
    // And the expiry phase that follows it in the tick still runs.
    lapseInvite(WALLET);
    await expect(phaseInviteExpire()).resolves.toBeUndefined();
    expect(row(WALLET).status).toBe('waiting');
  });
});
