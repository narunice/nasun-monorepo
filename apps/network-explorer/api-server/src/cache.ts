interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Evict a cached entry by key. Safe to call even when the key is absent.
 * Use when an upstream write (e.g. POST /claim) should make the cached
 * read of the affected resource stale immediately instead of waiting for
 * TTL expiry.
 */
export function invalidate(key: string): void {
  store.delete(key);
  inflight.delete(key);
}

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    const now = Date.now();
    const existing = store.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > now) {
      return existing.data;
    }

    // Deduplicate concurrent requests for the same key
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = fn()
      .then((data) => {
        store.set(key, { data, expiresAt: Date.now() + ttlMs });
        return data;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  };
}
