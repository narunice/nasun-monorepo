/**
 * Tests for prediction-lp-bot quote computation.
 *
 * Pure functions: midpoint derivation from order book + bid/ask clamping.
 */

import { describe, it, expect } from 'vitest';
import {
  computeMidpoint,
  computeQuotes,
  MAX_PRICE_BPS,
  type BookOrder,
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
