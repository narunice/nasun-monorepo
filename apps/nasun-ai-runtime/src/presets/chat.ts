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

Do not:
- Output JSON, code fences, or any structured envelope.
- Promise market predictions or financial outcomes.
- Mention "AER", "Budget", "Capability", or internal plumbing.`;

export interface ChatDeps {
  callLLM: typeof defaultCallLLM;
  log: (msg: string) => void;
}

const REAL_DEPS: ChatDeps = {
  callLLM: defaultCallLLM,
  log: (msg) => {
    const ts = new Date().toLocaleString('en-US');
    console.log(`[${ts}] ${msg}`);
  },
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

  // Persona + user turn baked into one prompt because callLLM (and the
  // pool's underlying providers) all expose a single-message shape today.
  const flatPrompt = [
    CHAT_PERSONA_PROMPT,
    '',
    `User: ${userMessage}`,
    'Agent:',
  ].join('\n');

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
    deps.log(
      `[chat] reply ok (provider=${providerLabel} ` +
      `${totalTokens} tok, ${durationMs} ms, sid=${ctx.sid.slice(0, 8)}...)`,
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
