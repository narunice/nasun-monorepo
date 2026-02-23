/**
 * Lambda Executor API client
 *
 * Based on useCreateRequest.ts (L178-186) pattern
 */

export interface ExecuteResult {
  success: boolean;
  result?: string;
  error?: string;
  digest?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const FETCH_TIMEOUT_MS = 60_000; // Lambda API Gateway max 29s + generous buffer

/**
 * Call Lambda /execute endpoint to run AI inference + on-chain settlement
 */
export async function executeRequest(
  lambdaUrl: string,
  apiKey: string,
  requestId: number,
  prompt: string,
  model: string
): Promise<ExecuteResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${lambdaUrl}/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            requestId,
            // Field name matches Lambda API contract; base64-encoded, not encrypted
            // (TLS provides transport security; TEE mode uses actual encryption)
            encryptedPrompt: Buffer.from(prompt).toString('base64'),
            model,
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
        if (attempt < MAX_RETRIES) {
          console.warn(`[executor] Attempt ${attempt}/${MAX_RETRIES} failed: ${lastError}`);
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        return { success: false, error: lastError };
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        success: true,
        result: data.result as string | undefined,
        digest: data.digest as string | undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        console.warn(`[executor] Attempt ${attempt}/${MAX_RETRIES} failed: ${lastError}`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  return { success: false, error: lastError ?? 'All retries exhausted' };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
