/**
 * Tests for in-memory cache module.
 * Covers: size bounds, eviction, TTL expiry, deduplication, periodic cleanup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to reset module state between tests
let cached: typeof import('./cache.js').cached;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const mod = await import('./cache.js');
  cached = mod.cached;
});

describe('cached()', () => {
  it('returns cached data on subsequent calls within TTL', async () => {
    let callCount = 0;
    const fn = cached('key1', 5000, async () => {
      callCount++;
      return 'value';
    });

    expect(await fn()).toBe('value');
    expect(await fn()).toBe('value');
    expect(callCount).toBe(1);
  });

  it('refetches after TTL expires', async () => {
    let callCount = 0;
    const fn = cached('key-ttl', 1000, async () => {
      callCount++;
      return `value-${callCount}`;
    });

    expect(await fn()).toBe('value-1');

    // Advance past TTL
    vi.advanceTimersByTime(1100);

    expect(await fn()).toBe('value-2');
    expect(callCount).toBe(2);
  });

  it('deduplicates concurrent requests for the same key', async () => {
    // Use real timers for this test since the async work uses setTimeout
    vi.useRealTimers();

    let callCount = 0;
    const fn = cached('key-dedup', 5000, async () => {
      callCount++;
      // Simulate async work
      await new Promise((r) => setTimeout(r, 50));
      return 'result';
    });

    // Fire multiple concurrent calls
    const [r1, r2, r3] = await Promise.all([fn(), fn(), fn()]);

    expect(r1).toBe('result');
    expect(r2).toBe('result');
    expect(r3).toBe('result');
    expect(callCount).toBe(1);

    // Restore fake timers for subsequent tests
    vi.useFakeTimers();
  });

  it('does not cache on error', async () => {
    let callCount = 0;
    const fn = cached('key-err', 5000, async () => {
      callCount++;
      if (callCount === 1) throw new Error('fail');
      return 'ok';
    });

    await expect(fn()).rejects.toThrow('fail');
    expect(await fn()).toBe('ok');
    expect(callCount).toBe(2);
  });

  it('different keys are independent', async () => {
    const fnA = cached('keyA', 5000, async () => 'A');
    const fnB = cached('keyB', 5000, async () => 'B');

    expect(await fnA()).toBe('A');
    expect(await fnB()).toBe('B');
  });
});

describe('cache eviction', () => {
  it('evicts expired entries when cache grows', async () => {
    // Fill cache with short-lived entries
    for (let i = 0; i < 10; i++) {
      const fn = cached(`evict-${i}`, 500, async () => `val-${i}`);
      await fn();
    }

    // Expire all entries
    vi.advanceTimersByTime(600);

    // Adding a new entry triggers eviction of expired ones
    const fn = cached('evict-new', 5000, async () => 'new');
    await fn();

    // Verify old entries are gone (they should refetch)
    let refetchCount = 0;
    const checkFn = cached('evict-0', 5000, async () => {
      refetchCount++;
      return 'refetched';
    });
    const result = await checkFn();
    expect(result).toBe('refetched');
    expect(refetchCount).toBe(1);
  });

  it('periodic cleanup runs at 60s interval', async () => {
    // Insert an entry with short TTL
    const fn = cached('cleanup-test', 500, async () => 'val');
    await fn();

    // Expire the entry
    vi.advanceTimersByTime(600);

    // Trigger cleanup interval (60 seconds)
    vi.advanceTimersByTime(60_000);

    // The entry should have been cleaned up; refetch happens
    let refetchCount = 0;
    const checkFn = cached('cleanup-test', 5000, async () => {
      refetchCount++;
      return 'new-val';
    });
    expect(await checkFn()).toBe('new-val');
    expect(refetchCount).toBe(1);
  });

  it('evicts oldest entries when exceeding MAX_CACHE_SIZE', async () => {
    // MAX_CACHE_SIZE is 1000; fill cache beyond limit
    // Use a smaller test by filling and checking eviction behavior
    const entries = 1010;
    for (let i = 0; i < entries; i++) {
      const fn = cached(`size-${i}`, 60_000, async () => `val-${i}`);
      await fn();
    }

    // The first entries should have been evicted
    // Verify by checking that fetching them triggers a new call
    let refetchCalled = false;
    const checkFn = cached('size-0', 60_000, async () => {
      refetchCalled = true;
      return 'refetched';
    });
    await checkFn();
    expect(refetchCalled).toBe(true);
  });
});
