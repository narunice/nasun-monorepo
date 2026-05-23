/**
 * OpenAI Chat Completions compatible LLM client
 *
 * Supports: OpenAI, Groq, Together, Ollama, and any OpenAI-compatible API.
 */

export interface LLMResult {
  content: string;
  model: string;
  totalTokens: number;
  durationMs: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
  model: string;
  usage?: {
    total_tokens?: number;
  };
}

const FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 5_000;

export interface CallLLMOptions {
  /** Override the retry count. Defaults to 3 (5s/10s/15s backoff).
   *  The chat preset's provider pool passes 1 because retrying a single
   *  throttled key here delays moving to the next provider; the pool
   *  itself fans out across N providers with its own cooldown. */
  maxRetries?: number;
}

/**
 * Call an OpenAI-compatible Chat Completions API
 */
export async function callLLM(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  options: CallLLMOptions = {},
): Promise<LLMResult> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
        lastError = `HTTP ${response.status}: ${truncated}`;

        // Don't retry on 4xx client errors (except 429 rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`LLM API error: ${lastError}`);
        }

        if (attempt < maxRetries) {
          console.warn(`[llm] Attempt ${attempt}/${maxRetries} failed: ${lastError}`);
          await sleep(BASE_RETRY_DELAY_MS * attempt);
          continue;
        }
        throw new Error(`LLM API failed after ${maxRetries} attempts: ${lastError}`);
      }

      const data = await response.json() as ChatCompletionResponse;
      const durationMs = Date.now() - startTime;

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('LLM API returned empty response (no choices[0].message.content)');
      }

      return {
        content,
        model: data.model || model,
        totalTokens: data.usage?.total_tokens ?? 0,
        durationMs,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Non-retryable errors: 4xx client errors, empty responses — re-throw immediately
      if (errMsg.startsWith('LLM API error:') || errMsg.startsWith('LLM API returned empty')) {
        throw err;
      }

      // Abort errors (timeout)
      if (errMsg.includes('aborted') || errMsg.includes('AbortError')) {
        lastError = `LLM API timeout (${FETCH_TIMEOUT_MS}ms)`;
      } else {
        lastError = errMsg;
      }

      if (attempt < maxRetries) {
        console.warn(`[llm] Attempt ${attempt}/${maxRetries} failed: ${lastError}`);
        await sleep(BASE_RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  throw new Error(`LLM API failed after ${maxRetries} attempts: ${lastError}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

