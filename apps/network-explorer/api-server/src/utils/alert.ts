/**
 * Telegram alert helper for explorer-api operational issues.
 *
 * Mirrors the pattern used by the bug-report Lambda
 * (apps/nasun-website/cdk/lambda-src/bug-report/src/index.ts) — plain text
 * (no parse_mode) to avoid escaping pitfalls, fire-and-forget with a 5s
 * timeout, and a simple in-process dedup window so a stuck failure mode
 * doesn't spam the channel every scanLoop tick.
 *
 * The 2026-05-08 snapshot lockout went undetected because the only signal
 * was stderr; this helper closes that gap. It is the highest-value piece
 * of the snapshot-completeness work — automatic recovery is intentionally
 * left to humans operating from this alert.
 */

const RATE_LIMIT_MS = 5 * 60_000; // 5 min per dedupKey
const MAX_DEDUP_ENTRIES = 256;     // hard cap to avoid unbounded growth
const lastSent = new Map<string, number>();

function pruneDedup(): void {
  if (lastSent.size <= MAX_DEDUP_ENTRIES) return;
  const cutoff = Date.now() - RATE_LIMIT_MS;
  for (const [k, t] of lastSent) {
    if (t < cutoff) lastSent.delete(k);
  }
  // If still over (all entries are fresh), drop oldest until under cap.
  if (lastSent.size > MAX_DEDUP_ENTRIES) {
    const sorted = [...lastSent.entries()].sort((a, b) => a[1] - b[1]);
    const toDrop = lastSent.size - MAX_DEDUP_ENTRIES;
    for (let i = 0; i < toDrop; i++) lastSent.delete(sorted[i][0]);
  }
}

export interface AlertOptions {
  /**
   * Stable key identifying this alert family. Within RATE_LIMIT_MS the same
   * key sends at most once. Use `${family}-${date}` or `${family}-${entity}`
   * for per-day or per-entity dedup.
   */
  dedupKey?: string;
}

export async function sendTelegramAlert(
  text: string,
  opts?: AlertOptions,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!token || !chatId) return;

  if (opts?.dedupKey) {
    const last = lastSent.get(opts.dedupKey) ?? 0;
    if (Date.now() - last < RATE_LIMIT_MS) return;
    lastSent.set(opts.dedupKey, Date.now());
    pruneDedup();
  }

  // Plain text (no parse_mode) so error messages with `<`, `>`, `&` don't
  // trigger Telegram 400 and silently drop the alert.
  const body = `[explorer-api] ${text}`.slice(0, 4096);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[Alert] Telegram returned ${res.status}: ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.error('[Alert] Telegram send failed:', (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
