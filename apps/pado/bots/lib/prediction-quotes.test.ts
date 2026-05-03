/**
 * Tests for prediction-lp-bot quote computation.
 *
 * Pure functions: midpoint derivation from order book + bid/ask clamping.
 */

import { describe, it, expect } from 'vitest';
import {
  computeMidpoint,
  computeQuotes,
  computeLadder,
  complementLadder,
  applyEma,
  applyInventorySkew,
  MAX_PRICE_BPS,
  type BookOrder,
  type LadderParams,
} from './prediction-quotes.js';

const ME = '0xme';
const ALICE = '0xalice';
const BOB = '0xbob';

function order(
  isBid: boolean,
  price: number,
  owner: string,
  orderId = 1,
): BookOrder {
  return { orderId, owner, isBid, price, amount: 1n };
}

describe('computeMidpoint', () => {
  it('averages best external bid and best external ask', () => {
    const bids = [order(true, 4000, ALICE), order(true, 4500, BOB)];
    const asks = [order(false, 5500, ALICE), order(false, 5800, BOB)];
    expect(computeMidpoint(bids, asks, ME)).toBe(5000);
  });

  it("excludes the LP's own orders", () => {
    const bids = [order(true, 4500, ALICE), order(true, 9000, ME)];
    const asks = [order(false, 5500, BOB), order(false, 1000, ME)];
    // Without exclusion: bid=9000, ask=1000, crossed -> nonsense.
    // With exclusion: bid=4500, ask=5500, mid=5000.
    expect(computeMidpoint(bids, asks, ME)).toBe(5000);
  });

  it('returns 5000 when external book is empty', () => {
    expect(computeMidpoint([], [], ME)).toBe(5000);
  });

  it("returns 5000 when only LP's own orders exist", () => {
    const bids = [order(true, 4500, ME)];
    const asks = [order(false, 5500, ME)];
    expect(computeMidpoint(bids, asks, ME)).toBe(5000);
  });

  it('nudges upward when only external bids exist', () => {
    const bids = [order(true, 6000, ALICE)];
    expect(computeMidpoint(bids, [], ME)).toBe(6050);
  });

  it('nudges downward when only external asks exist', () => {
    const asks = [order(false, 6000, ALICE)];
    expect(computeMidpoint([], asks, ME)).toBe(5950);
  });

  it('clamps upward nudge to MAX_PRICE_BPS - 1', () => {
    const bids = [order(true, MAX_PRICE_BPS - 10, ALICE)];
    expect(computeMidpoint(bids, [], ME)).toBe(MAX_PRICE_BPS - 1);
  });

  it('clamps downward nudge to 1', () => {
    const asks = [order(false, 10, ALICE)];
    expect(computeMidpoint([], asks, ME)).toBe(1);
  });

  it('rounds half-integer midpoint to nearest integer', () => {
    const bids = [order(true, 4999, ALICE)];
    const asks = [order(false, 5002, ALICE)];
    // (4999 + 5002) / 2 = 5000.5 -> 5001 (Math.round half-up)
    expect(computeMidpoint(bids, asks, ME)).toBe(5001);
  });

  it('picks highest bid and lowest ask among multiple', () => {
    const bids = [
      order(true, 1000, ALICE),
      order(true, 4000, ALICE),
      order(true, 4800, BOB),
    ];
    const asks = [
      order(false, 8000, ALICE),
      order(false, 5300, ALICE),
      order(false, 5200, BOB),
    ];
    expect(computeMidpoint(bids, asks, ME)).toBe(5000);
  });
});

describe('computeQuotes', () => {
  it('symmetric spread around midpoint (even spread)', () => {
    expect(computeQuotes(5000, 200)).toEqual({ bidBps: 4900, askBps: 5100 });
  });

  it('half rounds down for odd spread', () => {
    // half = floor(201/2) = 100
    expect(computeQuotes(5000, 201)).toEqual({ bidBps: 4900, askBps: 5100 });
  });

  it('clamps bid at 1 when midpoint - half < 1', () => {
    expect(computeQuotes(50, 200)).toEqual({ bidBps: 1, askBps: 150 });
  });

  it('clamps ask at MAX_PRICE_BPS - 1 when midpoint + half > MAX-1', () => {
    expect(computeQuotes(9950, 200)).toEqual({
      bidBps: 9850,
      askBps: MAX_PRICE_BPS - 1,
    });
  });

  it('forces minimum half-spread of 1 even when spreadBps is 0 or negative', () => {
    // Math.max(1, floor(0/2)) = 1
    expect(computeQuotes(5000, 0)).toEqual({ bidBps: 4999, askBps: 5001 });
    expect(computeQuotes(5000, -50)).toEqual({ bidBps: 4999, askBps: 5001 });
  });
});

describe('applyEma', () => {
  it('returns the new mid as-is when prevEma is null', () => {
    expect(applyEma(null, 5200, 0.3)).toBe(5200);
  });

  it('weights new and prev by lambda', () => {
    // 0.3 * 5300 + 0.7 * 5000 = 1590 + 3500 = 5090
    expect(applyEma(5000, 5300, 0.3)).toBe(5090);
  });

  it('lambda=1 ignores prev (no smoothing)', () => {
    expect(applyEma(5000, 6000, 1)).toBe(6000);
  });

  it('lambda=0 freezes at prev', () => {
    expect(applyEma(5000, 6000, 0)).toBe(5000);
  });

  it('clamps lambda outside [0,1]', () => {
    expect(applyEma(5000, 6000, 2)).toBe(6000);
    expect(applyEma(5000, 6000, -1)).toBe(5000);
  });
});

