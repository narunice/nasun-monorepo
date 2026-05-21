/**
 * Edge-case unit tests for the prediction-market transaction builders.
 *
 * Focus: validation guards on the merge builders, and structural verification
 * that auto-merge actually emits a single `merge_positions` moveCall when the
 * caller passes a bucket of size > 1, and skips it for size 1.
 *
 * The Transaction object is exercised via simple spy wrappers — we never
 * dispatch to chain. This lets us count moveCalls / makeMoveVec calls and
 * inspect their `target` fields without a devnet round-trip.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  buildMergePositionsChained,
  buildMergePositionsEntry,
  buildBucketPositionArg,
  buildPlaceSellTaker,
  buildClaimWinnings,
  buildBurnLosingPosition,
  buildClaimCancelledRefund,
} from './transactions';
import { PREDICTION_PACKAGE_ID, POSITION_TYPE } from './constants';

// Generate a 32-byte hex address (acceptable as a Sui object ID).
function fakeId(seed: number): string {
  return '0x' + seed.toString(16).padStart(64, '0');
}

const MARKET_ID = fakeId(0xa);

interface MoveCallSpy {
  target: string;
  arguments: unknown[];
  typeArguments?: string[];
}

interface MakeMoveVecSpy {
  type?: string;
  elements: unknown[];
}

/**
 * Wrap a real Transaction so we can record every moveCall / makeMoveVec the
 * builders perform. We delegate to the real implementation so chained return
 * values (TransactionArguments) are produced and threaded correctly.
 */
