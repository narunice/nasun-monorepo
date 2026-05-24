/**
 * Chat preset — free-form LLM reply for `user_message` wake events that
 * the intent classifier routes as 'chat' (no trading intent).
 *
 * Contract:
 *   - No on-chain Request, no Budget deduction, no AER.
 *   - Calls the configured LLM directly (`llm-client.callLLM`) and returns
 *     the raw text as `WakeOutcome.summary`. chat-server uses `summary`
 *     verbatim for the Telegram reply.
 *   - Rate-limited at the wake-router (per-sid + global sliding window).
 *
 * Why no AER:
 *   AER documents on-chain-settled inference where money/capability moves.
 *   General chit-chat doesn't move funds, so it doesn't need verifiability.
 *   The Baram narrative ("every AI action that moves money is on-chain
 *   verifiable") is preserved -- this preset deliberately stays out of
 *   that surface.
 *
 * Why a separate preset (not just an analyst flag):
 *   The analyst path forces the LLM into a strict trade JSON envelope
 *   ({"action":..., "sizeNUSDC":..., "reason":...}). Bolting "answer
 *   free-form sometimes" onto that path tangles two prompt contracts
 *   and breaks `prompt_template_hash` stability for the AER replay.
 *   Keeping chat as its own preset isolates the change.
 *
 * Failure modes:
 *   - LLM config missing: return a graceful canned message + log warning.
 *     This is the only path where we soft-fail; everywhere else returns
 *     `ok: false`.
 *   - LLM call throws: surface the error as a Telegram-safe summary and
 *     mark the outcome rejected so the operator can spot it in logs.
 */

import type { Config } from '../config.js';
import type { WakeContext, WakeOutcome } from '../wake-router.js';
import { callLLM as defaultCallLLM } from '../llm-client.js';
import { ChatLLMPool } from '../chat-llm-pool.js';
import { ChatHistoryStore, renderChatPrompt } from '../chat-history.js';

// Byte-stable chat persona prompt. Not hashed into any AER (no AER is
// produced here) but kept const so the agent's voice stays consistent
// across replies and across agent processes.
//
// Tone notes:
//   - Friendly, brief (Telegram bubbles get cropped past ~3 lines).
//   - Self-aware about being a trading agent so users don't expect
//     full ChatGPT capability.
//   - English only. The chat-server layer can transcribe to KR if a
//     future locale flag flips.
const CHAT_PERSONA_PROMPT = `You are the chat persona of a Nasun AI trading agent.
The user is having a casual conversation with you in Telegram.

Style:
- Reply in plain prose, no JSON, no headers, no bullet points.
- 1-3 short sentences, friendly and direct.
- It's fine to discuss general topics (crypto basics, market concepts,
  small talk). For deep knowledge you don't have, say so briefly.
- If the user wants to actually trade, remind them to say "BUY" or
  "SELL" explicitly so you can open a trade proposal.
- If the user asks about your holdings, balance, capital, escrow,
  position, or "how much NBTC/NUSDC do you have", answer using the
  exact numbers from the Portfolio context block below. Do not say
  you don't know or you don't hold anything when the context shows a
  non-zero balance.

Do not:
- Output JSON, code fences, or any structured envelope.
- Promise market predictions or financial outcomes.
- Mention "AER", "Budget", "Capability", or internal plumbing.`;

export interface ChatPortfolio {
  /** Wallet + escrow union, in raw on-chain units (1e8 for NBTC, 1e6 for NUSDC). */
  nbtcRaw: bigint;
  nusdcRaw: bigint;
  walletNbtcRaw: bigint;
  walletNusdcRaw: bigint;
  escrowNbtcRaw: bigint;
  escrowNusdcRaw: bigint;
}

export interface ChatDeps {
  callLLM: typeof defaultCallLLM;
  log: (msg: string) => void;
  /** Per-process chat history store, keyed by ctx.sid. Tests inject
   *  a fresh store to avoid cross-test pollution; production reuses
   *  the module-level singleton. */
  history: ChatHistoryStore;
  /** Optional. When provided, the chat preset prepends a Portfolio
   *  context block so the agent can answer "how much NBTC are you
   *  holding?" with real numbers instead of a vague refusal (the
   *  2026-05-24 Frank-agent failure). Returning null skips injection
   *  silently (used when no trader config is loaded). Throws are
   *  caught and logged; chat still proceeds without the block. */
  fetchPortfolio?: () => Promise<ChatPortfolio | null>;
}

