interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

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
