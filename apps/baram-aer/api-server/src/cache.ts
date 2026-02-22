interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const MAX_CACHE_SIZE = 1000;
const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// Evict expired entries and oldest if over size limit
function evictIfNeeded(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  // If still over limit, remove oldest entries (first inserted = Map iteration order)
  if (store.size > MAX_CACHE_SIZE) {
    const excess = store.size - MAX_CACHE_SIZE;
    let removed = 0;
    for (const key of store.keys()) {
      if (removed >= excess) break;
      store.delete(key);
      removed++;
    }
  }
}

// Periodic cleanup every 60 seconds
const _cleanupInterval = setInterval(evictIfNeeded, 60_000);
// Allow process to exit without waiting for this timer
if (typeof _cleanupInterval.unref === 'function') _cleanupInterval.unref();

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
        evictIfNeeded();
        store.set(key, { data, expiresAt: Date.now() + ttlMs });
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });

    inflight.set(key, promise);
    return promise;
  };
}
