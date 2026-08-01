import { describe, it, expect } from 'vitest';
import { selectTriggerPrice, midPrice, type PriceQuote } from './tpsl-price.js';

const book: PriceQuote = { price: 82.06, bestBid: 81.37, bestAsk: 82.75 };
const oracle: PriceQuote = { price: 62949 };

describe('selectTriggerPrice — book-sourced symbols', () => {
  it('prices a sell off the best bid (the side it executes into)', () => {
    expect(selectTriggerPrice(book, 'sell')).toBe(81.37);
  });

  it('prices a buy off the best ask', () => {
    expect(selectTriggerPrice(book, 'buy')).toBe(82.75);
  });

  it('ignores the mid, so posting a quote on the far side cannot move a trigger', () => {
    // Attacker posts a low ask: mid collapses, best bid is untouched.
    const skewed: PriceQuote = { price: midPrice(81.37, 60), bestBid: 81.37, bestAsk: 60 };
    expect(skewed.price).toBeLessThan(book.price);
    expect(selectTriggerPrice(skewed, 'sell')).toBe(81.37);
  });

  it('returns null when the executing side is empty rather than falling back', () => {
    expect(selectTriggerPrice({ price: 0, bestBid: 0, bestAsk: 82.75 }, 'sell')).toBeNull();
    expect(selectTriggerPrice({ price: 0, bestBid: 81.37, bestAsk: 0 }, 'buy')).toBeNull();
  });

  it('still prices the side that does have a quote', () => {
    expect(selectTriggerPrice({ price: 0, bestBid: 81.37, bestAsk: 0 }, 'sell')).toBe(81.37);
  });
});

describe('selectTriggerPrice — oracle-sourced symbols', () => {
  it('uses the oracle price for both sides', () => {
    expect(selectTriggerPrice(oracle, 'sell')).toBe(62949);
    expect(selectTriggerPrice(oracle, 'buy')).toBe(62949);
  });

  it('treats a zero oracle price as no price', () => {
    expect(selectTriggerPrice({ price: 0 }, 'sell')).toBeNull();
  });
});

describe('selectTriggerPrice — missing quote', () => {
  it('returns null', () => {
    expect(selectTriggerPrice(undefined, 'sell')).toBeNull();
    expect(selectTriggerPrice(undefined, 'buy')).toBeNull();
  });
});

describe('midPrice', () => {
  it('averages a two-sided book', () => {
    expect(midPrice(81.37, 82.75)).toBeCloseTo(82.06, 2);
  });

  it('is 0 when either side is empty', () => {
    expect(midPrice(0, 82.75)).toBe(0);
    expect(midPrice(81.37, 0)).toBe(0);
  });
});
