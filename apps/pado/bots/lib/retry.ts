/**
 * Exponential backoff retry utility for bot RPC calls.
 *
 * Prevents cascading failures when RPC is temporarily unavailable.
 * Default: 3 retries with 1s base delay (1s, 2s, 4s).
 *
 * Non-retriable errors (object lock conflicts, equivocation, version
 * mismatch) are thrown immediately without retry to avoid hammering
 * the fullnode with transactions that will never succeed.
 */

const NON_RETRIABLE_PATTERNS = [
  'non-retriable',
  'LockConflict',
  'already locked by a different transaction',
  'not available for consumption',
  'equivocation',
];

// Transient HTTP/network failures that resolve on their own without
// requiring process restart. Used by per-market error handlers to
// classify whether a failure should bump the suicide counter or be
// silently retried on the next tick.
const TRANSIENT_RPC_PATTERNS = [
  /\bHTTP 5\d\d\b/,
  /Unexpected status code: 5\d\d/,
  /Service (Temporarily )?Unavailable/i,
  /fetch failed/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /EAI_AGAIN/,
  /socket hang up/i,
  /TimeoutError/,
  /AbortError/,
];

function isNonRetriable(error: Error): boolean {
  const msg = error.message;
  return NON_RETRIABLE_PATTERNS.some((p) => msg.includes(p));
}

/**
 * True for transient HTTP 5xx / network failures from the fullnode RPC.
 * Callers use this to decide whether an error should bump a
 * "consecutive failures" counter (no, just retry next tick) or be
 * treated as a real bug that warrants a pm2 restart.
 *
 * Object-lock conflicts (handled separately by isNonRetriable) are
 * also transient in the per-tick sense -- a different tx grabbed the
 * coin first, the next tick will re-fetch. They're listed here so
 * tick-level handlers can also classify them as warn-only.
 */
export function isTransientRpcError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (TRANSIENT_RPC_PATTERNS.some((p) => p.test(msg))) return true;
  // Lock conflicts and "not available for consumption" version-mismatch
  // errors clear on the next tick once the validators settle, so for
  // tick-level callers they're transient too. (withRetry still treats
  // them as non-retriable because in-flight tx retry would double-spend.)
  if (
    msg.includes('LockConflict') ||
    msg.includes('already locked by a different transaction') ||
    msg.includes('not available for consumption')
  ) return true;
  return false;
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
          `[retry] ${label} failed with non-retriable error, skipping retries: ${lastError.message}`
        );
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `[retry] ${label} failed (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}. Retrying in ${delay}ms...`
        );
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.warn(
          `[retry] ${label} failed (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}`
        );
      }
    }
  }

  throw lastError;
}
