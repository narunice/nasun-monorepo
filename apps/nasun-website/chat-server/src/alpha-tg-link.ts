// Nasun AI alpha · Telegram binding for waitlist users.
//
// Why this exists: invite / warn / expire notifications are sent via
// `pushUserMessage`, which resolves wallet -> tg_user_id from `baram_sessions`.
// A baram_session is only created when a user links an *active agent* to
// Telegram, so anyone still in the waitlist (i.e. not yet activated) has no
// session and silently receives no DM. Measured 2026-06-01: 95% of waiters
// were unreachable, and ~49% of invites were missed because the only way to
// learn about a slot was to happen to open the app inside the claim window.
//
// Telegram bots cannot initiate a DM — the user must /start the bot first.
// So we let a waitlist user opt in: the app mints a short-lived token bound
// to their (signature-verified) wallet, opens the deep link
// `https://t.me/<bot>?start=alpha_<token>`, and the bot's /start handler
// calls `bindAlphaTelegram` to persist wallet <-> tg_user_id. From then on
// `pushUserMessage` falls back to this table when no live session exists.

import { randomBytes } from 'node:crypto';
import { getDb } from './store.js';

const TOKEN_TTL_MS = 15 * 60 * 1000;
// 'alpha_' (6) + 48 hex chars = 54, under Telegram's 64-char start-param cap.
const TOKEN_PREFIX = 'alpha_';

// Memoized against the live DB *instance* rather than a plain boolean: the
// connection is a singleton in prod (ensured once), but tests swap it between
// runs — keying on the handle re-creates the table on a fresh DB without a
// test-only reset hook.
let ensuredForDb: unknown = null;

export function ensureAlphaTgBindingSchema(): void {
  const db = getDb();
  if (ensuredForDb === db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS alpha_tg_binding (
      wallet_address    TEXT PRIMARY KEY,
      tg_user_id        TEXT,
      link_token        TEXT,
      token_expires_at  INTEGER,
      bound_at          INTEGER,
      created_at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alpha_tg_binding_token ON alpha_tg_binding(link_token);
    CREATE INDEX IF NOT EXISTS idx_alpha_tg_binding_tg ON alpha_tg_binding(tg_user_id);
  `);
  ensuredForDb = db;
}

/**
 * Mint a fresh short-lived link token for `wallet` and return the value to
 * embed in the deep link. Idempotent per wallet: re-issuing overwrites the
 * previous token (PK is wallet_address) so an abandoned token can't be
 * claimed later. An already-bound wallet keeps its tg_user_id/bound_at — a
 * re-issued token simply lets the user rebind from a new Telegram account.
 */
export function issueLinkToken(walletAddress: string): { token: string; expiresAt: number } {
  ensureAlphaTgBindingSchema();
  const wallet = walletAddress.toLowerCase();
  const now = Date.now();
  const token = TOKEN_PREFIX + randomBytes(24).toString('hex');
  const expiresAt = now + TOKEN_TTL_MS;
  getDb()
    .prepare(
      `INSERT INTO alpha_tg_binding
         (wallet_address, tg_user_id, link_token, token_expires_at, bound_at, created_at)
       VALUES (?, NULL, ?, ?, NULL, ?)
       ON CONFLICT(wallet_address) DO UPDATE SET
         link_token = excluded.link_token,
         token_expires_at = excluded.token_expires_at`,
    )
    .run(wallet, token, expiresAt, now);
  return { token, expiresAt };
}

/**
 * Resolve a /start token to its wallet and bind the Telegram user. Enforces
 * one tg_user_id per wallet (mirrors `bindTelegramUser`): the same Telegram
 * account is detached from any other wallet binding before this one is set,
 * so a user switching wallets doesn't leave a stale dual mapping. Returns
 * `{ ok: false }` for unknown / expired tokens.
 */
export function bindAlphaTelegram(token: string, tgUserId: string): { ok: boolean; wallet?: string } {
  ensureAlphaTgBindingSchema();
  const db = getDb();
  const now = Date.now();

  const row = db
    .prepare(
      `SELECT wallet_address FROM alpha_tg_binding
        WHERE link_token = ? AND token_expires_at IS NOT NULL AND token_expires_at > ?`,
    )
    .get(token, now) as { wallet_address: string } | undefined;
  if (!row) return { ok: false };

  const wallet = row.wallet_address;
  const tx = db.transaction(() => {
    // Detach this Telegram account from any other wallet (one TG = one wallet).
    db.prepare(
      `UPDATE alpha_tg_binding SET tg_user_id = NULL, bound_at = NULL
        WHERE tg_user_id = ? AND wallet_address != ?`,
    ).run(tgUserId, wallet);
    // Bind + consume the token so it can't be replayed.
    db.prepare(
      `UPDATE alpha_tg_binding
          SET tg_user_id = ?, bound_at = ?, link_token = NULL, token_expires_at = NULL
        WHERE wallet_address = ?`,
    ).run(tgUserId, now, wallet);
  });
  tx();
  return { ok: true, wallet };
}

/**
 * Fallback resolver for `pushUserMessage` when no live baram_session exists.
 *
 * Throw-safe by contract: this runs inside the shared `pushUserMessage` path
 * (also used by the /push route and non-alpha cron flows) and the /alpha/status
 * read. Those callers previously could only ever observe "no delivery" (false);
 * they must not start throwing because the alpha lookup hit a missing table
 * (pre-migration) or a transient DB error. On any failure we degrade to null,
 * which collapses back to the exact pre-existing behavior. Mirrors the
 * defensive pattern in `hasLiveTgSession` / `computePerWallet`.
 */
export function getAlphaTgUserId(walletAddress: string): string | null {
  try {
    ensureAlphaTgBindingSchema();
    const row = getDb()
      .prepare(
        `SELECT tg_user_id FROM alpha_tg_binding
          WHERE wallet_address = ? AND tg_user_id IS NOT NULL`,
      )
      .get(walletAddress.toLowerCase()) as { tg_user_id: string } | undefined;
    return row?.tg_user_id ?? null;
  } catch {
    return null;
  }
}

/** True when this wallet has a usable Telegram binding (for /alpha/status). */
export function isAlphaTgBound(walletAddress: string): boolean {
  return getAlphaTgUserId(walletAddress) !== null;
}
