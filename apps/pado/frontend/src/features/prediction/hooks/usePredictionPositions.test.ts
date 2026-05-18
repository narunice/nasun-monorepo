/**
 * Edge-case unit tests for the bucket key helper used by the auto-merge flow.
 *
 * The Position bucket key identifies positions that can be merged. Bugs here
 * would either (a) prevent merging eligible positions or (b) collide positions
 * across markets/sides and corrupt the PTB. Both classes of failure are
 * silent at the type level, so explicit invariant tests matter.
 *
 * The hook itself has React-Query + wallet dependencies; we test the
 * pure key function and simulate the in-hook grouping with the same Map
 * pattern the hook uses.
 */

import { describe, it, expect } from 'vitest';
import { positionBucketKey } from './usePredictionPositions';
import type { Position } from '../types';

const MARKET_A = '0x' + 'a'.repeat(64);
const MARKET_B = '0x' + 'b'.repeat(64);

function makePosition(p: {
  id: string;
  marketId: string;
  isYes: boolean;
  shares?: bigint;
  costBasis?: bigint;
}): Position {
  return {
    id: p.id,
    marketId: p.marketId,
    isYes: p.isYes,
    shares: p.shares ?? 100n,
    costBasis: p.costBasis ?? 100n,
  };
}

describe('positionBucketKey — invariants', () => {
  it('returns a stable string for the same (marketId, isYes)', () => {
    expect(positionBucketKey(MARKET_A, true)).toBe(
      positionBucketKey(MARKET_A, true),
    );
  });

  it('distinguishes YES from NO within the same market', () => {
    expect(positionBucketKey(MARKET_A, true)).not.toBe(
      positionBucketKey(MARKET_A, false),
    );
  });

  it('distinguishes markets within the same side', () => {
    expect(positionBucketKey(MARKET_A, true)).not.toBe(
      positionBucketKey(MARKET_B, true),
    );
  });

  it('does not collide YES/Market-A with NO/Market-B by accident', () => {
    const keys = [
      positionBucketKey(MARKET_A, true),
      positionBucketKey(MARKET_A, false),
      positionBucketKey(MARKET_B, true),
      positionBucketKey(MARKET_B, false),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  it('encodes isYes as a deterministic suffix (Y/N), not boolean toString', () => {
    // Defensive: if someone refactors and uses `${isYes}` (true/false strings),
    // the keys would still be distinct but the suffix length would change.
    // We pin the canonical form so accidental refactors break this test.
    const yKey = positionBucketKey(MARKET_A, true);
    const nKey = positionBucketKey(MARKET_A, false);
    expect(yKey.endsWith(':Y')).toBe(true);
    expect(nKey.endsWith(':N')).toBe(true);
  });
});

/**
 * Mirror the in-hook grouping logic to test it as a pure function. If the
 * hook implementation drifts, this test still pins the contract.
 */
function groupByBucket(positions: Position[]): Map<string, Position[]> {
  const map = new Map<string, Position[]>();
  for (const p of positions) {
    const key = positionBucketKey(p.marketId, p.isYes);
    const arr = map.get(key);
    if (arr) arr.push(p);
    else map.set(key, [p]);
  }
  return map;
}

describe('positionsByBucket grouping — pure function mirror', () => {
  it('produces an empty Map for no positions', () => {
    expect(groupByBucket([]).size).toBe(0);
  });

  it('produces a single 1-element bucket for a single position', () => {
    const pos = makePosition({ id: fakeId(1), marketId: MARKET_A, isYes: true });
    const buckets = groupByBucket([pos]);
    expect(buckets.size).toBe(1);
    expect(buckets.get(positionBucketKey(MARKET_A, true))).toEqual([pos]);
  });

  it('groups three same-bucket positions into one bucket of size 3', () => {
    const ps = [
      makePosition({ id: fakeId(1), marketId: MARKET_A, isYes: true }),
      makePosition({ id: fakeId(2), marketId: MARKET_A, isYes: true }),
      makePosition({ id: fakeId(3), marketId: MARKET_A, isYes: true }),
    ];
    const buckets = groupByBucket(ps);
    expect(buckets.size).toBe(1);
    expect(buckets.get(positionBucketKey(MARKET_A, true))?.length).toBe(3);
  });

  it('separates YES vs NO within the same market', () => {
    const ps = [
      makePosition({ id: fakeId(1), marketId: MARKET_A, isYes: true }),
      makePosition({ id: fakeId(2), marketId: MARKET_A, isYes: false }),
      makePosition({ id: fakeId(3), marketId: MARKET_A, isYes: true }),
    ];
    const buckets = groupByBucket(ps);
    expect(buckets.size).toBe(2);
    expect(buckets.get(positionBucketKey(MARKET_A, true))?.length).toBe(2);
    expect(buckets.get(positionBucketKey(MARKET_A, false))?.length).toBe(1);
  });

  it('separates markets within the same side', () => {
    const ps = [
      makePosition({ id: fakeId(1), marketId: MARKET_A, isYes: true }),
      makePosition({ id: fakeId(2), marketId: MARKET_B, isYes: true }),
    ];
    const buckets = groupByBucket(ps);
    expect(buckets.size).toBe(2);
  });

  it('preserves input order within each bucket', () => {
    const p1 = makePosition({ id: fakeId(1), marketId: MARKET_A, isYes: true });
    const p2 = makePosition({ id: fakeId(2), marketId: MARKET_A, isYes: true });
    const p3 = makePosition({ id: fakeId(3), marketId: MARKET_A, isYes: true });
    const buckets = groupByBucket([p1, p2, p3]);
    const bucket = buckets.get(positionBucketKey(MARKET_A, true))!;
    expect(bucket.map((p) => p.id)).toEqual([p1.id, p2.id, p3.id]);
  });

  it('handles a 4-way fully-fragmented portfolio (2 markets × YES+NO)', () => {
    const ps = [
      makePosition({ id: fakeId(1), marketId: MARKET_A, isYes: true }),
      makePosition({ id: fakeId(2), marketId: MARKET_A, isYes: true }),
      makePosition({ id: fakeId(3), marketId: MARKET_A, isYes: false }),
      makePosition({ id: fakeId(4), marketId: MARKET_B, isYes: true }),
      makePosition({ id: fakeId(5), marketId: MARKET_B, isYes: false }),
      makePosition({ id: fakeId(6), marketId: MARKET_B, isYes: false }),
    ];
    const buckets = groupByBucket(ps);
    expect(buckets.size).toBe(4);
    expect(buckets.get(positionBucketKey(MARKET_A, true))?.length).toBe(2);
    expect(buckets.get(positionBucketKey(MARKET_A, false))?.length).toBe(1);
    expect(buckets.get(positionBucketKey(MARKET_B, true))?.length).toBe(1);
    expect(buckets.get(positionBucketKey(MARKET_B, false))?.length).toBe(2);
  });

  it('handles a 20-element same-bucket batch without bucket explosion', () => {
    const ps = Array.from({ length: 20 }, (_, i) =>
      makePosition({ id: fakeId(i + 1), marketId: MARKET_A, isYes: true }),
    );
    const buckets = groupByBucket(ps);
    expect(buckets.size).toBe(1);
    expect(buckets.get(positionBucketKey(MARKET_A, true))?.length).toBe(20);
  });
});

function fakeId(seed: number): string {
  return '0x' + seed.toString(16).padStart(64, '0');
}
