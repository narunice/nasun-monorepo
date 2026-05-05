import { describe, it, expect } from 'vitest';
import { calculateProbabilityFromOrderbook } from './types';
import type { Orderbook } from './types';

function makeOrderbook(
  bids: number[],
  asks: number[],
): Orderbook {
  const level = (price: number) => ({
    price,
    amount: 1n,
    orders: [],
  });
  return { bids: bids.map(level), asks: asks.map(level) };
}

describe('calculateProbabilityFromOrderbook (Polymarket + Kalshi reciprocal)', () => {
  it('uses mid when spread <= 1000 bps regardless of last trade', () => {
    const ob = makeOrderbook([4900], [5100]); // spread = 200
    const r = calculateProbabilityFromOrderbook(ob, null, 8000);
    expect(r.yesProbability).toBe(50);
  });

  it('falls back to last trade when spread > 1000 bps', () => {
    const ob = makeOrderbook([3000], [7000]); // spread = 4000
    const r = calculateProbabilityFromOrderbook(ob, null, 6500);
    expect(r.yesProbability).toBe(65);
  });

  it('uses mid when spread > 1000 bps but no last trade given', () => {
    const ob = makeOrderbook([3000], [7000]);
    const r = calculateProbabilityFromOrderbook(ob, null, null);
    expect(r.yesProbability).toBe(50);
  });

  it('uses ask alone when only YES asks exist (no NO book)', () => {
    const ob = makeOrderbook([], [4000]);
    const r = calculateProbabilityFromOrderbook(ob);
    expect(r.yesProbability).toBe(40);
  });

  it('uses bid alone when only YES bids exist (no NO book)', () => {
    const ob = makeOrderbook([6000], []);
    const r = calculateProbabilityFromOrderbook(ob);
    expect(r.yesProbability).toBe(60);
  });

  it('falls back to last trade when both sides empty', () => {
    const ob = makeOrderbook([], []);
    const r = calculateProbabilityFromOrderbook(ob, null, 7500);
    expect(r.yesProbability).toBe(75);
    expect(r.hasRealOrders).toBe(false);
  });

  it('returns 50% default when nothing known', () => {
    const r = calculateProbabilityFromOrderbook(null, null, null);
    expect(r.yesProbability).toBe(50);
    expect(r.hasRealOrders).toBe(false);
  });

  it('clamps probabilities to [0.1, 99.9]', () => {
    const ob = makeOrderbook([], [9999]);
    const r = calculateProbabilityFromOrderbook(ob);
    expect(r.yesProbability).toBeCloseTo(99.9);
    expect(r.noProbability).toBeCloseTo(0.1);
  });

  it('noProbability mirrors yesProbability', () => {
    const ob = makeOrderbook([4000], [4500]);
    const r = calculateProbabilityFromOrderbook(ob);
    expect(r.yesProbability + r.noProbability).toBeCloseTo(100);
  });

  // Kalshi reciprocal cases
  it('derives YES ask from NO best bid when YES asks empty', () => {
    const yesOb = makeOrderbook([4000], []); // YES bid 40, no YES ask
    const noOb = makeOrderbook([3500], []); // NO bid 35 → implied YES ask = 65
    const r = calculateProbabilityFromOrderbook(yesOb, noOb);
    // effective bid=4000, ask=6500, spread=2500 > 1000, no last trade → mid
    expect(r.yesProbability).toBe(52.5);
  });

  it('derives YES bid from NO best ask when YES bids empty', () => {
    const yesOb = makeOrderbook([], [6000]); // YES ask 60, no YES bid
    const noOb = makeOrderbook([], [3000]); // NO ask 30 → implied YES bid = 70
    const r = calculateProbabilityFromOrderbook(yesOb, noOb);
    // implied bid=7000 vs no yes bid → effective bid=7000, ask=6000 (crossed)
    // spread = -1000 ≤ 1000 → mid = 6500
    expect(r.yesProbability).toBe(65);
  });

  it('picks the tighter side when both YES and NO orderbooks contribute', () => {
    const yesOb = makeOrderbook([4500], [5500]); // YES bid=45, ask=55
    const noOb = makeOrderbook([4400], [5400]); // implied YES bid=46, ask=56
    // effective bid=max(45, 46)=46, ask=min(55, 56)=55, mid=50.5
    const r = calculateProbabilityFromOrderbook(yesOb, noOb);
    expect(r.yesProbability).toBe(50.5);
  });

  it('uses NO orderbook alone when YES book is empty', () => {
    const noOb = makeOrderbook([3000], [4000]); // NO bid=30, ask=40
    // implied YES bid=10000-4000=6000, implied YES ask=10000-3000=7000
    // mid = 6500
    const r = calculateProbabilityFromOrderbook(null, noOb);
    expect(r.yesProbability).toBe(65);
  });
});
