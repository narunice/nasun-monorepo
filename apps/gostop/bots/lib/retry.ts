/**
 * Exponential backoff retry utility for bot RPC calls.
 * Same logic as apps/pado/bots/lib/retry.ts. Non-retriable errors
 * (object lock, version mismatch, equivocation) abort immediately.
 */

const NON_RETRIABLE_PATTERNS = [
  'non-retriable',
  'LockConflict',
  'already locked by a different transaction',
  'not available for consumption',
  'equivocation',
];

function isNonRetriable(error: Error): boolean {
  const msg = error.message;
  return NON_RETRIABLE_PATTERNS.some((p) => msg.includes(p));
}

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

      if (isNonRetriable(lastError)) {
        console.error(
          `[retry] ${label} failed with non-retriable error, skipping retries: ${lastError.message}`,
        );
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `[retry] ${label} failed (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}. Retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.warn(
          `[retry] ${label} failed (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}`,
        );
      }
    }
  }

  throw lastError;
}
