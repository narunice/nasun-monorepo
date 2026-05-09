/**
 * Bounded retry/backoff for transient HTTP/RPC failures.
 *
 * Targeted at the activations-cache fetch in ecosystem-cache.ts where a
 * single 503 from admin-api silently dropped freshly-activated NFT holders
 * out of the cache, which then cascaded into the 2026-05-08 snapshot
 * lockout. Wider use is fine but keep retryable-error classification tight:
 * only network-shaped transient errors retry, application-level errors
 * (4xx, validation) propagate immediately.
 */

export interface RetryOptions {
  maxAttempts?: number;   // default 3 (= 1 try + 2 retries)
  baseDelayMs?: number;   // default 1000
  jitterMs?: number;      // default 200
  label: string;          // for log prefix
}

function isRetryableError(err: unknown): boolean {
  // Network/transient HTTP signals only. We deliberately do NOT retry on
  // generic "aborted" because callers may have set their own AbortSignal
  // timeout and want to fail fast.
  const e = err as { message?: string; code?: string; status?: number; name?: string };
  if (e?.status === 503 || e?.status === 502 || e?.status === 504) return true;
  if (e?.code === 'ECONNRESET' || e?.code === 'ETIMEDOUT' || e?.code === 'ENOTFOUND') return true;
  const msg = e?.message ?? '';
  if (/\b50[234]\b/.test(msg)) return true;
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up/i.test(msg)) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 1000;
  const jitter = opts.jitterMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryableError(err)) throw err;
      const delay = base * Math.pow(3, attempt - 1) + Math.random() * jitter;
      console.warn(
        `[${opts.label}] retry ${attempt}/${maxAttempts - 1} after ${delay.toFixed(0)}ms: ${(err as Error).message}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
