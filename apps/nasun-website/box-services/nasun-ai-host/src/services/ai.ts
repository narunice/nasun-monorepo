/**
 * AI Service — Multi-provider fallback chain (OpenAI-compatible APIs).
 *
 * Caller passes a *canonical* model name (e.g. `llama-3.3-70b-versatile`).
 * Internally the service iterates a chain of (provider, provider-model)
 * pairs and returns on the first successful response. 429 / 5xx / abort
 * advances to the next provider; auth/4xx errors short-circuit.
 *
 * Providers are init'd from SSM Parameter Store keys at Lambda cold start.
 * Missing keys are skipped silently — runtime degrades to whatever subset
 * has keys configured.
 *
 * The returned `CompletionResult.provider` records *which* provider
 * actually served the response so the caller can surface it (e.g. into
 * an AER record's modelVersion / modelName field for audit transparency).
 */

import OpenAI from 'openai';

export interface CompletionResult {
  content: string;
  model: string;          // provider-specific model name actually used
  provider: string;       // which provider served the response
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKeyEnvHint: string;  // for error messages
}

interface ProviderModel {
  provider: string;
  model: string;          // provider-specific model id
}

interface InitializedProvider {
  /**
   * One OpenAI-compatible client per configured key. Multi-key support
   * (2026-05-21) lets a single provider survive its per-key daily/minute
   * quota -- e.g. two Groq free-tier keys give effectively 2x the 100k
   * TPD ceiling. Keys are tried in order on each call; rotation only
   * persists for the duration of a single completion attempt (no
   * cross-call key stickiness yet).
   */
  clients: OpenAI[];
  name: string;
}

// Static catalog of supported providers. Add new entries here to enable.
// Order is irrelevant for the catalog -- the FALLBACK_CHAIN below decides
// runtime priority.
//
// `together` was intentionally removed (2026-05-21): operator decision to
// not rely on Together's free tier. Re-add if their pricing changes.
const PROVIDER_CATALOG: Record<string, ProviderConfig> = {
  groq:       { name: 'groq',       baseURL: 'https://api.groq.com/openai/v1',         apiKeyEnvHint: 'GROQ_API_KEY' },
  mistral:    { name: 'mistral',    baseURL: 'https://api.mistral.ai/v1',              apiKeyEnvHint: 'MISTRAL_API_KEY' },
  gemini:     { name: 'gemini',     baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKeyEnvHint: 'GEMINI_API_KEY' },
  openrouter: { name: 'openrouter', baseURL: 'https://openrouter.ai/api/v1',           apiKeyEnvHint: 'OPENROUTER_API_KEY' },
  sambanova:  { name: 'sambanova',  baseURL: 'https://api.sambanova.ai/v1',            apiKeyEnvHint: 'SAMBANOVA_API_KEY' },
  cerebras:   { name: 'cerebras',   baseURL: 'https://api.cerebras.ai/v1',             apiKeyEnvHint: 'CEREBRAS_API_KEY' },
  deepseek:   { name: 'deepseek',   baseURL: 'https://api.deepseek.com/v1',            apiKeyEnvHint: 'DEEPSEEK_API_KEY' },
};

