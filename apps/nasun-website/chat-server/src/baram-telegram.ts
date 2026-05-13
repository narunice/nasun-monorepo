// Baram Telegram webhook handler (Plan D §D-2).
//
// Receives updates from the Telegram Bot API, authenticates with a secret token,
// and routes each message through:
//   1. Session lookup (by tg_user_id) — FSM gate
//   2. Intent classification (deterministic regex only, no LLM)
//   3. Either: Dashboard deep-link reply (capability_change)
//      Or:     agent-runner /wake forward (all other intents)
//
// FSM states:
//   unlinked       — no active session for this tg_user_id
//   linked-idle    — active session, ready to forward
//   awaiting-confirm — pending proposal lock (D-5 will add this state)
//
// Async UX (Plan D §A7'):
//   - Telegram receives HTTP 200 immediately (handled in baram-telegram-routes.ts)
//   - This module drives the background work: typing loop, /wake call, reply
//
// Inline keyboard is stub only in D-2; D-5 will complete it.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import {
  getActiveSessionByTgUser,
  issueShortLivedJWT,
  SessionInactiveError,
} from './baram-session.js';
import { classifyIntent, dashboardDeepLink } from './baram-intent-classifier.js';
import { getEndpoint, isEndpointFresh } from './baram-agent-registry.js';

// ===== Telegram Bot API helpers =====

function getBotToken(): string {
  const t = process.env.BARAM_TG_BOT_TOKEN;
  if (!t) throw new Error('BARAM_TG_BOT_TOKEN not set');
  return t;
}

function getWebhookSecret(): string {
  return process.env.BARAM_TG_WEBHOOK_SECRET ?? '';
}

function tgApiUrl(method: string): string {
  return `https://api.telegram.org/bot${getBotToken()}/${method}`;
}

