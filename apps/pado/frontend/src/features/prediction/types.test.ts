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

describe('calculateProbabilityFromOrderbook (Polymarket rule)', () => {
  it('uses mid when spread <= 1000 bps regardless of last trade', () => {
    const ob = makeOrderbook([4900], [5100]); // spread = 200
    const r = calculateProbabilityFromOrderbook(ob, 8000);
    expect(r.yesProbability).toBe(50); // mid = 5000 → 50%
  });

  it('falls back to last trade when spread > 1000 bps', () => {
    const ob = makeOrderbook([3000], [7000]); // spread = 4000
    const r = calculateProbabilityFromOrderbook(ob, 6500);
    expect(r.yesProbability).toBe(65);
  });

  it('uses mid when spread > 1000 bps but no last trade given', () => {
    const ob = makeOrderbook([3000], [7000]);
    const r = calculateProbabilityFromOrderbook(ob, null);
    expect(r.yesProbability).toBe(50); // mid = 5000
  });

  it('uses ask alone when only asks exist', () => {
    const ob = makeOrderbook([], [4000]);
    const r = calculateProbabilityFromOrderbook(ob);
    expect(r.yesProbability).toBe(40);
  });

  it('uses bid alone when only bids exist', () => {
    const ob = makeOrderbook([6000], []);
    const r = calculateProbabilityFromOrderbook(ob);
    expect(r.yesProbability).toBe(60);
  });

  it('falls back to last trade when both sides empty', () => {
    const ob = makeOrderbook([], []);
    const r = calculateProbabilityFromOrderbook(ob, 7500);
    expect(r.yesProbability).toBe(75);
    expect(r.hasRealOrders).toBe(false);
  });

  it('returns 50% default when nothing known', () => {
    const r = calculateProbabilityFromOrderbook(null, null);
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
});