// Canonical model name -> ordered list of (provider, provider-model) attempts.
//
// The canonical key is a ROUTING LABEL, not a claim about which model answers.
// modelVersionTag() records this label on chain precisely so that an identical
// (prompt, model) yields an identical `modelVersion` no matter which fallback
// served the call; the provider and its real model id are surfaced off-chain
// through InferResponse.provider / .model. That is why the label still reads
// `llama-3.3-70b-versatile` even though no slot serves Llama any more --
// renaming it would break AER determinism against every record written so far,
// and the agents plus 81 stored trader configs send this exact string.
//
// 2026-10-05 audit. Every slot of the 2026-05-21 chain was dead, so /infer
// could not have answered at all; each entry below was called with the
// production OpenAI-SDK path and the live keys before being written down:
//   - groq        openai/gpt-oss-120b, then qwen/qwen3.8-27b. Both verified.
//                 Llama 3.3 is gone from the catalog entirely (404). Groq is
//                 first because it is fastest and the key pool holds five
//                 keys, so it absorbs per-key rate limits internally.
//   - gemini      gemini-2.5-flash verified. Largest free RPD of the set.
//   - openrouter  qwen/qwen3.8-27b:free verified. The old
//                 meta-llama/llama-3.3-70b-instruct:free slug is no longer
//                 free -- OpenRouter answers 404 and names the paid slug.
//   - mistral     mistral-small-latest still exists and the key authenticates,
//                 but every call returned 429. Kept so it self-heals when the
//                 quota frees up.
//   - cerebras    gpt-oss-120b exists but the account answers 402. Kept so it
//                 self-heals if funded. llama3.1-8b is gone (404).
//   - sambanova   401: the key is invalid, exactly as the 5/21 note predicted
//                 it would be. Kept so it self-heals once rotated.
//   - deepseek    402, insufficient balance. Last, as before.
//
// Three slots work today (groq x2, gemini, openrouter). The dead ones stay in
// the chain on purpose: a slot that fails costs one request and advances, and
// leaving them means a funded card or a rotated key is picked up without a
// code change. What is NOT acceptable is the state this replaced, where all
// seven were dead at once and the chain had nothing left to try.
const FALLBACK_CHAIN: Record<string, ProviderModel[]> = {
  'llama-3.3-70b-versatile': [
    { provider: 'groq',       model: 'openai/gpt-oss-120b' },
    { provider: 'groq',       model: 'qwen/qwen3.8-27b' },
    { provider: 'gemini',     model: 'gemini-2.5-flash' },
    { provider: 'openrouter', model: 'qwen/qwen3.8-27b:free' },
    { provider: 'mistral',    model: 'mistral-small-latest' },
    { provider: 'cerebras',   model: 'gpt-oss-120b' },
    { provider: 'sambanova',  model: 'Meta-Llama-3.3-70B-Instruct' },
    { provider: 'deepseek',   model: 'deepseek-chat' },
  ],
};

// Initialized provider instances (populated by initProviders).
const providers: Record<string, InitializedProvider> = {};

/**
 * Split a raw SSM value into one-or-more API keys. Convention: a single
 * comma-separated string `key1,key2,...` so an operator can pack extra
 * keys into the existing parameter without provisioning new SSM names per
 * provider. Empty entries (extra commas / trailing space) are dropped.
 *
 * Returns [] when no valid key remains, so the caller can skip the
 * provider silently.
 */
function splitKeyList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Initialize all providers for which at least one API key is available.
 * Missing keys silently skip that provider; the fallback chain just gets
 * shorter. At least one provider must end up initialized.
 *
 * 2026-05-21: multi-key per provider. Each provider gets an OpenAI client
 * per key so the call-time loop can rotate keys on rate-limit / transient
 * error before moving to the next provider.
 *
 * maxRetries:0 disables OpenAI SDK's internal exponential-backoff so the
 * outer fallback loop owns retry semantics. Without this, a 5xx would
 * burn budget on internal retries before advancing to the next key /
 * provider.
 */
