/**
 * Exponential backoff retry utility for bot RPC calls.
 *
 * Prevents cascading failures when RPC is temporarily unavailable.
 * Default: 3 retries with 1s base delay (1s, 2s, 4s).
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  label?: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, label = 'operation' } = options;
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `[retry] ${label} failed (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}. Retrying in ${delay}ms...`
      );
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}