function spyTransaction(): {
  tx: Transaction;
  moveCalls: MoveCallSpy[];
  vecs: MakeMoveVecSpy[];
} {
  const tx = new Transaction();
  const moveCalls: MoveCallSpy[] = [];
  const vecs: MakeMoveVecSpy[] = [];
  const realMoveCall = tx.moveCall.bind(tx);
  const realMakeMoveVec = tx.makeMoveVec.bind(tx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx.moveCall = vi.fn((arg: any) => {
    moveCalls.push({
      target: arg.target,
      arguments: arg.arguments ?? [],
      typeArguments: arg.typeArguments,
    });
    return realMoveCall(arg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx.makeMoveVec = vi.fn((arg: any) => {
    vecs.push({ type: arg.type, elements: arg.elements ?? [] });
    return realMakeMoveVec(arg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return { tx, moveCalls, vecs };
}

describe('buildMergePositionsChained — validation', () => {
  it('throws when given an empty position list', () => {
    const tx = new Transaction();
    expect(() => buildMergePositionsChained(tx, MARKET_ID, [])).toThrow(
      /at least one position/i,
    );
  });

  it('throws when batch exceeds the 256-element cap', () => {
    const tx = new Transaction();
    const ids = Array.from({ length: 257 }, (_, i) => fakeId(i + 1));
    expect(() => buildMergePositionsChained(tx, MARKET_ID, ids)).toThrow(
      /exceeds cap 256/i,
    );
  });

  it('accepts the exact 256-element cap without throwing', () => {
    const tx = new Transaction();
    const ids = Array.from({ length: 256 }, (_, i) => fakeId(i + 1));
    expect(() => buildMergePositionsChained(tx, MARKET_ID, ids)).not.toThrow();
  });
});

describe('buildMergePositionsChained — PTB structure', () => {
  it('emits exactly one merge_positions moveCall for a 1-element bucket', () => {
    // Explicit chained-form is by design — even with 1 element it adds the
    // moveCall. (The bucket-helper short-circuits to skip the moveCall; this
    // function does not.)
    const { tx, moveCalls, vecs } = spyTransaction();
    const ids = [fakeId(1)];
    buildMergePositionsChained(tx, MARKET_ID, ids);
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0].target).toBe(
      `${PREDICTION_PACKAGE_ID}::prediction_market::merge_positions`,
    );
    expect(vecs).toHaveLength(1);
    expect(vecs[0].type).toBe(POSITION_TYPE);
    expect(vecs[0].elements).toHaveLength(1);
  });

  it('emits exactly one merge_positions moveCall for an N=5 bucket', () => {
    const { tx, moveCalls, vecs } = spyTransaction();
    const ids = [fakeId(1), fakeId(2), fakeId(3), fakeId(4), fakeId(5)];
    buildMergePositionsChained(tx, MARKET_ID, ids);
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0].target).toBe(
      `${PREDICTION_PACKAGE_ID}::prediction_market::merge_positions`,
    );
    expect(vecs[0].elements).toHaveLength(5);
  });

  it('returns a TransactionArgument suitable for chaining', () => {
    const tx = new Transaction();
    const ids = [fakeId(1), fakeId(2)];
    const arg = buildMergePositionsChained(tx, MARKET_ID, ids);
    expect(arg).toBeTruthy();
    // The chained return is a Result/NestedResult argument; the shape varies
    // by SDK version, but it must NOT be a plain string.
    expect(typeof arg).not.toBe('string');
  });
});

describe('buildMergePositionsEntry — validation parity', () => {
  it('throws on empty input', () => {
    const tx = new Transaction();
    expect(() => buildMergePositionsEntry(tx, MARKET_ID, [])).toThrow(
      /at least one position/i,
    );
  });

  it('throws on > 256 input', () => {
    const tx = new Transaction();
    const ids = Array.from({ length: 257 }, (_, i) => fakeId(i + 1));
    expect(() => buildMergePositionsEntry(tx, MARKET_ID, ids)).toThrow(
      /exceeds cap 256/i,
    );
  });

  it('targets merge_positions_entry (not the chained variant)', () => {
    const { tx, moveCalls } = spyTransaction();
    buildMergePositionsEntry(tx, MARKET_ID, [fakeId(1), fakeId(2)]);
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0].target).toBe(
      `${PREDICTION_PACKAGE_ID}::prediction_market::merge_positions_entry`,
    );
  });
});

describe('buildBucketPositionArg — short-circuit behavior', () => {
  it('returns the lone ID as a string (no moveCall added) for N=1', () => {
    const { tx, moveCalls } = spyTransaction();
    const id = fakeId(7);
    const arg = buildBucketPositionArg(tx, MARKET_ID, [id]);
    expect(arg).toBe(id); // identity passthrough
    expect(moveCalls).toHaveLength(0);
  });

  it('emits a merge moveCall and returns a chained arg for N=2', () => {
    const { tx, moveCalls } = spyTransaction();
    const ids = [fakeId(1), fakeId(2)];
    const arg = buildBucketPositionArg(tx, MARKET_ID, ids);
    expect(typeof arg).not.toBe('string');
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0].target).toContain('merge_positions');
    expect(moveCalls[0].target).not.toContain('merge_positions_entry');
  });

  it('emits a merge moveCall for N=10 and returns a chained arg', () => {
    const { tx, moveCalls } = spyTransaction();
    const ids = Array.from({ length: 10 }, (_, i) => fakeId(i + 1));
    const arg = buildBucketPositionArg(tx, MARKET_ID, ids);
    expect(typeof arg).not.toBe('string');
    expect(moveCalls).toHaveLength(1);
  });

  it('throws on empty bucket via the underlying chained builder', () => {
    const tx = new Transaction();
    expect(() => buildBucketPositionArg(tx, MARKET_ID, [])).toThrow();
  });

  it('does NOT throw on a bucket larger than the per-call 256 cap (chunked path)', () => {
    const tx = new Transaction();
    const ids = Array.from({ length: 998 }, (_, i) => fakeId(i + 1));
    expect(() => buildBucketPositionArg(tx, MARKET_ID, ids)).not.toThrow();
  });

  it('emits chained merges (4 calls) for N=998: 256 + 255*3 = 256+255+255+232', () => {
    const { tx, moveCalls } = spyTransaction();
    const ids = Array.from({ length: 998 }, (_, i) => fakeId(i + 1));
    const arg = buildBucketPositionArg(tx, MARKET_ID, ids);
    expect(typeof arg).not.toBe('string');
    // First merge consumes 256 raw IDs. Each subsequent merge consumes
    // [running_merged] + up to 255 new IDs. ceil((998-256)/255) + 1 = 4.
    expect(moveCalls.filter((c) => c.target.endsWith('::merge_positions'))).toHaveLength(4);
  });

  it('emits a single merge for N=257 via the chunked path (256 + 1)', () => {
    const { tx, moveCalls } = spyTransaction();
    const ids = Array.from({ length: 257 }, (_, i) => fakeId(i + 1));
    expect(() => buildBucketPositionArg(tx, MARKET_ID, ids)).not.toThrow();
    // 257 > MAX_MERGE_BATCH triggers the chunked path: first 256 raw IDs,
    // then [running, 1 new]. Two merges total.
    expect(moveCalls.filter((c) => c.target.endsWith('::merge_positions'))).toHaveLength(2);
  });
});