// Module-level singleton so consecutive wake events from the same sid
// see the prior turns. Survives the lifetime of the runtime process,
// which is exactly the right window for casual chat (and aligned with
// the chat-server's daily 18:00 UTC restart).
const SHARED_HISTORY = new ChatHistoryStore();

const REAL_DEPS: ChatDeps = {
  callLLM: defaultCallLLM,
  log: (msg) => {
    const ts = new Date().toLocaleString('en-US');
    console.log(`[${ts}] ${msg}`);
  },
  history: SHARED_HISTORY,
};

/**
 * Process-scoped pool. We build it lazily on first chat call so unit
 * tests that don't touch chat don't pay the construction. Cached by the
 * provider-list array identity so config swaps in tests rebuild it.
 */
let cachedPool: { providers: unknown; pool: ChatLLMPool } | null = null;
function getPool(config: Config): ChatLLMPool {
  if (!cachedPool || cachedPool.providers !== config.chatLlmProviders) {
    cachedPool = {
      providers: config.chatLlmProviders,
      pool: new ChatLLMPool(config.chatLlmProviders),
    };
  }
  return cachedPool.pool;
}

/**
 * Format a Portfolio context block the LLM can quote when the user
 * asks about holdings. Numbers are human units (NBTC = 1e-8, NUSDC =
 * 1e-6) so the model doesn't have to do the conversion. Wallet and
 * escrow are shown separately because the agent's spend authority
 * lives on the escrow side and users often ask about either.
 */
export function renderPortfolioBlock(p: ChatPortfolio): string {
  const fmtNbtc = (raw: bigint) => (Number(raw) / 1e8).toFixed(8);
  const fmtNusdc = (raw: bigint) => (Number(raw) / 1e6).toFixed(6);
  return [
    '# Portfolio context (your current on-chain holdings)',
    `- NBTC total: ${fmtNbtc(p.nbtcRaw)} (escrow ${fmtNbtc(p.escrowNbtcRaw)} + wallet ${fmtNbtc(p.walletNbtcRaw)})`,
    `- NUSDC total: ${fmtNusdc(p.nusdcRaw)} (escrow ${fmtNusdc(p.escrowNusdcRaw)} + wallet ${fmtNusdc(p.walletNusdcRaw)})`,
    'When asked "how much NBTC/NUSDC do you have", reply with these totals',
    'in plain prose (e.g. "I\'m holding 0.12345678 NBTC right now"). It is',
    'fine to mention the escrow vs wallet split if the user asks for detail.',
  ].join('\n');
}

/** Soft cap on the returned reply so a runaway model can't blow up a
 *  Telegram bubble. Trimmed at sentence-ish boundary if possible. */
const MAX_REPLY_CHARS = 600;

function trimReply(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.length <= MAX_REPLY_CHARS) return cleaned;
  // Prefer cutting at the last sentence boundary inside the budget.
  const window = cleaned.slice(0, MAX_REPLY_CHARS);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (lastStop > MAX_REPLY_CHARS * 0.6) return window.slice(0, lastStop + 1);
  return window.trimEnd() + '...';
}

/**
 * Run one chat cycle. Returns a WakeOutcome whose `summary` is the
 * Telegram-ready reply. Idempotency is handled upstream in wake-router.
 */
