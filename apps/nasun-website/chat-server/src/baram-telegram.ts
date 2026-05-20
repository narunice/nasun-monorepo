// Baram Telegram webhook handler (Plan D §D-2, D-5).
//
// Receives updates from the Telegram Bot API, authenticates with a secret token,
// and routes each message through:
//   1. Session lookup (by tg_user_id) — FSM gate
//   2. Intent classification (deterministic regex only, no LLM)
//   3. Either: Dashboard deep-link reply (capability_change)
//      Or:     agent-runner /wake forward (all other intents)
//
// FSM states:
//   unlinked         — no active session for this tg_user_id
//   linked-idle      — active session, ready to forward
//   awaiting-confirm — pending proposal lock (D-5): inline keyboard shown
//
// D-5 confirmation flow (Plan D §A5 Option α):
//   1. User message → analyst wake → cognition AER Iq
//   2. If proposal in wake response → inline keyboard [Confirm / Cancel]
//   3. [Confirm] → manual /wake (proposal JSON in message) → execution AER Ie
//   4. [Cancel]  → cancel proposal row, clear pending lock via agent-runner
//
// Async UX (Plan D §A7'):
//   - Telegram receives HTTP 200 immediately (handled in baram-telegram-routes.ts)
//   - This module drives the background work: typing loop, /wake call, reply

import { createHmac, timingSafeEqual } from 'node:crypto';
import { ulid } from 'ulid';
import {
  getActiveSessionByTgUser,
  issueShortLivedJWT,
  SessionInactiveError,
} from './baram-session.js';
import { classifyIntent, dashboardDeepLink } from './baram-intent-classifier.js';
import { getEndpoint, isEndpointFresh } from './baram-agent-registry.js';
import {
  createPendingProposal,
  getProposalById,
  finalizeProposal,
  expireStaleProposals,
} from './baram-proposals.js';
import { reserveCognitionSlot } from './baram-message-caps.js';
import { checkBudgetSufficient } from './baram-budget-guard.js';
import { describeFetchError } from './fetch-error.js';
import type { Proposal } from '@nasun/baram-sdk';

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

// Telegram outbound timeout. Without this, a stuck global undici dispatcher
// could hang sendMessage indefinitely and pile up unhandled work on the
// chat-server event loop. A 10s ceiling is well above Telegram p99 latency.
const TG_TIMEOUT_MS = 10_000;

// Cap for honoring Telegram's `parameters.retry_after`. Per-chat 429
// cooldowns are usually single-digit seconds; per-bot global cooldowns can
// be longer. Capping at 10s keeps concurrent webhook handlers from piling
// up — chat-server has no per-chat send concurrency limit, so a 30s wait
// across N concurrent sends multiplies cost.
const TG_429_RETRY_CAP_MS = 10_000;

