interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface FailureEntry {
  error: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const failures = new Map<string, FailureEntry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Evict a cached entry by key. Safe to call even when the key is absent.
 * Use when an upstream write (e.g. POST /claim) should make the cached
 * read of the affected resource stale immediately instead of waiting for
 * TTL expiry.
 */
export function invalidate(key: string): void {
  store.delete(key);
  failures.delete(key);
  inflight.delete(key);
}

export interface CacheOptions {
  /**
   * How long to remember a REJECTION, in ms. Within the window every caller
   * gets the same error re-thrown without re-running `fn`.
   *
   * Loaders that would otherwise swallow a failure into an empty result must
   * let it propagate, so `cached()` never memoises a fabricated answer. But a
   * throwing loader with no memo at all is its own problem: an endpoint polled
   * on an interval turns a degraded database into a continuous stream of
   * expensive uncached scans. This is the middle ground -- keep the retry
   * quick relative to the success TTL, but do not re-run the query for every
   * request while the dependency is down.
   */
  negativeTtlMs?: number;
}

export function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts?: CacheOptions,
): () => Promise<T> {
  const negativeTtlMs = opts?.negativeTtlMs ?? 0;
  return async () => {
    const now = Date.now();
    const existing = store.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > now) {
      return existing.data;
    }

    if (negativeTtlMs > 0) {
      const failed = failures.get(key);
      if (failed && failed.expiresAt > now) throw failed.error;
    }

    // Deduplicate concurrent requests for the same key
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = fn()
      .then((data) => {
        store.set(key, { data, expiresAt: Date.now() + ttlMs });
        failures.delete(key);
        return data;
      })
      .catch((err: unknown) => {
        // Only a rejection is remembered here; the success path above is what
        // populates `store`. A failure must never land in `store`, or it would
        // be served as a valid answer for the full success TTL.
        if (negativeTtlMs > 0) {
          failures.set(key, { error: err, expiresAt: Date.now() + negativeTtlMs });
        }
        throw err;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  };
}
