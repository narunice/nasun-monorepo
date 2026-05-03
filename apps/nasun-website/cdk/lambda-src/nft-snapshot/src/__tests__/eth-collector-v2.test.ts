/**
 * Pure-logic unit tests for eth-collector-v2.
 *
 * Integration validation (DDB writes, Alchemy responses, ownership-verifier
 * compatibility) is performed via the dev dual-run, not here.
 */

// Required by module-init constants in eth-collector-v2.ts.
process.env.OWNERSHIP_TABLE = 'test-ownership';
process.env.COLLECTIONS_TABLE = 'test-collections';
process.env.PROFILES_TABLE = 'test-profiles';
process.env.ALCHEMY_API_KEY = 'test-key';

import {
  shouldSkipCleanup,
  isPreservedNegativeCache,
  chunk,
  __test__,
} from '../eth-collector-v2';

describe('shouldSkipCleanup', () => {
  it('skips when any contract fetch failed', () => {
    expect(
      shouldSkipCleanup({ fetchFailureCount: 1, recordsCount: 100, existingLatestCount: 100 }),
    ).toBe('fetch_failures:1');
    expect(
      shouldSkipCleanup({ fetchFailureCount: 3, recordsCount: 0, existingLatestCount: 0 }),
    ).toBe('fetch_failures:3');
  });

  it('skips when zero records produced', () => {
    expect(
      shouldSkipCleanup({ fetchFailureCount: 0, recordsCount: 0, existingLatestCount: 100 }),
    ).toBe('zero_records');
  });

  it('skips when records dropped > 50% vs existing baseline', () => {
    // 100 baseline, 49 today => 51% drop, blocked.
    expect(
      shouldSkipCleanup({ fetchFailureCount: 0, recordsCount: 49, existingLatestCount: 100 }),
    ).toBe('drop_guard:100->49');
  });

  it('passes when drop is exactly at threshold', () => {
    // (100 - 50) / 100 * 100 = 50; recordsCount === 50 is NOT < 50, so allowed.
    expect(
      shouldSkipCleanup({ fetchFailureCount: 0, recordsCount: 50, existingLatestCount: 100 }),
    ).toBeNull();
  });

  it('ignores drop guard when baseline below MIN_BASELINE', () => {
    // baseline 19 < MIN_COUNT_FOR_DROP_CHECK(20), even huge drop allowed.
    expect(
      shouldSkipCleanup({ fetchFailureCount: 0, recordsCount: 1, existingLatestCount: 19 }),
    ).toBeNull();
  });

  it('passes a healthy run (no fetch failures, similar count)', () => {
    expect(
      shouldSkipCleanup({ fetchFailureCount: 0, recordsCount: 102, existingLatestCount: 100 }),
    ).toBeNull();
  });

  it('matches documented constants', () => {
    expect(__test__.LATEST_DROP_GUARD_PERCENT).toBe(50);
    expect(__test__.LATEST_DROP_GUARD_MIN_BASELINE).toBe(20);
    expect(__test__.BATCH_WRITE_SIZE).toBe(25);
  });
});

describe('isPreservedNegativeCache', () => {
  const NOW = Date.parse('2026-05-03T12:00:00Z');
  const FRESH = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1h ago
  const STALE = new Date(NOW - 25 * 60 * 60 * 1000).toISOString(); // 25h ago

  it('preserves fresh ondemand zero-balance row', () => {
    expect(
      isPreservedNegativeCache(
        { source: 'alchemy-ondemand', totalNftCount: 0, lastUpdatedAt: FRESH },
        NOW,
      ),
    ).toBe(true);
  });

  it('does not preserve stale ondemand row (> 24h)', () => {
    expect(
      isPreservedNegativeCache(
        { source: 'alchemy-ondemand', totalNftCount: 0, lastUpdatedAt: STALE },
        NOW,
      ),
    ).toBe(false);
  });

  it('does not preserve ondemand row with non-zero count', () => {
    expect(
      isPreservedNegativeCache(
        { source: 'alchemy-ondemand', totalNftCount: 1, lastUpdatedAt: FRESH },
        NOW,
      ),
    ).toBe(false);
  });

  it('does not preserve rows from other sources (alchemy / alchemy-holder)', () => {
    expect(
      isPreservedNegativeCache(
        { source: 'alchemy', totalNftCount: 0, lastUpdatedAt: FRESH },
        NOW,
      ),
    ).toBe(false);
    expect(
      isPreservedNegativeCache(
        { source: 'alchemy-holder', totalNftCount: 0, lastUpdatedAt: FRESH },
        NOW,
      ),
    ).toBe(false);
  });

  it('does not preserve when lastUpdatedAt is missing or invalid', () => {
    expect(
      isPreservedNegativeCache({ source: 'alchemy-ondemand', totalNftCount: 0 }, NOW),
    ).toBe(false);
    expect(
      isPreservedNegativeCache(
        { source: 'alchemy-ondemand', totalNftCount: 0, lastUpdatedAt: 'not-a-date' },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('chunk', () => {
  it('splits into BATCH_WRITE_SIZE-sized buckets', () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    const chunks = chunk(items, 25);
    expect(chunks.map((c) => c.length)).toEqual([25, 25, 10]);
    expect(chunks.flat()).toEqual(items);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 25)).toEqual([]);
  });

  it('returns single chunk when input < size', () => {
    expect(chunk([1, 2, 3], 25)).toEqual([[1, 2, 3]]);
  });

  it('rejects non-positive sizes', () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -1)).toThrow();
  });

  it('handles dual-write doubling (BatchWriteItem 25 cap)', () => {
    // 13 records dual-written => 26 items => 2 chunks (25 + 1).
    const dual = Array.from({ length: 13 }, (_, i) => i).flatMap((i) => [i, i + 1000]);
    const chunks = chunk(dual, 25);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(25);
    expect(chunks[1].length).toBe(1);
  });
});