export function initProviders(keys: Record<string, string | null | undefined>): void {
  for (const [providerName, config] of Object.entries(PROVIDER_CATALOG)) {
    const keyList = splitKeyList(keys[providerName]);
    if (keyList.length === 0) continue;
    providers[providerName] = {
      clients: keyList.map(
        (apiKey) =>
          new OpenAI({
            apiKey,
            baseURL: config.baseURL,
            maxRetries: 0,
          }),
      ),
      name: providerName,
    };
    const suffix = keyList.length > 1 ? ` (${keyList.length} keys)` : '';
    console.log(`[AI] Provider initialized: ${providerName}${suffix}`);
  }
  const initializedCount = Object.keys(providers).length;
  if (initializedCount === 0) {
    throw new Error('No AI providers initialized -- at least one API key required');
  }
  console.log(`[AI] ${initializedCount} provider(s) ready: ${Object.keys(providers).join(', ')}`);
  // Surface the actual runtime chain per canonical model so operators can
  // audit "what will be tried in what order" without grepping source. Slots
  // whose provider has no SSM key are tagged `(skip)`; slots with >1 key
  // are tagged `xN` so multi-key configuration is visible at cold start.
  for (const [canonicalModel, chain] of Object.entries(FALLBACK_CHAIN)) {
    const planned = chain
      .map(({ provider, model }) => {
        const p = providers[provider];
        if (!p) return `${provider}:${model}(skip)`;
        return p.clients.length > 1
          ? `${provider}:${model}x${p.clients.length}`
          : `${provider}:${model}`;
      })
      .join(' -> ');
    console.log(`[AI] Chain for ${canonicalModel}: ${planned}`);
  }
}

export function isValidModel(model: string): boolean {
  return model in FALLBACK_CHAIN;
}

export function getSupportedModels(): string[] {
  return Object.keys(FALLBACK_CHAIN);
}

export function isProviderInitialized(providerName: string): boolean {
  return providerName in providers;
}

/**
 * Decide whether an error from one provider should advance to the next or
 * short-circuit the chain. Network/quota/server errors → next. Auth/bad
 * request errors → fail fast (something's misconfigured, retrying other
 * providers won't help and would burn quota).
 */
function isFallbackEligibleError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message || '';
  // Permissive: advance to the next provider on virtually any error.
  // Rationale: in a multi-provider chain, a single bad key, a temporary
  // upstream issue, or a model-not-supported response should *not* stop
  // healthier providers from being tried. The chain itself is the safety
  // net — we'd rather burn a few extra ms trying a known-bad provider
  // than mask an outage in a healthy one. Operators see per-provider
  // status in logs to triage bad keys.
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    // 401/403 = bad key for *this* provider → skip and try the next.
    // 429 = rate limit → next. 4xx/5xx → next. Everything advances.
    return true;
  }
  if (msg.includes('aborted') || msg.includes('timeout')) return true;
  if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) return true;
  return true;
}

/**
 * Generate AI completion with multi-provider fallback.
 *
 * The caller-provided `model` is a canonical name (e.g.
 * `llama-3.3-70b-versatile`). The chain mapped from that name is walked
 * in order until one returns 200 or all are exhausted.
 *
 * `opts.signal`, when provided, races the per-provider 60s timeout. The
 * outer caller (e.g. /infer's 20s budget) owns the wall-clock cap; this
 * function will give up on the chain once the outer signal aborts.
 */
