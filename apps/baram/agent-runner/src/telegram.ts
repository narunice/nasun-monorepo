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

export interface TraderNotificationPayload {
  action: 'BUY' | 'SELL' | 'HOLD';
  sizeNUSDC?: number;
  reason?: string;
  txDigest?: string;
  agentAddress: string;
  riskGate?: string;
}

/**
 * Build and send a trader AER notification to Telegram.
 */
export async function notifyTraderAER(
  botToken: string,
  chatId: string,
  payload: TraderNotificationPayload,
): Promise<void> {
  const { action, sizeNUSDC, reason, txDigest, agentAddress, riskGate } = payload;

  const emoji = action === 'BUY' ? '🟢' : action === 'SELL' ? '🔴' : '⚪';
  const shortAddr = `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`;
  const ts = new Date().toLocaleString('en-US');

  let lines = [
    `<b>[Nasun AI Trader] ${emoji} ${action}</b>`,
    `Agent: <code>${shortAddr}</code>`,
  ];

  if (action !== 'HOLD' && sizeNUSDC !== undefined) {
    lines.push(`Size: ${sizeNUSDC.toFixed(2)} NUSDC`);
  }

  if (riskGate) {
    lines.push(`Risk gate: ${riskGate}`);
  } else if (reason) {
    const trimmed = reason.length > 120 ? reason.slice(0, 117) + '...' : reason;
    lines.push(`Reason: ${trimmed}`);
  }

  if (txDigest) {
    lines.push(`Digest: <code>${txDigest}</code>`);
  }

  lines.push(`Time: ${ts}`);

  await sendTelegramMessage(botToken, chatId, lines.join('\n'));
}