// Single fetch helper for every Telegram outbound. Retry policy is explicit
// per call site: sendMessage retries once on transport error (user-visible,
// must arrive), but sendChatAction / answerCallbackQuery do not retry
// (non-critical, idempotency on Telegram side is unclear). On final failure
// we log err.cause so the next incident is diagnosable instead of an opaque
// "fetch failed" — the 2026-05-19 incident burned 8h precisely because the
// underlying TypeError cause was never surfaced. 429 handling added 2026-05-20
// after silent-drop audit (sendMessage was returning 429 with no log).
async function tgPost(
  method: string,
  body: Record<string, unknown>,
  retry: boolean,
  label: string,
): Promise<void> {
  const url = tgApiUrl(method);
  const bodyJson = JSON.stringify(body);
  const attempts = retry ? 2 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
        signal: AbortSignal.timeout(TG_TIMEOUT_MS),
      });
      if (!res.ok && res.status >= 500 && i < attempts - 1) {
        continue;
      }
      // 429: honor Telegram-supplied retry_after when a retry is allowed.
      // Guard against NaN/negative/0 so setTimeout(NaN) (Node coerces to
      // 1ms) doesn't bypass the wait. Body parsing uses res.clone() so the
      // stream stays intact for fallthrough paths if needed.
      if (res.status === 429 && retry && i < attempts - 1) {
        let waitMs = 1000;
        try {
          const parsed = (await res
            .clone()
            .json()) as { parameters?: { retry_after?: number } };
          const ra = parsed?.parameters?.retry_after;
          if (typeof ra === 'number' && Number.isFinite(ra) && ra > 0) {
            waitMs = Math.min(ra * 1000, TG_429_RETRY_CAP_MS);
          }
        } catch {
          const ra = Number(res.headers.get('retry-after'));
          if (Number.isFinite(ra) && ra > 0) {
            waitMs = Math.min(ra * 1000, TG_429_RETRY_CAP_MS);
          }
        }
        console.warn(`[baram-tg] ${label} 429 retry in ${waitMs}ms`);
        await new Promise<void>((resolve) => {
          // unref so SIGTERM / cron_restart during sleep doesn't delay exit
          setTimeout(resolve, waitMs).unref();
        });
        continue;
      }
      // 429 with no retry possible — either retry=false caller or last
      // attempt after retry. Label-branch so operators can distinguish
      // "policy says no retry" vs "retried once and still 429".
      if (res.status === 429) {
        const reason = retry ? 'final after retry' : 'no-retry policy';
        console.warn(`[baram-tg] ${label} 429 dropped (${reason})`);
        return;
      }
      // Uniform non-2xx warn for every other dropped response (400/401/403/
      // 5xx-after-final-retry). The pre-2026-05-20 code silently returned on
      // any non-2xx, which is the same silent-drop class the 429 branch was
      // added to close. One log line per dropped outbound is cheap and the
      // only handle operators have for HTTP-level Telegram regressions.
      if (!res.ok) {
        console.warn(`[baram-tg] ${label} HTTP ${res.status} dropped`);
      }
      return;
    } catch (err) {
      if (i < attempts - 1) continue;
      console.warn(`[baram-tg] ${label} failed: ${describeFetchError(err)}`);
    }
  }
}


async function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await tgPost('sendMessage', body, true, 'sendMessage');
}

async function sendChatAction(chatId: number | string, action = 'typing'): Promise<void> {
  await tgPost('sendChatAction', { chat_id: chatId, action }, false, 'sendChatAction');
}

async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await tgPost(
    'answerCallbackQuery',
    {
      callback_query_id: callbackQueryId,
      text: text ?? '',
      show_alert: false,
    },
    false,
    'answerCallbackQuery',
  );
}

// ===== Webhook signature verification =====

