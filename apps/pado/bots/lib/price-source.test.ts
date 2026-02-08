/**
 * Price Source Module Tests
 *
 * Tests price validation and price change calculation.
 * (fetchPrice is not tested as it requires live API)
 */

import { describe, it, expect } from 'vitest';
import { validatePrice, priceChangeBps } from './price-source.js';

// ========================================
// validatePrice
// ========================================

describe('validatePrice', () => {
  it('returns true for price within bounds', () => {
    expect(validatePrice(100000, 50000, 200000)).toBe(true);
  });

  it('returns true at exact boundaries', () => {
    expect(validatePrice(50000, 50000, 200000)).toBe(true);
    expect(validatePrice(200000, 50000, 200000)).toBe(true);
  });

  it('returns false below minimum', () => {
    expect(validatePrice(49999, 50000, 200000)).toBe(false);
  });

  it('returns false above maximum', () => {
    expect(validatePrice(200001, 50000, 200000)).toBe(false);
  });

  it('works with ETH-range prices', () => {
    expect(validatePrice(2500, 1000, 10000)).toBe(true);
    expect(validatePrice(500, 1000, 10000)).toBe(false);
  });

  it('works with SOL-range prices', () => {
    expect(validatePrice(150, 10, 1000)).toBe(true);
    expect(validatePrice(5, 10, 1000)).toBe(false);
  });
});

// ========================================
// priceChangeBps
// ========================================

describe('priceChangeBps', () => {
  it('returns 0 for no change', () => {
    expect(priceChangeBps(100000, 100000)).toBe(0);
  });

  it('calculates 1% change correctly', () => {
    // 100000 → 101000 = 1% = 100 bps
    expect(priceChangeBps(100000, 101000)).toBe(100);
  });

  it('treats decreases as absolute change', () => {
    // 100000 → 99000 = 1% = 100 bps
    expect(priceChangeBps(100000, 99000)).toBe(100);
  });

  it('returns 0 when old price is 0', () => {
    expect(priceChangeBps(0, 100)).toBe(0);
  });

  it('handles small changes', () => {
    // 100000 → 100050 = 0.05% = 5 bps
    expect(priceChangeBps(100000, 100050)).toBe(5);
  });
});