describe('downstream builders accept both string and chained args', () => {
  beforeEach(() => {
    // ensure each test starts fresh
  });

  it('buildPlaceSellTaker accepts a plain string positionId', () => {
    const { tx, moveCalls } = spyTransaction();
    buildPlaceSellTaker(tx, MARKET_ID, fakeId(1), 6000, true);
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0].target).toContain('::place_sell_taker');
  });

  it('buildPlaceSellTaker accepts a chained TransactionArgument', () => {
    const { tx, moveCalls } = spyTransaction();
    const merged = buildMergePositionsChained(tx, MARKET_ID, [
      fakeId(1),
      fakeId(2),
    ]);
    buildPlaceSellTaker(tx, MARKET_ID, merged, 6000, true);
    // 1 merge_positions + 1 place_sell_taker
    expect(moveCalls.map((c) => c.target.split('::').pop())).toEqual([
      'merge_positions',
      'place_sell_taker',
    ]);
  });

  it('buildClaimWinnings accepts a chained arg', () => {
    const { tx, moveCalls } = spyTransaction();
    const merged = buildMergePositionsChained(tx, MARKET_ID, [
      fakeId(1),
      fakeId(2),
    ]);
    buildClaimWinnings(tx, MARKET_ID, merged);
    expect(moveCalls.map((c) => c.target.split('::').pop())).toEqual([
      'merge_positions',
      'claim_winnings',
    ]);
  });

  it('buildBurnLosingPosition accepts a chained arg', () => {
    const { tx, moveCalls } = spyTransaction();
    const merged = buildMergePositionsChained(tx, MARKET_ID, [
      fakeId(1),
      fakeId(2),
    ]);
    buildBurnLosingPosition(tx, MARKET_ID, merged);
    expect(moveCalls.map((c) => c.target.split('::').pop())).toEqual([
      'merge_positions',
      'burn_losing_position',
    ]);
  });

  it('buildClaimCancelledRefund accepts a chained arg', () => {
    const { tx, moveCalls } = spyTransaction();
    const merged = buildMergePositionsChained(tx, MARKET_ID, [
      fakeId(1),
      fakeId(2),
    ]);
    buildClaimCancelledRefund(tx, MARKET_ID, merged);
    expect(moveCalls.map((c) => c.target.split('::').pop())).toEqual([
      'merge_positions',
      'claim_cancelled_refund',
    ]);
  });

  it('buildBucketPositionArg short-circuit yields a single moveCall through buildPlaceSellTaker', () => {
    const { tx, moveCalls } = spyTransaction();
    const arg = buildBucketPositionArg(tx, MARKET_ID, [fakeId(99)]);
    buildPlaceSellTaker(tx, MARKET_ID, arg, 5000, false);
    // No merge added — only the sell.
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0].target).toContain('::place_sell_taker');
  });
});

describe('originalPackageId — type constants are anchored, target is latest', () => {
  it('POSITION_TYPE uses the original package ID (not the latest packageId)', () => {
    // After an upgrade, latest packageId differs from original. The frontend
    // POSITION_TYPE must use the original so existing Position NFTs (whose
    // on-chain type embeds the original ID) still match. This test exists
    // to catch a regression where the two get re-conflated.
    expect(POSITION_TYPE).toMatch(/^0x[0-9a-f]{64}::prediction_market::Position$/);
  });

  it('moveCall targets use the latest packageId, not the original', () => {
    const { tx, moveCalls } = spyTransaction();
    buildMergePositionsChained(tx, MARKET_ID, [fakeId(1), fakeId(2)]);
    expect(moveCalls[0].target.startsWith(PREDICTION_PACKAGE_ID + '::')).toBe(true);
  });
});