/**
 * Verify the X-Telegram-Bot-Api-Secret-Token header.
 * Returns true if the header matches BARAM_TG_WEBHOOK_SECRET.
 * Always returns true when secret is not set (dev mode).
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

// Map a runtime/Lambda wake-failure reason to an actionable user-facing
// message. Generic "could not process that right now" is unhelpful when the
// real fix is on the user's side (top up NSN gas, top up inference balance,
// reactivate a paused capability, etc.). Patterns matched against the
// `reason` string the runtime returns in the `/wake` response body.
function formatWakeFailureMessage(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('no valid gas coins') || r.includes('gas coin') || r.includes('gasbalancetoolow')) {
    return (
      'Your agent has no NSN for gas, so it cannot sign transactions. ' +
      'Open the Funds card on your Dashboard and deposit a small amount of NSN ' +
      "to the agent's wallet, then try again."
    );
  }
  if (r.includes('e_escrow_no_balance') || r.includes('e_insufficient_escrow_balance') || r.includes('abort code 579') || r.includes('abort code 573')) {
    return (
      'Your agent has no trade capital in its escrow. ' +
      'Open the Funds card on your Dashboard and deposit NUSDC (and/or NBTC) ' +
      'as trading capital, then try again.'
    );
  }
  if (r.includes('e_payment_exceeds_notional_cap') || r.includes('abort code 552')) {
    return (
      "Your agent tried to trade more than its per-action cap allows. " +
      'Increase the cap in Capability settings on your Dashboard, or wait for the next cycle to retry with a smaller size.'
    );
  }
  if (r.includes('http 429') || r.includes('rate limit')) {
    return 'The AI provider is rate-limited right now. Your agent will retry on the next cycle.';
  }
  if (r.includes('http 404') && r.includes('request not found')) {
    return 'Your agent could not finalize the last request. Please try again in a moment.';
  }
  if (r.includes('infer_failed') || r.includes('inference')) {
    return 'Your agent could not complete an inference call. Please try again shortly.';
  }
  if (r.includes('budget') || r.includes('inference balance')) {
    return (
      "Your agent's inference balance is empty. " +
      'Open the Funds card on your Dashboard and top up the Inference Balance, then try again.'
    );
  }
  return 'Your agent could not process that right now. Please try again shortly.';
}

// ===== Wake forwarding =====

// D-6 async UX: a wake call may take longer than the perceived "wait" window.
// We tell the user "still working" at 30s but keep awaiting up to 120s for the
// real result. This avoids the previous bug where the fetch aborted at 28s
// just before the "still working" notice fired, leaving the user with neither
// the result nor a clear status.
const WAKE_SOFT_NOTICE_MS = 30_000;
const WAKE_HARD_TIMEOUT_MS = 120_000;

interface WakeBody {
  job_id: string;
  jwt: string;
  trigger_type: 'user_message' | 'manual';
  intent_id: string;
  parent_intent_id?: string;
  message?: string;
}

interface WakeResult {
  ok: boolean;
  status?: string;
  reason?: string;
  summary?: string;
  proposal?: Proposal;
  error?: string;
}

async function forwardToWake(
  wakeUrl: string,
  body: WakeBody,
  timeoutMs: number = WAKE_HARD_TIMEOUT_MS,
): Promise<WakeResult> {
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
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `wake_http_${res.status}: ${text.slice(0, 100)}` };
    }
    const json = (await res.json()) as Record<string, unknown>;
    const reason = typeof json.reason === 'string' ? json.reason : undefined;
    const status = typeof json.status === 'string' ? json.status : undefined;
    return {
      ok: json.ok === true,
      status,
      reason,
      summary: typeof json.summary === 'string' ? json.summary : undefined,
      proposal: json.proposal != null ? (json.proposal as Proposal) : undefined,
      error: json.ok === true ? undefined : reason,
    };
  } catch (err) {
    return { ok: false, error: describeFetchError(err) };
  }
}

// ===== Inline keyboard builder =====

function buildConfirmKeyboard(proposalId: string): Record<string, unknown> {
  return {
    inline_keyboard: [[
      { text: 'Confirm', callback_data: `confirm:${proposalId}` },
      { text: 'Cancel', callback_data: `cancel:${proposalId}` },
    ]],
  };
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

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ===== Main update handler =====

/**
 * Process a single Telegram update in the background.
 * Called after the HTTP 200 has already been sent back to Telegram.
 */
export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  // Sweep expired proposals on every update to keep the partial unique index clean.
  try { expireStaleProposals(); } catch { /* non-critical */ }

  // Route callback_query (inline keyboard button press) separately.
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const msg = update.message;
  if (!msg || !msg.from) return;

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

  // D-6: daily message cap (50/day, UTC-reset). Atomically reserve a slot
  // before any expensive downstream work; reject if the wallet hit the cap.
  const reservation = reserveCognitionSlot(session.wallet);
  if (!reservation.ok) {
    await sendMessage(
      chatId,
      `Daily message limit reached (${reservation.cap}/day). ` +
      `Limits reset at 00:00 UTC.`,
    );
    return;
  }

  // D-6: pre-check on-chain Budget. Avoids burning the user's cap on calls
  // that will fail downstream with insufficient balance.
  const budgetCheck = await checkBudgetSufficient(ep.budgetId);
  if (!budgetCheck.ok) {
    const reason = budgetCheck.reason ?? 'unknown';
    const msg =
      reason === 'insufficient' ? 'Your agent\'s Budget is too low to run a request. Please top it up from the Dashboard.'
      : reason === 'inactive'   ? 'Your agent\'s Budget is inactive. Please reactivate it from the Dashboard.'
      : reason === 'not_found'  ? 'Your agent\'s Budget could not be located on-chain. Please check the Dashboard.'
      :                           'Could not verify your agent\'s Budget right now. Please try again shortly.';
    await sendMessage(chatId, msg);
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

  // Start typing loop (every 4s) while awaiting the /wake response. The loop
  // continues past the soft notice so the indicator persists until we get a
  // real result or hit the hard timeout.
  void sendChatAction(chatId);
  const typingTimer = setInterval(() => { void sendChatAction(chatId); }, 4_000);
  const softNoticeId = setTimeout(() => {
    void sendMessage(chatId, 'Your agent is still working on it. The response will arrive shortly.');
  }, WAKE_SOFT_NOTICE_MS);

  try {
    const result = await forwardToWake(`${ep.httpUrl}/wake`, wakeBody);
    clearTimeout(softNoticeId);
    clearInterval(typingTimer);

    // D-5: if analyst returned a trade proposal, store it and show inline keyboard.
    if (result.ok && result.proposal) {
      await handleProposalResponse(chatId, session.agent, session.sid, result.proposal, result.summary);
      return;
    }

    if (result.ok && result.summary) {
      await sendMessage(chatId, result.summary);
    } else if (result.ok && result.status === 'skipped' && result.reason === 'pending_lock') {
      // Defense-in-depth: a stranded lock should be impossible after the
      // 2026-05-16 finally/cancel fixes, but if one ever slips through the
      // user should at least understand why their message is being ignored.
      await sendMessage(
        chatId,
        'Your previous trade is still being processed. Please wait a moment and try again.',
      );
    } else if (result.ok) {
      await sendMessage(chatId, 'Done. Check your Dashboard for the latest activity.');
    } else {
      const reason = result.error ?? 'unknown';
      console.warn(`[baram-tg] /wake returned not-ok: ${reason}`);
      await sendMessage(chatId, formatWakeFailureMessage(reason));
    }
  } catch (err) {
    clearTimeout(softNoticeId);
    clearInterval(typingTimer);
    console.error('[baram-tg] forwardToWake error:', (err as Error).message);
    await sendMessage(chatId, 'An error occurred while reaching your agent. Please try again.');
  }
}

