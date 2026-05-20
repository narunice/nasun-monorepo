import { describe, it, expect } from 'vitest';
import {
  calculateProbabilityFromOrderbook,
  calculateProbabilityFromBestPrices,
} from './types';
import type { Orderbook, BestPrices } from './types';

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
    // last trade counts as a real quote — UI should show the number, not "—"
    expect(r.hasRealQuotes).toBe(true);
  });

  it('returns 50% default when nothing known', () => {
    const r = calculateProbabilityFromOrderbook(null, null, null);
    expect(r.yesProbability).toBe(50);
    expect(r.hasRealQuotes).toBe(false);
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
    // implied bid=7000 vs no yes bid → effective bid=7000, ask=6000 (crossed
    // by -1000). Cross branch prefers the ask (taker-facing) over the mid,
    // because a taker buying YES meets 6000 (60%), not 6500.
    expect(r.yesProbability).toBe(60);
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

  it('uses ask (not mid) when book is crossed', () => {
    // Symmetric cross from 2026-05-20 incident on legacy market
    // 0xe2b5327c...: yesBid 6100, yesAsk 5100, noBid 6100, noAsk 5000.
    // effective bid = max(6100, 10000-5000=5000) = 6100
    // effective ask = min(5100, 10000-6100=3900) = 3900
    // spread = -2200 (crossed); mid would collapse to 50, pinned regardless
    // of taker activity. Expect the effective ask (39%) instead.
    const yesOb = makeOrderbook([6100], [5100]);
    const noOb = makeOrderbook([6100], [5000]);
    const r = calculateProbabilityFromOrderbook(yesOb, noOb);
    expect(r.yesProbability).toBe(39);
    expect(r.hasRealQuotes).toBe(true);
  });

  it('prefers last trade over ask when crossed and last trade is known', () => {
    const yesOb = makeOrderbook([6100], [5100]);
    const noOb = makeOrderbook([6100], [5000]);
    const r = calculateProbabilityFromOrderbook(yesOb, noOb, 5500);
    expect(r.yesProbability).toBe(55);
  });
});

describe('calculateProbabilityFromBestPrices (inline best-quartet)', () => {
  const empty: BestPrices = { yesBid: null, yesAsk: null, noBid: null, noAsk: null };

  it('mirrors the 48.3/51.7 case from the bug report (NO bid only)', () => {
    // NO bid 5170 → implied YES ask 4830, no other quotes.
    const bp: BestPrices = { yesBid: null, yesAsk: null, noBid: 5170, noAsk: null };
    const r = calculateProbabilityFromBestPrices(bp);
    expect(r.yesProbability).toBeCloseTo(48.3);
    expect(r.noProbability).toBeCloseTo(51.7);
    expect(r.hasRealQuotes).toBe(true);
  });

  it('uses tight YES mid when spread <= 1000 bps', () => {
    const bp: BestPrices = { yesBid: 4900, yesAsk: 5100, noBid: null, noAsk: null };
    const r = calculateProbabilityFromBestPrices(bp);
    expect(r.yesProbability).toBe(50);
    expect(r.hasRealQuotes).toBe(true);
  });

  it('falls back to last trade when spread > 1000 bps', () => {
    const bp: BestPrices = { yesBid: 3000, yesAsk: 7000, noBid: null, noAsk: null };
    const r = calculateProbabilityFromBestPrices(bp, 6500);
    expect(r.yesProbability).toBe(65);
  });

  it('combines YES and NO into the tightest effective spread', () => {
    // YES bid 45, ask 55; NO bid 44 → implied YES ask 56; NO ask 54 → implied YES bid 46.
    const bp: BestPrices = { yesBid: 4500, yesAsk: 5500, noBid: 4400, noAsk: 5400 };
    const r = calculateProbabilityFromBestPrices(bp);
    // effective bid=max(4500, 4600)=4600, ask=min(5500, 5600)=5500, mid=5050
    expect(r.yesProbability).toBe(50.5);
  });

  it('reports no real quotes and defaults to 50 when nothing is known', () => {
    const r = calculateProbabilityFromBestPrices(empty, null);
    expect(r.yesProbability).toBe(50);
    expect(r.hasRealQuotes).toBe(false);
  });

  it('treats a known last trade as a real quote even with empty book', () => {
    const r = calculateProbabilityFromBestPrices(empty, 7500);
    expect(r.yesProbability).toBe(75);
    expect(r.hasRealQuotes).toBe(true);
  });

  it('uses ask alone when only YES asks exist', () => {
    const bp: BestPrices = { yesBid: null, yesAsk: 4000, noBid: null, noAsk: null };
    const r = calculateProbabilityFromBestPrices(bp);
    expect(r.yesProbability).toBe(40);
  });
});
