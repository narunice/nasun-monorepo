/**
 * Detect Sui owned-object version conflicts. These surface when the RPC
 * returned a stale object reference (e.g. NUSDC coin) at tx-build time but
 * validators see a newer version, usually because a prior tx in the same
 * wallet just consumed the same object and the indexer lag let a stale
 * reference through.
 */
export function isStaleObjectError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!msg) return false;
  return (
    msg.includes('is not available for consumption') ||
    msg.includes('current version:') ||
    msg.includes('ObjectVersionUnavailableForConsumption') ||
    msg.includes('ObjectNotFound')
  );
}

/**
 * Detect the case where an input object was deleted on-chain before the
 * tx executed. In Crash this means the GameRound was finalized between
 * tx build and submit. Not retriable: the object is gone for good.
 *
 * Two surface shapes:
 *  - SDK build-time (resolveObjectReferences): "The following input
 *    objects are invalid: {\"code\":\"deleted\",\"object_id\":...}"
 *  - Validator execution-time: "InputObjectDeleted" / "ObjectDeleted".
 */
export function isInputObjectDeletedError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!msg) return false;
  return (
    msg.includes('InputObjectDeleted') ||
    msg.includes('ObjectDeleted') ||
    (msg.includes('input objects are invalid') && msg.includes('"code":"deleted"'))
  );
}

/**
 * Run an async tx pipeline (fetch coins → build → sign → execute) with
 * retries on stale-object errors. The pipeline must be idempotent at the
 * application layer: only stale-version rejections trigger retry, so a
 * successful first attempt is never re-executed.
 *
 * Uses backoff (500ms, 1200ms, 2500ms) — sequential lottery claims hit the
 * same gas / shared-state churn and a single 350ms retry was not enough.
 */
export async function withStaleObjectRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  const delays = [500, 1200, 2500];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isStaleObjectError(err)) throw err;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