// ===== Proposal response handler (D-5) =====

async function handleProposalResponse(
  chatId: number,
  agent: string,
  sessionId: string,
  proposal: Proposal,
  summary: string | undefined,
): Promise<void> {
  // Store the proposal in DB.
  const expiresAtMs = new Date(proposal.expires_at).getTime();
  try {
    createPendingProposal({
      proposalId: proposal.proposal_id,
      agent,
      sessionId,
      intentId: proposal.intent_id,
      proposal,
      expiresAtMs,
    });
  } catch (err) {
    // Could be a duplicate (idempotent retry) — log and continue.
    console.warn('[baram-tg] createPendingProposal failed:', (err as Error).message);
  }

  const expiresInMin = Math.round((expiresAtMs - Date.now()) / 60_000);
  const text =
    (summary ? `${summary}\n\n` : '') +
    `<b>Trade Proposal</b>\n` +
    `Action: <b>${proposal.side}</b>\n` +
    `Amount: ${(Number(proposal.size_quote_raw) / 1e6).toFixed(2)} NUSDC\n` +
    `Symbol: ${proposal.symbol}\n` +
    `Expires in: ~${expiresInMin} min\n\n` +
    `Tap <b>Confirm</b> to execute or <b>Cancel</b> to dismiss.`;

  await sendMessage(chatId, text, buildConfirmKeyboard(proposal.proposal_id));
}

// ===== Callback query handler (D-5) =====

async function handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
  const chatId = cb.message?.chat.id;
  const data = cb.data ?? '';

  // Acknowledge immediately (removes the loading spinner on the button).
  await answerCallbackQuery(cb.id);

  if (!chatId) return;

  const tgUserId = String(cb.from.id);
  const session = getActiveSessionByTgUser(tgUserId);

  const colonIdx = data.indexOf(':');
  if (colonIdx < 0) return;
  const action = data.slice(0, colonIdx);
  const proposalId = data.slice(colonIdx + 1);

  if (action !== 'confirm' && action !== 'cancel') return;

  // Verify proposal belongs to this user's session.
  const row = getProposalById(proposalId);
  if (!row) {
    await sendMessage(chatId, 'This proposal has expired or is no longer available.');
    return;
  }
  if (row.status !== 'pending') {
    const statusMsg =
      row.status === 'confirmed' ? 'already confirmed'
      : row.status === 'cancelled' ? 'already cancelled'
      : 'expired';
    await sendMessage(chatId, `This proposal has been ${statusMsg}.`);
    return;
  }
  if (!session || row.agent !== session.agent) {
    await sendMessage(chatId, 'Session mismatch. Please re-link your agent.');
    return;
  }

  if (action === 'cancel') {
    await handleProposalCancel(chatId, session, proposalId, row.proposal);
    return;
  }

  // action === 'confirm'
  await handleProposalConfirm(chatId, session, proposalId, row.proposal);
}