export async function runChatPreset(
  config: Config,
  ctx: WakeContext,
  depsIn: Partial<ChatDeps> = {},
): Promise<WakeOutcome> {
  const deps: ChatDeps = { ...REAL_DEPS, ...depsIn };
  const userMessage = (ctx.message ?? '').trim();

  if (!userMessage) {
    return {
      ok: true,
      status: 'processed',
      intentId: ctx.intentId,
      summary: 'I did not catch a message. Try again?',
    };
  }

  // Provider precedence:
  //   1. chatLlmProviders pool (Groq x3 + Cerebras + OpenRouter + ...).
  //      Production path. Round-robin + cooldown so a single throttled
  //      key doesn't brick chat for the next minute.
  //   2. OpenAI-compat single-key (legacy fallback for minimal configs).
  //
  // Anthropic is intentionally NOT supported here: ANTHROPIC_API_KEY is
  // reserved for Pado's Wavi chatbot and must not be consumed by Nasun
  // AI trading agents. The pool already covers Groq/Cerebras/OpenRouter/
  // DeepSeek/Mistral/SambaNova/Gemini, which is more than enough.
  const pool = config.chatLlmProviders.length > 0 ? getPool(config) : null;
  const useOpenAICompat = !pool && !!(config.llmApiUrl && config.llmApiKey);

  if (!pool && !useOpenAICompat) {
    deps.log(
      '[chat] No LLM credentials set (CHAT_LLM_PROVIDERS or LLM_API_URL+KEY). ' +
      'Returning canned reply.',
    );
    return {
      ok: true,
      status: 'processed',
      intentId: ctx.intentId,
      summary:
        'Chat is not configured for this agent yet. ' +
        'To trade, send "BUY" or "SELL" with an amount.',
    };
  }

  // Best-effort portfolio snapshot. Soft-fail so a transient RPC blip
  // (escrow getDynamicFields was flaky during the 5/22 saturation
  // incident) does not block a casual chat reply. When absent or null,
  // we skip the block entirely — the persona still works as before.
  let portfolio: ChatPortfolio | null = null;
  if (deps.fetchPortfolio) {
    try {
      portfolio = await deps.fetchPortfolio();
    } catch (err) {
      deps.log(`[chat] portfolio fetch failed: ${(err as Error).message}`);
    }
  }
  const personaWithPortfolio = portfolio
    ? `${CHAT_PERSONA_PROMPT}\n\n${renderPortfolioBlock(portfolio)}`
    : CHAT_PERSONA_PROMPT;

  // Load prior turns for this session (TTL-evicted on access). The
  // returned array is the LIVE list; we'll append to it via the store
  // below, not by mutating directly.
  const priorTurns = deps.history.load(ctx.sid, ctx.nowMs);
  const flatPrompt = renderChatPrompt(personaWithPortfolio, priorTurns, userMessage);

  try {
    let content: string;
    let totalTokens: number;
    let durationMs: number;
    let providerLabel: string;

    if (pool) {
      const outcome = await pool.call(flatPrompt, Date.now(), deps.log);
      if (!outcome) {
        deps.log('[chat] all providers in cooldown or failed; canned reply');
        return {
          ok: true,
          status: 'processed',
          intentId: ctx.intentId,
          summary:
            'My chat connections are all rate-limited right now. ' +
            'Try again in about a minute, or send "BUY"/"SELL" to trade.',
        };
      }
      content = outcome.result.content;
      totalTokens = outcome.result.totalTokens;
      durationMs = outcome.result.durationMs;
      providerLabel = `pool:${outcome.providerName}`;
    } else {
      const model = config.llmModel || 'llama-3.3-70b-versatile';
      const result = await deps.callLLM(
        config.llmApiUrl,
        config.llmApiKey,
        model,
        flatPrompt,
      );
      content = result.content;
      totalTokens = result.totalTokens;
      durationMs = result.durationMs;
      providerLabel = 'openai-compat';
    }

    const reply = trimReply(content);
    // Commit BOTH the user turn and the agent reply to history only
    // after a successful reply. If the LLM failed we leave history
    // untouched so the user can retry without polluting the thread
    // with an orphan user line the model never saw.
    deps.history.append(ctx.sid, 'user', userMessage, ctx.nowMs);
    deps.history.append(ctx.sid, 'agent', reply, ctx.nowMs);
    deps.log(
      `[chat] reply ok (provider=${providerLabel} ` +
      `${totalTokens} tok, ${durationMs} ms, turns=${priorTurns.length / 2 | 0}+1, ` +
      `sid=${ctx.sid.slice(0, 8)}...)`,
    );
    return {
      ok: true,
      status: 'processed',
      intentId: ctx.intentId,
      summary: reply,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[chat] LLM call failed: ${msg}`);
    return {
      ok: false,
      status: 'rejected',
      intentId: ctx.intentId,
      reason: `chat_llm_failed: ${msg}`,
      summary: 'I had trouble thinking just now. Try asking again in a moment.',
    };
  }
}
