/**
 * Telegram notification client for Baram agent-runner.
 *
 * Sends a plain-text message to a Telegram chat via the Bot API.
 * All failures are logged and swallowed — a broken Telegram config
 * must never kill the agent cycle.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TIMEOUT_MS = 8_000;

/**
 * Send a text message to a Telegram chat.
 * Returns true on success, false on any failure.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`[telegram] sendMessage HTTP ${resp.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[telegram] sendMessage failed: ${msg}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