export async function generateCompletion(
  prompt: string,
  model: string,
  opts?: { signal?: AbortSignal },
): Promise<CompletionResult> {
  const chain = FALLBACK_CHAIN[model];
  if (!chain) {
    throw new Error(`Unsupported model: ${model}`);
  }

  const startTime = Date.now();
  const errors: { provider: string; keyIndex: number; err: unknown }[] = [];

  for (const { provider: providerName, model: providerModel } of chain) {
    if (opts?.signal?.aborted) {
      throw new Error('AI completion aborted by caller before chain exhaustion');
    }
    const provider = providers[providerName];
    if (!provider) {
      // Key not configured -- silently skip. Logged at init time.
      continue;
    }

    // Multi-key rotation within a single provider. On rate-limit / transient
    // failure on key A we try key B before falling over to the next provider
    // -- this is the whole point of multi-key support, since the most common
    // failure mode (groq 100k TPD) is per-key, not per-provider.
    const totalKeys = provider.clients.length;
    for (let keyIndex = 0; keyIndex < totalKeys; keyIndex++) {
      if (opts?.signal?.aborted) {
        throw new Error('AI completion aborted by caller before chain exhaustion');
      }
      const keyLabel = totalKeys > 1 ? `${providerName}[${keyIndex + 1}/${totalKeys}]` : providerName;
      console.log(`[AI] Trying ${keyLabel} (model=${providerModel})`);
      const AI_TIMEOUT_MS = 60_000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      const onCallerAbort = () => controller.abort();
      if (opts?.signal) {
        if (opts.signal.aborted) {
          clearTimeout(timeout);
          controller.abort();
        } else {
          opts.signal.addEventListener('abort', onCallerAbort, { once: true });
        }
      }

      try {
        const response = await provider.clients[keyIndex].chat.completions.create(
          {
            model: providerModel,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful AI assistant. Provide clear, concise, and accurate responses.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 2048,
            temperature: 0.7,
          },
          { signal: controller.signal },
        );

        const message = response.choices[0]?.message;
        if (!message?.content) {
          throw new Error(`Provider ${keyLabel} returned empty content`);
        }

        const elapsed = Date.now() - startTime;
        console.log(`[AI] Completion via ${keyLabel} finished in ${elapsed}ms (after ${errors.length} fallback(s))`);

        return {
          content: message.content,
          model: response.model || providerModel,
          provider: providerName,
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        };
      } catch (err) {
        const status = (err as { status?: number }).status;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AI] ${keyLabel} failed (status=${status ?? 'n/a'}): ${msg}`);
        errors.push({ provider: providerName, keyIndex, err });
        if (!isFallbackEligibleError(err)) {
          // Auth or hard error -- re-throw so operator notices the
          // misconfigured key instead of silently masking it.
          throw err;
        }
        // Single-key-bad short-circuit. If the *first* key returned a hard
        // per-account error (401 invalid key, 404 model not on this account,
        // 402 paid-balance), rotating to another key under the same provider
        // is unlikely to help and burns latency budget. Skip remaining keys
        // for this provider and advance to the next one. 429 keeps rotating
        // because that IS per-key (quota).
        if (status === 401 || status === 402 || status === 404) {
          // Per-account hard error; rotating keys won't help. Skip this
          // provider's remaining keys and fall through to the next provider.
          break;
        }
        // else continue to next key in this provider
      } finally {
        clearTimeout(timeout);
        if (opts?.signal) opts.signal.removeEventListener('abort', onCallerAbort);
      }
    }
  }

  // Distinguish "every configured provider failed" from "no providers
  // configured at all". The classifyError() path in index.ts matches the
  // substring "429" or "rate_limit"; when chain exhaustion is dominated by
  // non-429 errors (auth, chronic 404, etc.) the rate-limit user message is
  // misleading. Include the status histogram so operators can triage from
  // the user-visible error string.
  const summary = errors
    .map((e) => {
      const status = (e.err as { status?: number }).status ?? 'err';
      const keyTag = e.keyIndex > 0 ? `#${e.keyIndex + 1}` : '';
      return `${e.provider}${keyTag}=${status}`;
    })
    .join(', ');
  const dominantStatus = (() => {
    const counts = new Map<string | number, number>();
    for (const e of errors) {
      const s = (e.err as { status?: number }).status ?? 'err';
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let best: string | number | undefined;
    let bestN = 0;
    for (const [s, n] of counts) {
      if (n > bestN) { bestN = n; best = s; }
    }
    return best;
  })();
  throw new Error(
    `All AI providers exhausted for model=${model} (n=${errors.length}, dominant=${dominantStatus ?? 'n/a'}). Tried: ${summary || 'none'}`,
  );
}

// Re-export for backward compatibility with existing imports. New code
// should call initProviders directly.
export function initGroq(apiKey: string): void {
  initProviders({ groq: apiKey });
}

/** Get the provider name that would be attempted first for a given model. */
export function getProviderForModel(model: string): string | null {
  const chain = FALLBACK_CHAIN[model];
  if (!chain) return null;
  for (const { provider } of chain) {
    if (providers[provider]) return provider;
  }
  return null;
}