describe('applyInventorySkew', () => {
  it('zero delta -> no shift', () => {
    expect(applyInventorySkew(5000, 0n, 1000n, 200)).toBe(5000);
  });

  it('yes-heavy pushes mid down', () => {
    // ratio = 500/1000 = 0.5; shift = -200 * 0.5 = -100
    expect(applyInventorySkew(5000, 500n, 1000n, 200)).toBe(4900);
  });

  it('no-heavy pushes mid up', () => {
    expect(applyInventorySkew(5000, -500n, 1000n, 200)).toBe(5100);
  });

  it('clamps ratio at +/- 1 (delta exceeds cap)', () => {
    // |ratio| capped at 1, shift = -200
    expect(applyInventorySkew(5000, 5000n, 1000n, 200)).toBe(4800);
    expect(applyInventorySkew(5000, -5000n, 1000n, 200)).toBe(5200);
  });

  it('alpha=0 disables skew', () => {
    expect(applyInventorySkew(5000, 500n, 1000n, 0)).toBe(5000);
  });

  it('cap=0 disables skew (avoid div-by-zero)', () => {
    expect(applyInventorySkew(5000, 500n, 0n, 200)).toBe(5000);
  });

  it('clamps result to legal price range', () => {
    // mid=50 + shift(+10000) = 10050 -> clamped to MAX-1
    expect(applyInventorySkew(50, -1000n, 1000n, 10000)).toBe(MAX_PRICE_BPS - 1);
    // mid=9950 + shift(-10000) = -50 -> clamped to 1
    expect(applyInventorySkew(9950, 1000n, 1000n, 10000)).toBe(1);
  });
});

describe('computeLadder', () => {
  const baseParams: LadderParams = {
    levels: 5,
    baseSpreadBps: 100,
    levelGapBps: 50,
    gapGrowth: 1,
    baseSizeNusdc: 25,
    sizeGrowth: 1,
  };

  it('produces K levels per side at expected prices (uniform gap, uniform size)', () => {
    const ladder = computeLadder(5000, baseParams);
    expect(ladder.bids.map((l) => l.priceBps)).toEqual([4900, 4850, 4800, 4750, 4700]);
    expect(ladder.asks.map((l) => l.priceBps)).toEqual([5100, 5150, 5200, 5250, 5300]);
    expect(ladder.bids.every((l) => l.sizeNusdc === 25)).toBe(true);
    expect(ladder.asks.every((l) => l.sizeNusdc === 25)).toBe(true);
  });

  it('grows gap and size geometrically when growth > 1', () => {
    const ladder = computeLadder(5000, {
      levels: 4,
      baseSpreadBps: 100,
      levelGapBps: 50,
      gapGrowth: 2,
      baseSizeNusdc: 10,
      sizeGrowth: 2,
    });
    // cumGap progression: 0, 50, 50+100=150, 150+200=350
    // bids: mid - (100 + cumGap) = 4900, 4850, 4750, 4550
    expect(ladder.bids.map((l) => l.priceBps)).toEqual([4900, 4850, 4750, 4550]);
    expect(ladder.asks.map((l) => l.priceBps)).toEqual([5100, 5150, 5250, 5450]);
    // sizes: 10, 20, 40, 80
    expect(ladder.bids.map((l) => l.sizeNusdc)).toEqual([10, 20, 40, 80]);
  });

  it('returns empty when levels <= 0', () => {
    expect(computeLadder(5000, { ...baseParams, levels: 0 })).toEqual({ bids: [], asks: [] });
  });

  it('clamps prices to legal range and dedupes', () => {
    // mid=50, baseSpread=100 -> bid=-50 -> clamped to 1
    // levels=5 with gap=50 will all clamp to 1 -> dedupe to single entry
    const ladder = computeLadder(50, baseParams);
    expect(ladder.bids).toEqual([{ priceBps: 1, sizeNusdc: 25 }]);
  });

  it('clamps high-side prices to MAX-1 and dedupes', () => {
    const ladder = computeLadder(MAX_PRICE_BPS - 50, baseParams);
    expect(ladder.asks).toEqual([{ priceBps: MAX_PRICE_BPS - 1, sizeNusdc: 25 }]);
  });
});

describe('complementLadder', () => {
  it('mirrors YES ladder to NO via MAX_PRICE complement (bids<->asks swapped)', () => {
    const yesLadder = computeLadder(5000, {
      levels: 3,
      baseSpreadBps: 100,
      levelGapBps: 50,
      gapGrowth: 1,
      baseSizeNusdc: 25,
      sizeGrowth: 1,
    });
    const noLadder = complementLadder(yesLadder);
    // YES bids 4900/4850/4800 -> NO asks 5100/5150/5200
    // YES asks 5100/5150/5200 -> NO bids 4900/4850/4800
    expect(noLadder.bids.map((l) => l.priceBps)).toEqual([4900, 4850, 4800]);
    expect(noLadder.asks.map((l) => l.priceBps)).toEqual([5100, 5150, 5200]);
  });

  it('preserves sizes', () => {
    const yesLadder = computeLadder(5000, {
      levels: 3,
      baseSpreadBps: 100,
      levelGapBps: 50,
      gapGrowth: 1,
      baseSizeNusdc: 10,
      sizeGrowth: 2,
    });
    const noLadder = complementLadder(yesLadder);
    // YES bid sizes 10/20/40 -> NO ask sizes (mirror) 10/20/40
    expect(noLadder.asks.map((l) => l.sizeNusdc)).toEqual([10, 20, 40]);
    expect(noLadder.bids.map((l) => l.sizeNusdc)).toEqual([10, 20, 40]);
  });
});