async function handleProposalConfirm(
  chatId: number,
  session: ReturnType<typeof getActiveSessionByTgUser>,
  proposalId: string,
  proposal: Proposal,
): Promise<void> {
  if (!session) return;

  const ep = getEndpoint(session.agent);
  if (!ep || !isEndpointFresh(ep)) {
    await sendMessage(chatId, 'Your agent is offline. Please try again when it reconnects.');
    return;
  }

  let jwt: string;
  try {
    jwt = issueShortLivedJWT(session.sid);
  } catch {
    await sendMessage(chatId, 'Session error. Please re-link your agent.');
    return;
  }

  // Optimistically mark as confirmed before sending the wake (D-5 §R3: the
  // pending lock guard on the agent-runner side handles races).
  finalizeProposal(proposalId, 'confirmed');

  await sendMessage(chatId, 'Executing your trade... please wait.');
  void sendChatAction(chatId);
  const typingTimer = setInterval(() => { void sendChatAction(chatId); }, 4_000);

  const manualWake: WakeBody = {
    job_id: ulid(),
    jwt,
    trigger_type: 'manual',
    intent_id: ulid(),
    parent_intent_id: proposal.intent_id,
    // Carry the full proposal JSON so agent-runner can build the execution
    // without re-reading the DB or onchain state.
    message: JSON.stringify(proposal),
  };

  try {
    const result = await forwardToWake(`${ep.httpUrl}/wake`, manualWake);
    clearInterval(typingTimer);

    if (result.ok && result.summary) {
      await sendMessage(chatId, `Trade executed.\n\n${result.summary}`);
    } else if (result.ok) {
      await sendMessage(chatId, 'Trade executed. Check your Dashboard for details.');
    } else {
      // Roll back optimistic confirm so the user can retry.
      // Note: we cannot easily revert to 'pending' with the current schema
      // (status check in finalizeProposal prevents this). Log only.
      console.warn(`[baram-tg] Manual wake failed: ${result.error}`);
      await sendMessage(
        chatId,
        'Your agent could not execute the trade right now. ' +
        'The proposal may have expired. Please check your Dashboard.',
      );
    }
  } catch (err) {
    clearInterval(typingTimer);
    console.error('[baram-tg] manual wake error:', (err as Error).message);
    await sendMessage(chatId, 'An error occurred. Please check your Dashboard.');
  }
}

async function handleProposalCancel(
  chatId: number,
  session: ReturnType<typeof getActiveSessionByTgUser>,
  proposalId: string,
  proposal: Proposal,
): Promise<void> {
  if (!session) return;

  finalizeProposal(proposalId, 'cancelled');

  // Fire a manual wake with a cancel sentinel so the agent-runner clears the
  // on-chain pending lock immediately. Without this the lock would survive
  // up to MAX_PENDING_TTL_MS (15 min), during which every analyst/heartbeat
  // cycle is skipped -- effectively freezing the agent. See 2026-05-16 handoff.
  const ep = getEndpoint(session.agent);
  if (ep && isEndpointFresh(ep)) {
    try {
      const jwt = issueShortLivedJWT(session.sid);
      const cancelWake: WakeBody = {
        job_id: ulid(),
        jwt,
        trigger_type: 'manual',
        intent_id: ulid(),
        parent_intent_id: proposal.intent_id,
        message: JSON.stringify({ __nasun_cancel__: true, proposal_id: proposalId }),
      };
      // Fire-and-forget with a short timeout: user gets immediate feedback
      // regardless of clear outcome, and the lock will self-expire as fallback.
      void forwardToWake(`${ep.httpUrl}/wake`, cancelWake, 15_000).catch((err) => {
        console.warn('[baram-tg] cancel wake failed (lock will self-expire):', (err as Error).message);
      });
    } catch (err) {
      console.warn('[baram-tg] cancel wake setup failed:', (err as Error).message);
    }
  }

  await sendMessage(chatId, 'Trade cancelled. Your agent will continue monitoring.');
}

// ===== /start command =====

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
