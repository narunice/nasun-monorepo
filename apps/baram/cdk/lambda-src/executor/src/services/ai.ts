/**
 * AI Service — Groq (OpenAI-compatible API)
 */

import OpenAI from 'openai';

export interface CompletionResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface AIProvider {
  client: OpenAI;
  name: string;
}

// Provider instances
const providers: Record<string, AIProvider> = {};

// Model → Provider mapping
// Kept in sync with MODEL_PRICING in types.ts — every model here must have a price entry.
const MODEL_PROVIDER_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile': 'groq',
};

/**
 * Initialize Groq provider (OpenAI-compatible).
 *
 * maxRetries:0 disables the SDK's internal exponential-backoff retry. Lambda
 * callers race a hard AbortSignal (e.g. /infer's 20s budget) and SDK-side
 * retries would silently extend wall time past that budget.
 */
export function initGroq(apiKey: string): void {
  providers['groq'] = {
    client: new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      maxRetries: 0,
    }),
    name: 'groq',
  };
  console.log('[AI] Provider initialized: groq');
}

/**
 * Check if a model is supported
 */
export function isValidModel(model: string): boolean {
  return model in MODEL_PROVIDER_MAP;
}

/**
 * Get list of supported models
 */
export function getSupportedModels(): string[] {
  return Object.keys(MODEL_PROVIDER_MAP);
}

/**
 * Get provider name for a model
 */
export function getProviderForModel(model: string): string | null {
  return MODEL_PROVIDER_MAP[model] || null;
}

/**
 * Check if a provider is initialized
 */
export function isProviderInitialized(providerName: string): boolean {
  return providerName in providers;
}

/**
 * Generate AI completion.
 *
 * When `opts.signal` is provided, that signal races the internal 60s timeout
 * so the caller can enforce a tighter budget (e.g. /infer's 20s window).
 * Chat path callers omit `opts` and inherit the original 60s default.
 */
export async function generateCompletion(
  prompt: string,
  model: string,
  opts?: { signal?: AbortSignal }
): Promise<CompletionResult> {
  const providerName = MODEL_PROVIDER_MAP[model];
  if (!providerName) {
    throw new Error(`Unsupported model: ${model}`);
  }

  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Provider not initialized: ${providerName}. Available: ${Object.keys(providers).join(', ')}`);
  }

  const startTime = Date.now();
  console.log(`[AI] Starting completion with model: ${model} (provider: ${providerName})`);

  // 60s default timeout to prevent Lambda resource waste on API hangs.
  // A caller-supplied AbortSignal races this; the earliest abort wins.
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

  let response;
  try {
    response = await provider.client.chat.completions.create(
      {
        model,
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
  } finally {
    clearTimeout(timeout);
    if (opts?.signal) opts.signal.removeEventListener('abort', onCallerAbort);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[AI] Completion finished in ${elapsed}ms`);

  const message = response.choices[0]?.message;
  if (!message?.content) {
    throw new Error('No content in AI response');
  }

  return {
    content: message.content,
    model: response.model,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
}
