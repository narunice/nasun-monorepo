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
  client: OpenAI;
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
// 2026-05-21 audit (rebuilt after live trace showed 7/7 providers failing
// simultaneously at 12:44 KST):
//   - groq        kept first: fastest when within 100k TPD free quota.
//   - mistral     promoted: most reliable free completion in the 5/20 window.
//   - gemini      promoted + model id refreshed (`2.0-flash` is deprecated,
//                 use `2.5-flash`); huge free RPD quota.
//   - openrouter  flaky 429 but free Llama 70B; mid-chain.
//   - sambanova   needs key refresh (5/20 logs show `D41c3e*****5e36` =>
//                 401). Kept in chain so it self-heals once key is rotated.
//   - cerebras    DOWNGRADED from `llama3.3-70b` (chronic 404 -- no longer
//                 in public catalog) to `llama3.1-8b`. 8B quality drift is
//                 acceptable as a last-quality fallback; better than a
//                 hard-skip slot.
//   - deepseek    last: paid balance required (chronic 402); only useful
//                 if operator funds it.
//
// All providers map to a Llama-3.3-70B-class output (or closest available);
// gemini-2.5-flash and llama3.1-8b are quality-degraded fallbacks. The
// chain is the safety net -- one bad slot is fine, the next succeeds.
const FALLBACK_CHAIN: Record<string, ProviderModel[]> = {
  'llama-3.3-70b-versatile': [
    { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    { provider: 'mistral',    model: 'mistral-small-latest' },
    { provider: 'gemini',     model: 'gemini-2.5-flash' },
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
    { provider: 'sambanova',  model: 'Meta-Llama-3.3-70B-Instruct' },
    { provider: 'cerebras',   model: 'llama3.1-8b' },
    { provider: 'deepseek',   model: 'deepseek-chat' },
  ],
};

// Initialized provider instances (populated by initProviders).
const providers: Record<string, InitializedProvider> = {};

/**
 * Initialize all providers for which an API key is available. Missing keys
 * silently skip that provider; the fallback chain just gets shorter. At
 * least one provider must end up initialized.
 *
 * maxRetries:0 disables OpenAI SDK's internal exponential-backoff so the
 * outer fallback loop owns retry semantics. Without this, a 5xx would
 * burn budget on internal retries before advancing to the next provider.
 */
export function initProviders(keys: Record<string, string | null | undefined>): void {
  for (const [providerName, config] of Object.entries(PROVIDER_CATALOG)) {
    const apiKey = keys[providerName];
    if (!apiKey) continue;
    providers[providerName] = {
      client: new OpenAI({
        apiKey,
        baseURL: config.baseURL,
        maxRetries: 0,
      }),
      name: providerName,
    };
    console.log(`[AI] Provider initialized: ${providerName}`);
  }
  const initializedCount = Object.keys(providers).length;
  if (initializedCount === 0) {
    throw new Error('No AI providers initialized -- at least one API key required');
  }
  console.log(`[AI] ${initializedCount} provider(s) ready: ${Object.keys(providers).join(', ')}`);
  // Surface the actual runtime chain per canonical model so operators can
  // audit "what will be tried in what order" without grepping source. Slots
  // whose provider has no SSM key are tagged `(skip)` so a missing key is
  // visible at cold start, not only when chain exhaustion happens.
  for (const [canonicalModel, chain] of Object.entries(FALLBACK_CHAIN)) {
    const planned = chain
      .map(({ provider, model }) =>
        providers[provider] ? `${provider}:${model}` : `${provider}:${model}(skip)`,
      )
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
  const errors: { provider: string; err: unknown }[] = [];

  for (const { provider: providerName, model: providerModel } of chain) {
    if (opts?.signal?.aborted) {
      throw new Error('AI completion aborted by caller before chain exhaustion');
    }
    const provider = providers[providerName];
    if (!provider) {
      // Key not configured — silently skip. Logged at init time.
      continue;
    }

    console.log(`[AI] Trying ${providerName} (model=${providerModel})`);
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
      const response = await provider.client.chat.completions.create(
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
        throw new Error(`Provider ${providerName} returned empty content`);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[AI] Completion via ${providerName} finished in ${elapsed}ms (after ${errors.length} fallback(s))`);

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
      console.warn(`[AI] ${providerName} failed (status=${status ?? 'n/a'}): ${msg}`);
      errors.push({ provider: providerName, err });
      if (!isFallbackEligibleError(err)) {
        // Auth or hard error — re-throw so operator notices the
        // misconfigured key instead of silently masking it.
        throw err;
      }
      // else fall through to next provider
    } finally {
      clearTimeout(timeout);
      if (opts?.signal) opts.signal.removeEventListener('abort', onCallerAbort);
    }
  }

  // Distinguish "every configured provider failed" from "no providers
  // configured at all". The classifyError() path in index.ts matches the
  // substring "429" or "rate_limit"; when chain exhaustion is dominated by
  // non-429 errors (auth, chronic 404, etc.) the rate-limit user message is
  // misleading. Include the status histogram so operators can triage from
  // the user-visible error string.
  const summary = errors
    .map((e) => `${e.provider}=${(e.err as { status?: number }).status ?? 'err'}`)
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
