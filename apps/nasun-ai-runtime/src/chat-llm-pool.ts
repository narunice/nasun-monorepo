/**
 * Multi-provider chat LLM pool with round-robin + fallback chain.
 *
 * Why this exists:
 *   We run general-chat replies (intent_classifier → 'chat' branch) on
 *   rotating free-tier providers (Groq x3, Cerebras, OpenRouter, DeepSeek,
 *   Mistral, SambaNova, Gemini, ...). Each provider has its own rate
 *   limits, often ~30 req/min on the free tier. A single hardcoded
 *   provider would either:
 *     - drain its free quota and brick chat for the next minute, or
 *     - require us to overprovision a paid key just for chit-chat.
 *
 *   Trading-intent messages still flow through the analyst preset which
 *   uses HOST_URL's own inference pipeline; this pool is chat-only.
 *
 * Pool semantics:
 *   - Providers are ordered by env list. Round-robin pointer cycles
 *     across them so consecutive chats don't all hit provider #0.
 *   - On a recoverable failure (HTTP 429, 5xx, network error) the pool
 *     records a short cooldown and tries the next provider. Cooldowns
 *     are in-memory and intentionally lost on process restart -- a
 *     fresh process should retest providers that were briefly throttled.
 *   - When every provider is in cooldown we return null so the caller
 *     can fall back to a canned reply rather than blocking.
 *
 * Why we DON'T parallelize:
 *   Per-message latency matters more than throughput. Burning 2-3 keys
 *   per message would shorten quotas without helping the user.
 *
 * Provider config shape (single JSON env var CHAT_LLM_PROVIDERS):
 *   [
 *     {"name":"groq-1","url":"https://api.groq.com/openai/v1",
 *      "key":"gsk_...","model":"llama-3.3-70b-versatile"},
 *     {"name":"cerebras","url":"https://api.cerebras.ai/v1",
 *      "key":"csk-...","model":"llama-3.3-70b"}
 *   ]
 *
 * All providers must speak the OpenAI-compatible `/chat/completions`
 * shape (POST with {model, messages, max_tokens}). Native APIs that
 * don't (e.g. raw Anthropic Messages) need a separate adapter and are
 * out of scope for the chat preset today.
 */

import { callLLM, type LLMResult } from './llm-client.js';

export interface ChatLLMProvider {
  /** Stable identifier used in logs/cooldown state. */
  name: string;
  /** Base URL (must include trailing /v1 or equivalent; client appends
   *  `/chat/completions`). */
  url: string;
  /** Bearer token / API key. */
  key: string;
  /** Model identifier specific to the provider. */
  model: string;
}

interface ProviderState {
  /** Wall-clock ms until this provider may be tried again. */
  cooldownUntilMs: number;
  /** Last failure for diagnostic logging. */
  lastError?: string;
}

/** Cooldown applied after a recoverable failure. Chosen short enough that
 *  a paused provider returns to the pool within a normal chat session,
 *  long enough to drain any rate-limit window for the typical free-tier
 *  provider (60s windows are the common case). */
const FAILURE_COOLDOWN_MS = 60_000;

/** Hard ceiling on consecutive provider attempts per single chat call.
 *  Capped above the production provider count (9) so a fresh pool can
 *  exhaust every entry exactly once before returning null. The cap
 *  exists to bound the loop, not to throttle. */
const MAX_ATTEMPTS_PER_CALL = 16;

export interface ChatPoolResult {
  result: LLMResult;
  providerName: string;
}

export class ChatLLMPool {
  private readonly providers: ChatLLMProvider[];
  private readonly state = new Map<string, ProviderState>();
  private cursor = 0;

  constructor(providers: ChatLLMProvider[]) {
    this.providers = providers;
    for (const p of providers) {
      this.state.set(p.name, { cooldownUntilMs: 0 });
    }
  }

  get size(): number {
    return this.providers.length;
  }

  /**
   * Try providers in round-robin order, skipping those in cooldown,
   * until one returns a successful LLMResult.
   *
   * Returns null when every provider failed -- callers should surface a
   * canned reply rather than retrying immediately. The `log` callback is
   * invoked for every attempt so operators can see which provider ate a
   * given chat call without enabling DEBUG.
   */
  async call(
    prompt: string,
    now: number = Date.now(),
    log: (msg: string) => void = () => {},
  ): Promise<ChatPoolResult | null> {
    if (this.providers.length === 0) return null;

    const max = Math.min(MAX_ATTEMPTS_PER_CALL, this.providers.length);
    for (let attempt = 0; attempt < max; attempt++) {
      const provider = this.providers[this.cursor % this.providers.length];
      this.cursor = (this.cursor + 1) % this.providers.length;

      const ps = this.state.get(provider.name);
      if (ps && ps.cooldownUntilMs > now) {
        // Still throttled; skip without spending an LLM call.
        continue;
      }

      try {
        // maxRetries: 1 — the pool itself fans out across multiple
        // providers, so retrying within callLLM only delays the
        // fallback (3 attempts * up to 15s backoff = 30s wasted per
        // throttled provider). The pool's own 60s cooldown + next
        // provider is the right backpressure mechanism.
        const result = await callLLM(
          provider.url,
          provider.key,
          provider.model,
          prompt,
          { maxRetries: 1 },
        );
        if (ps) ps.cooldownUntilMs = 0;
        return { result, providerName: provider.name };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.state.set(provider.name, {
          cooldownUntilMs: now + FAILURE_COOLDOWN_MS,
          lastError: msg,
        });
        log(`[chat-pool] ${provider.name} failed -> cooldown ${FAILURE_COOLDOWN_MS}ms: ${truncate(msg)}`);
      }
    }
    return null;
  }

  /** For tests/diagnostics. Returns a snapshot of the in-memory cooldown map. */
  inspectState(): Array<{ name: string; cooldownUntilMs: number; lastError?: string }> {
    return this.providers.map((p) => {
      const s = this.state.get(p.name);
      return {
        name: p.name,
        cooldownUntilMs: s?.cooldownUntilMs ?? 0,
        lastError: s?.lastError,
      };
    });
  }
}

function truncate(s: string, max = 160): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

/**
 * Parse the CHAT_LLM_PROVIDERS env var. Accepts a JSON array of
 * {name, url, key, model}. Skips entries with missing fields and logs
 * a warning rather than throwing -- a malformed entry shouldn't take
 * the whole runtime down at startup; the chat preset will soft-fail to
 * a canned reply if the pool ends up empty.
 */
export function parseProvidersEnv(raw: string | undefined): ChatLLMProvider[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[chat-pool] CHAT_LLM_PROVIDERS is not valid JSON: ${(err as Error).message}`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn('[chat-pool] CHAT_LLM_PROVIDERS must be a JSON array');
    return [];
  }
  const out: ChatLLMProvider[] = [];
  for (const [i, entry] of parsed.entries()) {
    if (!entry || typeof entry !== 'object') {
      console.warn(`[chat-pool] CHAT_LLM_PROVIDERS[${i}] is not an object, skipping`);
      continue;
    }
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === 'string' ? e.name : null;
    const url = typeof e.url === 'string' ? e.url : null;
    const key = typeof e.key === 'string' ? e.key : null;
    const model = typeof e.model === 'string' ? e.model : null;
    if (!name || !url || !key || !model) {
      console.warn(`[chat-pool] CHAT_LLM_PROVIDERS[${i}] missing required fields, skipping`);
      continue;
    }
    out.push({ name, url, key, model });
  }
  return out;
}