async function sendMessage(chatId: number | string, text: string): Promise<void> {
  try {
    await fetch(tgApiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (err) {
    console.warn('[baram-tg] sendMessage failed:', (err as Error).message);
  }
}

async function sendChatAction(chatId: number | string, action = 'typing'): Promise<void> {
  try {
    await fetch(tgApiUrl('sendChatAction'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch {
    // Non-critical — typing indicator failing silently is acceptable.
  }
}

// ===== Webhook signature verification =====

/**
 * Verify the X-Telegram-Bot-Api-Secret-Token header.
 * Returns true if the header matches the configured BARAM_TG_WEBHOOK_SECRET.
 * Always returns true when BARAM_TG_WEBHOOK_SECRET is not set (dev mode).
 */
export function verifyWebhookToken(headerValue: string | undefined): boolean {
  const secret = getWebhookSecret();
  if (!secret) return true; // dev mode: no secret configured
  if (!headerValue) return false;
  const expected = Buffer.from(secret, 'utf8');
  const provided = Buffer.from(headerValue, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// ===== HMAC for /wake body signing =====

function getHmacSecret(): Buffer {
  const raw = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
  if (!raw || raw.length < 32) throw new Error('BARAM_CHAT_SERVER_HMAC_SECRET missing or too short');
  return Buffer.from(raw, 'hex');
}

function signBody(bodyJson: string): string {
  return createHmac('sha256', getHmacSecret()).update(bodyJson, 'utf8').digest('hex');
}

// ===== Wake forwarding =====

interface WakeBody {
  job_id: string;
  jwt: string;
  trigger_type: 'user_message';
  intent_id: string;
  message: string;
}

async function forwardToWake(
  wakeUrl: string,
  body: WakeBody,
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const bodyJson = JSON.stringify(body);
  const hmac = signBody(bodyJson);
  try {
    const res = await fetch(wakeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HMAC': hmac,
      },
      body: bodyJson,
      signal: AbortSignal.timeout(28_000), // leave 2s margin under 30s total
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `wake_http_${res.status}: ${text.slice(0, 100)}` };
    }
    const json = (await res.json()) as Record<string, unknown>;
    return {
      ok: json.ok === true,
      summary: typeof json.summary === 'string' ? json.summary : undefined,
      error: typeof json.reason === 'string' ? json.reason : undefined,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ===== Telegram update types (minimal) =====

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// ===== Main update handler =====

/**
 * Process a single Telegram update in the background.
 * Called after the HTTP 200 has already been sent back to Telegram.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.from) return; // ignore non-message updates in D-2

  const chatId = msg.chat.id;
  const tgUserId = String(msg.from.id);
  const text = (msg.text ?? '').trim();

  if (!text) return;

  // Handle /start <sid> deep-link from Dashboard
  if (text.startsWith('/start')) {
    await handleStartCommand(chatId, tgUserId, text);
    return;
  }

  // Lookup active session by tg_user_id (FSM gate)
  const session = getActiveSessionByTgUser(tgUserId);
  if (!session) {
    await sendMessage(
      chatId,
      'Your Nasun AI agent is not linked to this Telegram account.\n\n' +
      'Visit your Dashboard to link it:\n' +
      `<a href="${dashboardDeepLink()}">${dashboardDeepLink()}</a>`,
    );
    return;
  }

  // FSM: linked-idle
  const intent = classifyIntent(text);

  if (intent === 'capability_change') {
    await sendMessage(
      chatId,
      'To change your agent settings, please visit your Dashboard:\n' +
      `<a href="${dashboardDeepLink()}">${dashboardDeepLink()}</a>\n\n` +
      'Capability and policy changes require a wallet signature.',
    );
    return;
  }

  // forward — look up agent endpoint and call /wake
  const ep = getEndpoint(session.agent);
  if (!ep || !isEndpointFresh(ep)) {
    await sendMessage(
      chatId,
      'Your AI agent is not reachable right now (endpoint offline or stale). ' +
      'Please check that your agent is running.',
    );
    return;
  }

  // Issue 5-min JWT for the session
  let jwt: string;
  try {
    jwt = issueShortLivedJWT(session.sid);
  } catch (err) {
    if (err instanceof SessionInactiveError) {
      await sendMessage(chatId, 'Your session has expired. Please re-link your agent from the Dashboard.');
      return;
    }
    console.error('[baram-tg] JWT issuance failed:', (err as Error).message);
    await sendMessage(chatId, 'Internal error. Please try again.');
    return;
  }

  // Build wake body
  const wakeBody: WakeBody = {
    job_id: ulid(),
    jwt,
    trigger_type: 'user_message',
    intent_id: ulid(),
    message: text.slice(0, 4000),
  };

  // Start typing loop (every 4s) while awaiting the /wake response
  void sendChatAction(chatId); // immediate first typing signal
  const typingTimer = setInterval(() => { void sendChatAction(chatId); }, 4_000);

  const WAKE_TIMEOUT_MS = 30_000;
  const timeoutId = setTimeout(() => {
    clearInterval(typingTimer);
    void sendMessage(chatId, 'Your agent is still working on it. The response will arrive shortly.');
  }, WAKE_TIMEOUT_MS);

  try {
    const result = await forwardToWake(`${ep.httpUrl}/wake`, wakeBody);
    clearTimeout(timeoutId);
    clearInterval(typingTimer);

    if (result.ok && result.summary) {
      await sendMessage(chatId, result.summary);
    } else if (result.ok) {
      await sendMessage(chatId, 'Done. Check your Dashboard for the latest activity.');
    } else {
      const reason = result.error ?? 'unknown';
      console.warn(`[baram-tg] /wake returned not-ok: ${reason}`);
      await sendMessage(chatId, 'Your agent could not process that right now. Please try again shortly.');
    }
  } catch (err) {
    clearTimeout(timeoutId);
    clearInterval(typingTimer);
    console.error('[baram-tg] forwardToWake error:', (err as Error).message);
    await sendMessage(chatId, 'An error occurred while reaching your agent. Please try again.');
  }
}

async function handleStartCommand(chatId: number, tgUserId: string, text: string): Promise<void> {
  const parts = text.split(/\s+/);
  const sid = parts[1];

  if (!sid) {
    await sendMessage(
      chatId,
      'Welcome to Nasun AI!\n\n' +
      'To link your agent, visit your Dashboard and tap "Link Telegram":\n' +
      `<a href="${dashboardDeepLink()}">${dashboardDeepLink()}</a>`,
    );
    return;
  }

  // Import inline to avoid circular dep risk; baram-session is a pure data module.
  const { bindTelegramUser } = await import('./baram-session.js');
  const bound = bindTelegramUser(sid, tgUserId);

  if (bound) {
    await sendMessage(
      chatId,
      'Your Nasun AI agent is now linked to this Telegram account.\n\n' +
      'You can now send messages here to interact with your agent.\n' +
      'To manage settings, visit your Dashboard:\n' +
      `<a href="${dashboardDeepLink()}">${dashboardDeepLink()}</a>`,
    );
  } else {
    await sendMessage(
      chatId,
      'This link has already been used or has expired.\n\n' +
      'Please generate a new link from your Dashboard:\n' +
      `<a href="${dashboardDeepLink()}">${dashboardDeepLink()}</a>`,
    );
  }
}

// Unused export kept for future D-5 inline keyboard extension.
export { randomBytes as _crypto_randomBytes };
