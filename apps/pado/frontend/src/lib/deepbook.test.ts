/**
 * DeepBook V3 Utility Tests
 * Covers: price/quantity conversion, validation, snapToTick, min calculations, edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  formatQuantity,
  priceToRaw,
  quantityToRaw,
  validatePrice,
  validateQuantity,
  validateOrder,
  getMinQuantity,
  getMinPrice,
  snapToTick,
  formatMinQuantity,
  formatMinPrice,
} from './deepbook';
import type { PoolConfig } from '../features/trading/types';

// ========================================
// Test Pool Configs
// ========================================
const NBTC_POOL: PoolConfig = {
  id: '0x' + 'a'.repeat(64),
  baseToken: { symbol: 'NBTC', name: 'Nasun BTC', decimals: 8, type: '0x::nbtc::NBTC' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 100000,   // $0.10 raw (10^5 at 6 decimals)
  lotSize: 1000,       // 0.00001 BTC (10^3 at 8 decimals)
  makerFeeBps: 5,
  takerFeeBps: 10,
};

const NASUN_POOL: PoolConfig = {
  id: '0x' + 'b'.repeat(64),
  baseToken: { symbol: 'NSN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 10000,     // $0.01 raw
  lotSize: 1000000000, // 1.0 NASUN (10^9)
  makerFeeBps: 5,
  takerFeeBps: 10,
};

const NETH_POOL: PoolConfig = {
  id: '0x' + 'c'.repeat(64),
  baseToken: { symbol: 'NETH', name: 'Nasun ETH', decimals: 8, type: '0x::neth::NETH' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 100000,           // $0.10 raw
  lotSize: 1000,              // 0.00001 ETH (10^3 at 8 decimals)
  makerFeeBps: 5,
  takerFeeBps: 10,
};

// ========================================
// Price Conversion
// ========================================
describe('formatPrice', () => {
  it('converts raw price to human-readable (NUSDC 6 decimals)', () => {
    expect(formatPrice(97000_000000n, 6)).toBe(97000);
  });

  it('converts raw price with fractional values', () => {
    expect(formatPrice(97000_500000n, 6)).toBe(97000.5);
  });

  it('handles zero', () => {
    expect(formatPrice(0n, 6)).toBe(0);
  });

  it('handles very small prices', () => {
    expect(formatPrice(100000n, 6)).toBeCloseTo(0.1, 6);
  });

  it('uses default NUSDC decimals when not specified', () => {
    expect(formatPrice(1000000n)).toBe(1);
  });
});

describe('priceToRaw', () => {
  it('converts human price to raw (NUSDC 6 decimals)', () => {
    expect(priceToRaw(97000, 6)).toBe(97000_000000n);
  });

  it('handles fractional prices', () => {
    expect(priceToRaw(0.1, 6)).toBe(100000n);
  });

  it('handles precision edge case: 0.018', () => {
    // 0.018 * 10^6 = 18000 (Math.round avoids float error)
    expect(priceToRaw(0.018, 6)).toBe(18000n);
  });

  it('handles zero', () => {
    expect(priceToRaw(0, 6)).toBe(0n);
  });

  it('round-trips correctly: priceToRaw(formatPrice(x)) == x', () => {
    const raw = 97500_100000n;
    const human = formatPrice(raw, 6);
    expect(priceToRaw(human, 6)).toBe(raw);
  });
});

// ========================================
// Quantity Conversion
// ========================================
describe('formatQuantity', () => {
  it('converts raw quantity (NBTC 8 decimals)', () => {
    expect(formatQuantity(100000n, 8)).toBe(0.001);
  });

  it('converts raw quantity for large amounts', () => {
    expect(formatQuantity(100000000n, 8)).toBe(1);
  });

  it('handles zero', () => {
    expect(formatQuantity(0n, 8)).toBe(0);
  });
});

describe('quantityToRaw', () => {
  it('converts human quantity to raw (NBTC 8 decimals)', () => {
    expect(quantityToRaw(0.001, 8)).toBe(100000n);
  });

  it('converts whole BTC', () => {
    expect(quantityToRaw(1, 8)).toBe(100000000n);
  });

  it('handles precision edge case: 0.018', () => {
    // 0.018 * 10^8 = 1800000 with Math.round
    expect(quantityToRaw(0.018, 8)).toBe(1800000n);
  });

  it('handles NSN decimals (9)', () => {
    expect(quantityToRaw(1, 9)).toBe(1000000000n);
  });

  it('handles NETH decimals (8)', () => {
    expect(quantityToRaw(0.001, 8)).toBe(100000n);
  });

  it('round-trips correctly: quantityToRaw(formatQuantity(x)) == x', () => {
    const raw = 1500000n; // 0.015 BTC
    const human = formatQuantity(raw, 8);
    expect(quantityToRaw(human, 8)).toBe(raw);
  });
});

// ========================================
// Floating-Point Precision Edge Cases
// ========================================
describe('Floating-Point Precision', () => {
  it('priceToRaw handles 64900.0 (common JS float issue)', () => {
    // In JS: 64900.0 * 1e6 = 64900000000 (exact, but 64900.0 % 0.1 != 0 in float)
    const raw = priceToRaw(64900.0, 6);
    expect(raw).toBe(64900000000n);
    expect(raw % 100000n).toBe(0n); // tick-aligned
  });

  it('quantityToRaw handles 0.001 (1e-3)', () => {
    expect(quantityToRaw(0.001, 8)).toBe(100000n);
  });

  it('quantityToRaw handles 0.00001 (1e-5, min lot for NBTC)', () => {
    expect(quantityToRaw(0.00001, 8)).toBe(1000n);
  });

  it('priceToRaw handles $0.01 increments for NSN', () => {
    const raw = priceToRaw(0.01, 6);
    expect(raw).toBe(10000n);
    expect(raw % 10000n).toBe(0n); // NSN tick-aligned
  });

  it('large price precision: $97,123.45', () => {
    const raw = priceToRaw(97123.45, 6);
    expect(raw).toBe(97123450000n);
  });
});

// ========================================
// Price Validation
// ========================================
describe('validatePrice', () => {
  it('valid: price aligned to tick size', () => {
    expect(validatePrice(97000.0, NBTC_POOL).valid).toBe(true);
  });

  it('valid: fractional price aligned to tick', () => {
    expect(validatePrice(97000.1, NBTC_POOL).valid).toBe(true);
    expect(validatePrice(97000.2, NBTC_POOL).valid).toBe(true);
    expect(validatePrice(97000.5, NBTC_POOL).valid).toBe(true);
  });

  it('invalid: price not aligned to tick size', () => {
    const result = validatePrice(97000.05, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('min');
  });

  it('invalid: zero price', () => {
    const result = validatePrice(0, NBTC_POOL);
    expect(result.valid).toBe(false);
  });

  it('invalid: negative price', () => {
    const result = validatePrice(-100, NBTC_POOL);
    expect(result.valid).toBe(false);
  });

  it('valid: NSN pool $0.01 tick', () => {
    expect(validatePrice(0.01, NASUN_POOL).valid).toBe(true);
    expect(validatePrice(0.10, NASUN_POOL).valid).toBe(true);
    expect(validatePrice(1.23, NASUN_POOL).valid).toBe(true);
  });

  it('invalid: NSN pool $0.005 (not tick-aligned)', () => {
    expect(validatePrice(0.005, NASUN_POOL).valid).toBe(false);
  });

  it('valid: minimum possible price ($0.10 for NBTC)', () => {
    expect(validatePrice(0.1, NBTC_POOL).valid).toBe(true);
  });

  it('edge: JS float modulo issue - 64900.0 should be valid', () => {
    // 64900.0 % 0.1 in JS = 0.0999... but integer math should handle it
    expect(validatePrice(64900.0, NBTC_POOL).valid).toBe(true);
  });
});

// ========================================
// Quantity Validation
// ========================================
describe('validateQuantity', () => {
  it('valid: quantity aligned to lot size (NBTC)', () => {
    expect(validateQuantity(0.001, NBTC_POOL).valid).toBe(true);
    expect(validateQuantity(0.00001, NBTC_POOL).valid).toBe(true);
    expect(validateQuantity(1.0, NBTC_POOL).valid).toBe(true);
  });

  it('invalid: quantity not aligned to lot size (NBTC)', () => {
    // 0.000005 BTC = 500 raw, lotSize = 1000 → not aligned
    const result = validateQuantity(0.000005, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Quantity');
  });

  it('valid: NSN pool lot (1.0 NSN)', () => {
    expect(validateQuantity(1, NASUN_POOL).valid).toBe(true);
    expect(validateQuantity(5, NASUN_POOL).valid).toBe(true);
    expect(validateQuantity(100, NASUN_POOL).valid).toBe(true);
  });

  it('invalid: NSN pool fractional (0.5 NSN)', () => {
    expect(validateQuantity(0.5, NASUN_POOL).valid).toBe(false);
  });

  it('invalid: zero quantity', () => {
    expect(validateQuantity(0, NBTC_POOL).valid).toBe(false);
  });

  it('invalid: negative quantity', () => {
    expect(validateQuantity(-0.01, NBTC_POOL).valid).toBe(false);
  });

  it('valid: NETH pool lot (0.001 ETH)', () => {
    expect(validateQuantity(0.001, NETH_POOL).valid).toBe(true);
    expect(validateQuantity(0.01, NETH_POOL).valid).toBe(true);
    expect(validateQuantity(1.0, NETH_POOL).valid).toBe(true);
  });

  it('valid: NETH pool 0.0001 ETH (10x lot size)', () => {
    expect(validateQuantity(0.0001, NETH_POOL).valid).toBe(true);
  });

  it('invalid: NETH pool below lot (0.000005 ETH)', () => {
    // 0.000005 * 10^8 = 500 raw, 500 % 1000 = 500 → not aligned
    expect(validateQuantity(0.000005, NETH_POOL).valid).toBe(false);
  });
});

// ========================================
// Combined Order Validation
// ========================================
describe('validateOrder', () => {
  it('valid when both price and quantity are valid', () => {
    expect(validateOrder(97000.0, 0.01, NBTC_POOL).valid).toBe(true);
  });

  it('invalid when price is invalid', () => {
    const result = validateOrder(0, 0.01, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('price');
  });

  it('invalid when quantity is invalid', () => {
    const result = validateOrder(97000.0, 0, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('quantity');
  });

  it('returns price error first when both invalid', () => {
    const result = validateOrder(0, 0, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('price');
  });
});

// ========================================
// snapToTick
// ========================================
describe('snapToTick', () => {
  it('snaps price down to nearest tick (NBTC $0.10 tick)', () => {
    expect(snapToTick(97000.15, NBTC_POOL)).toBeCloseTo(97000.1, 6);
  });

  it('returns exact price when already aligned', () => {
    expect(snapToTick(97000.0, NBTC_POOL)).toBeCloseTo(97000.0, 6);
  });

  it('snaps small price to first tick', () => {
    expect(snapToTick(0.05, NBTC_POOL)).toBeCloseTo(0.1, 6);
  });

  it('returns 0 for zero price', () => {
    expect(snapToTick(0, NBTC_POOL)).toBe(0);
  });

  it('returns 0 for negative price', () => {
    expect(snapToTick(-10, NBTC_POOL)).toBe(0);
  });

  it('snaps for NSN pool ($0.01 tick)', () => {
    expect(snapToTick(0.125, NASUN_POOL)).toBeCloseTo(0.12, 6);
  });

  it('handles very small positive price below 1 tick', () => {
    // Price = 0.001 < 0.10 tick → snaps to minimum tick
    const result = snapToTick(0.001, NBTC_POOL);
    expect(result).toBeCloseTo(0.1, 6);
  });

  it('handles large prices', () => {
    expect(snapToTick(150000.99, NBTC_POOL)).toBeCloseTo(150000.9, 6);
  });
});

// ========================================
// Min Calculations
// ========================================
describe('getMinQuantity', () => {
  it('NBTC: 0.00001 BTC (lotSize=1000, 8 decimals)', () => {
    expect(getMinQuantity(NBTC_POOL)).toBeCloseTo(0.00001, 8);
  });

  it('NSN: 1.0 NSN (lotSize=10^9, 9 decimals)', () => {
    expect(getMinQuantity(NASUN_POOL)).toBeCloseTo(1.0, 2);
  });

  it('NETH: 0.00001 ETH (lotSize=1000, 8 decimals)', () => {
    expect(getMinQuantity(NETH_POOL)).toBeCloseTo(0.00001, 8);
  });
});

describe('getMinPrice', () => {
  it('NBTC: $0.10 (tickSize=100000, 6 decimals)', () => {
    expect(getMinPrice(NBTC_POOL)).toBeCloseTo(0.1, 6);
  });

  it('NSN: $0.01 (tickSize=10000, 6 decimals)', () => {
    expect(getMinPrice(NASUN_POOL)).toBeCloseTo(0.01, 6);
  });
});

describe('formatMinQuantity', () => {
  it('formats NBTC min quantity', () => {
    expect(formatMinQuantity(NBTC_POOL)).toBe('0.00001 NBTC');
  });

  it('formats NSN min quantity', () => {
    expect(formatMinQuantity(NASUN_POOL)).toBe('1 NSN');
  });
});

describe('formatMinPrice', () => {
  it('formats NBTC min price', () => {
    expect(formatMinPrice(NBTC_POOL)).toBe('$0.1');
  });

  it('formats NSN min price', () => {
    expect(formatMinPrice(NASUN_POOL)).toBe('$0.01');
  });
});
