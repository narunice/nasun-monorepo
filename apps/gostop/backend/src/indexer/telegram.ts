/**
 * Shared Telegram sender for the indexer's alert loops.
 *
 * No `parse_mode`, so nothing in a body can stop it being delivered. That is
 * the whole design constraint, and it was learned the hard way twice.
 *
 * These bodies were sent as legacy Markdown, which treats `_` as an italic
 * delimiter even mid-word. drift-keeper's cursor_lag_severe names
 * `indexer_cursor`, one underscore, so Telegram rejected the whole message with
 * HTTP 400 "can't parse entities: Can't find end of the entity" on every single
 * tick since the alert shipped. Nothing surfaced it: the sender logs only on
 * success and latches the cooldown only on success, so a permanent rejection is
 * indistinguishable from "no alert was warranted" while it retries every 5
 * minutes forever. 94 consecutive failures sat in the log window when this was
 * found on 2026-09-27, against zero alerts ever delivered, and the stuck
 * reconciler backlog it reports had never reached anyone.
 *
 * Switching to HTML would only move the hazard from `_` to an unescaped `<` or
 * `&` in prose, and phrases like "cap_bps > 0" belong in these bodies.
 * apps/network-explorer/api-server/src/utils/alert.ts reached the same
 * conclusion already and says so in a comment. Plain text costs emphasis and
 * buys the guarantee that a wording change can never mute an alert.
 *
 * Both loops previously kept private copies of this function, which is why the
 * rejection was only ever observable in one of them.
 *
 * Removing the parse mode removes one cause of permanent rejection, not the
 * category: a rotated token, a bot removed from the chat or a wrong chat id all
 * still fail every send. Since the callers deliberately leave their cooldown
 * unlatched on failure so the next tick retries, a permanent failure loops
 * forever. `noteFailure` therefore escalates a streak to console.error naming
 * how long alerting has been down, so the state cannot look like silence again.
 */

import { env } from '../env.js';

/** Short, so a Telegram outage cannot back up the indexer. */
const TELEGRAM_TIMEOUT_MS = 5_000;

export function alertingEnabled(): boolean {
  return Boolean(env.alerts.telegramBotToken && env.alerts.telegramChatId);
}

/**
 * Post one alert. Returns whether Telegram accepted it, which the callers use
 * to decide whether to latch their cooldown. A rejected send must stay
 * un-latched so the next tick retries.
 *
 * `tag` is the caller's log prefix so a failure names which loop produced it.
 */
export async function sendTelegram(tag: string, text: string): Promise<boolean> {
  if (!alertingEnabled()) return false;

  const url = `https://api.telegram.org/bot${env.alerts.telegramBotToken}/sendMessage`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.alerts.telegramChatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      noteFailure(tag, `non-ok ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    noteSuccess(tag);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    noteFailure(tag, `fetch failed: ${msg}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Consecutive failed sends per caller tag. Cleared on the first success. */
const failureStreak = new Map<string, number>();

/**
 * Failures above this stop being warnings and start being errors.
 *
 * Removing the parse mode removed one cause of permanent rejection, not the
 * category. A rotated token, a bot removed from the chat or a wrong chat id all
 * still fail every send, and the callers leave the cooldown unlatched on
 * failure, so the loop retries forever while the out log stays empty. That is
 * the exact shape that hid 94 consecutive rejections.
 *
 * Three is one more than a transient blip at a 5-minute cadence. Past it the
 * message says how long alerting has actually been down, which is the part an
 * operator needs, rather than repeating a single-line warning that reads the
 * same on attempt 2 and attempt 200.
 */
const FAILURE_STREAK_ESCALATE = 3;

function noteSuccess(tag: string): void {
  const streak = failureStreak.get(tag) ?? 0;
  if (streak >= FAILURE_STREAK_ESCALATE) {
    console.error(`[${tag}] telegram alerting recovered after ${streak} consecutive failures`);
  }
  failureStreak.delete(tag);
}

function noteFailure(tag: string, detail: string): void {
  const streak = (failureStreak.get(tag) ?? 0) + 1;
  failureStreak.set(tag, streak);
  if (streak < FAILURE_STREAK_ESCALATE) {
    console.warn(`[${tag}] telegram ${detail}`);
    return;
  }
  console.error(
    `[${tag}] TELEGRAM ALERTING DOWN: ${streak} consecutive failures, no alert has been ` +
      `delivered since the streak began. Every alert from this loop is being retried and ` +
      `dropped. Last error: ${detail}`,
  );
}

/** Test-only. The escalation logic, which a unit test cannot reach through
 *  sendTelegram because alertingEnabled() short-circuits without a token. */
export const _noteFailure = noteFailure;
export const _noteSuccess = noteSuccess;

/** Test-only. Consecutive failure state. */
export function _failureStreakForTests(tag: string): number {
  return failureStreak.get(tag) ?? 0;
}

/** Test-only. Resets streaks between specs. */
export function _resetTelegramStateForTests(): void {
  failureStreak.clear();
}

/** Test-only. Escalation threshold. */
export const _FAILURE_STREAK_ESCALATE = FAILURE_STREAK_ESCALATE;

/** Test-only. The absence of a parse mode is load-bearing, so lock it. */
export const _TELEGRAM_PARSE_MODE = null;
