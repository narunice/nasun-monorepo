/**
 * Baram daily message cap (Plan D §D-6 §A6).
 *
 * Counts cognition wake-forward requests per wallet per UTC day. Reset is
 * implicit: a new (wallet, date) primary key on the first request of the day.
 *
 * Default cap: 50/day. Override via env BARAM_DAILY_MESSAGE_CAP.
 *
 * The reservation is atomic: a single INSERT...ON CONFLICT DO UPDATE that
 * either inserts a fresh row at count=1, or increments only when below the
 * cap. RETURNING tells us the post-increment count; we infer rejection from
 * the absence of a returned row.
 */

import { getDb } from './store.js';

const DEFAULT_CAP = 50;

function getDailyCap(): number {
  const raw = process.env.BARAM_DAILY_MESSAGE_CAP;
  if (!raw) return DEFAULT_CAP;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP;
}

function utcDateString(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10); // YYYY-MM-DD
}

export interface CapReservation {
  ok: boolean;
  used: number;
  cap: number;
  date: string;
}

/**
 * Atomically reserve one cognition slot for this wallet today.
 *
 * On success: returns `{ ok: true, used, cap }` where `used` is the new count
 * (including this reservation).
 * On rejection (cap hit): returns `{ ok: false, used: cap, cap }`.
 */
export function reserveCognitionSlot(wallet: string, nowMs: number = Date.now()): CapReservation {
  const cap = getDailyCap();
  const date = utcDateString(nowMs);
  const normWallet = wallet.toLowerCase();

  const row = getDb()
    .prepare(
      `INSERT INTO baram_message_caps (wallet, date, cognition_count)
       VALUES (?, ?, 1)
       ON CONFLICT (wallet, date) DO UPDATE
         SET cognition_count = cognition_count + 1
         WHERE cognition_count < ?
       RETURNING cognition_count`,
    )
    .get(normWallet, date, cap) as { cognition_count: number } | undefined;

  if (!row) {
    return { ok: false, used: cap, cap, date };
  }
  return { ok: true, used: row.cognition_count, cap, date };
}

/**
 * Peek today's usage without reserving. Useful for diagnostics or UI.
 */
export function getCognitionUsage(wallet: string, nowMs: number = Date.now()): { used: number; cap: number; date: string } {
  const cap = getDailyCap();
  const date = utcDateString(nowMs);
  const row = getDb()
    .prepare(`SELECT cognition_count FROM baram_message_caps WHERE wallet = ? AND date = ?`)
    .get(wallet.toLowerCase(), date) as { cognition_count: number } | undefined;
  return { used: row?.cognition_count ?? 0, cap, date };
}

/** Test-only helper to reset usage for a wallet. */
export function __resetCapsForTest(wallet: string): void {
  getDb().prepare(`DELETE FROM baram_message_caps WHERE wallet = ?`).run(wallet.toLowerCase());
}
