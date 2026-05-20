/**
 * DeepBook V3 Utility Tests
 *
 * Critical: DeepBook V3 raw price = human_price * 10^(quoteDecimals + 9 - baseDecimals).
 * - NBTC / NETH (baseDecimals = 8, quoteDecimals = 6): scaleExp = 7
 * - NSN  / NSOL (baseDecimals = 9, quoteDecimals = 6): scaleExp = 6 (collapses)
 *
 * The pre-2026-05-19 frontend used `10^quoteDecimals` for every pool, which
 * inflated NBTC/NETH human prices by 10x. Tests below exercise both regimes
 * explicitly to prevent regression.
 */

import { describe, it, expect } from 'vitest';
import * as deepbook from './deepbook';
import {
  priceScaleExp,
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
  recommendedSlippageBps,
  type SwapQuote,
} from './deepbook';
import type { PoolConfig } from '../features/trading/types';

// ========================================
// Test Pool Configs
// ========================================
const NBTC_POOL: PoolConfig = {
  id: '0x' + 'a'.repeat(64),
  baseToken: { symbol: 'NBTC', name: 'Nasun BTC', decimals: 8, type: '0x::nbtc::NBTC' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 100000,   // $0.01 (raw 10^5 at scaleExp = 7)
  lotSize: 1000,      // 0.00001 BTC (10^3 at 8 decimals)
  makerFeeBps: 5,
  takerFeeBps: 10,
};

const NASUN_POOL: PoolConfig = {
  id: '0x' + 'b'.repeat(64),
  baseToken: { symbol: 'NSN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 10000,     // $0.01 (raw 10^4 at scaleExp = 6)
  lotSize: 1000000000, // 1.0 NSN (10^9)
  makerFeeBps: 5,
  takerFeeBps: 10,
};

const NETH_POOL: PoolConfig = {
  id: '0x' + 'c'.repeat(64),
  baseToken: { symbol: 'NETH', name: 'Nasun ETH', decimals: 8, type: '0x::neth::NETH' },
  quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: '0x::nusdc::NUSDC' },
  tickSize: 100000,    // $0.01 (raw 10^5 at scaleExp = 7)
  lotSize: 1000,       // 0.00001 ETH (10^3 at 8 decimals)
  makerFeeBps: 5,
  takerFeeBps: 10,
};

// ========================================
// priceScaleExp (DeepBook V3 invariant)
// ========================================
describe('priceScaleExp', () => {
  it('returns 7 for NBTC / NETH (baseDecimals=8, quoteDecimals=6)', () => {
    expect(priceScaleExp(6, 8)).toBe(7);
  });

  it('returns 6 for NSOL / NSN (baseDecimals=9, quoteDecimals=6)', () => {
    expect(priceScaleExp(6, 9)).toBe(6);
  });
});

// Lockstep guard with bots/lib/config.ts::priceScaleExp.
// See apps/pado/_shared/price-scale.fixture.ts and
// apps/pado/bots/lib/config.test.ts for the matching test.
import { PRICE_SCALE_FIXTURES } from '../../../_shared/price-scale.fixture';

describe('priceScaleExp lockstep with bots/lib/config.ts', () => {
  for (const c of PRICE_SCALE_FIXTURES) {
    it(`${c.label}: priceScaleExp(${c.quoteDecimals}, ${c.baseDecimals}) === ${c.expectedExp}`, () => {
      expect(priceScaleExp(c.quoteDecimals, c.baseDecimals)).toBe(c.expectedExp);
    });
  }
});

// ========================================
// Price Conversion (NBTC / NETH regime)
// ========================================
describe('formatPrice (NBTC/NETH, scaleExp=7)', () => {
  // $77,000 raw = 77000 * 10^7 = 770_000_000_000n (12 digits)
  const NBTC_77000_RAW = 770_000_000_000n;
  // $77,000.01 raw = 77000.01 * 10^7 = 770_000_100_000n
  const NBTC_77000_01_RAW = 770_000_100_000n;

  it('decodes $77,000 raw as 77000', () => {
    expect(formatPrice(NBTC_77000_RAW, 6, 8)).toBe(77000);
  });

  it('decodes $77,000.01 raw with $0.01 precision', () => {
    expect(formatPrice(NBTC_77000_01_RAW, 6, 8)).toBeCloseTo(77000.01, 6);
  });

  it('handles zero', () => {
    expect(formatPrice(0n, 6, 8)).toBe(0);
  });

  it('default baseDecimals=8 matches explicit NBTC', () => {
    expect(formatPrice(NBTC_77000_RAW)).toBe(formatPrice(NBTC_77000_RAW, 6, 8));
  });
});

describe('formatPrice (NSN/NSOL, scaleExp=6)', () => {
  it('decodes raw 1_000000n as $1 (NSN, baseDecimals=9)', () => {
    expect(formatPrice(1_000000n, 6, 9)).toBe(1);
  });

  it('decodes fractional raw price', () => {
    expect(formatPrice(125000n, 6, 9)).toBeCloseTo(0.125, 6);
  });
});

describe('priceToRaw (NBTC/NETH, scaleExp=7)', () => {
  it('encodes $77,000 to raw 770_000_000_000n', () => {
    expect(priceToRaw(77000, 6, 8)).toBe(770_000_000_000n);
  });

  it('encodes $0.01 to raw 100_000n (one NBTC tick)', () => {
    expect(priceToRaw(0.01, 6, 8)).toBe(100_000n);
  });

  it('round-trips raw ↔ human (NBTC)', () => {
    // $77,000.105 raw = 77000.105 * 10^7 = 770_001_050_000n
    const raw = 770_001_050_000n;
    const human = formatPrice(raw, 6, 8);
    expect(priceToRaw(human, 6, 8)).toBe(raw);
  });
});

describe('priceToRaw (NSN/NSOL, scaleExp=6)', () => {
  it('encodes $1 to raw 1_000000n', () => {
    expect(priceToRaw(1, 6, 9)).toBe(1_000000n);
  });

  it('encodes $0.01 to raw 10000n (one NSN tick)', () => {
    expect(priceToRaw(0.01, 6, 9)).toBe(10000n);
  });
});

// ========================================
// Quantity Conversion (independent of priceScaleExp)
// ========================================
describe('formatQuantity', () => {
  it('NBTC: raw 100000n → 0.001 BTC', () => {
    expect(formatQuantity(100000n, 8)).toBe(0.001);
  });

  it('NBTC: raw 100000000n → 1 BTC', () => {
    expect(formatQuantity(100000000n, 8)).toBe(1);
  });

  it('handles zero', () => {
    expect(formatQuantity(0n, 8)).toBe(0);
  });
});

describe('quantityToRaw', () => {
  it('NBTC: 0.001 → 100000n', () => {
    expect(quantityToRaw(0.001, 8)).toBe(100000n);
  });

  it('NBTC: 1 → 100000000n', () => {
    expect(quantityToRaw(1, 8)).toBe(100000000n);
  });

  it('NBTC float precision: 0.018 → 1800000n (Math.round)', () => {
    expect(quantityToRaw(0.018, 8)).toBe(1800000n);
  });

  it('NSN: 1 → 1_000000000n', () => {
    expect(quantityToRaw(1, 9)).toBe(1_000000000n);
  });

  it('round-trips raw ↔ human', () => {
    const raw = 1500000n;
    expect(quantityToRaw(formatQuantity(raw, 8), 8)).toBe(raw);
  });
});

// ========================================
// Floating-point precision
// ========================================
describe('Floating-Point Precision', () => {
  it('NBTC: priceToRaw($77,000.01) hits exact tick boundary', () => {
    const raw = priceToRaw(77000.01, 6, 8);
    expect(raw).toBe(770000100000n);
    expect(raw % 100000n).toBe(0n); // NBTC tick-aligned
  });

  it('NBTC: 0.00001 BTC (lotSize)', () => {
    expect(quantityToRaw(0.00001, 8)).toBe(1000n);
  });

  it('NSN: priceToRaw($0.01) hits exact tick boundary', () => {
    const raw = priceToRaw(0.01, 6, 9);
    expect(raw).toBe(10000n);
    expect(raw % 10000n).toBe(0n);
  });
});

// ========================================
// Validation
// ========================================
describe('validatePrice (NBTC, tick $0.01)', () => {
  it('valid: $77,000.00', () => {
    expect(validatePrice(77000.0, NBTC_POOL).valid).toBe(true);
  });

  it('valid: $77,000.01 (1 tick)', () => {
    expect(validatePrice(77000.01, NBTC_POOL).valid).toBe(true);
  });

  it('valid: $77,000.10 (10 ticks)', () => {
    expect(validatePrice(77000.1, NBTC_POOL).valid).toBe(true);
  });

  it('invalid: $77,000.005 (half tick)', () => {
    const result = validatePrice(77000.005, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('min');
  });

  it('invalid: zero', () => {
    expect(validatePrice(0, NBTC_POOL).valid).toBe(false);
  });

  it('invalid: negative', () => {
    expect(validatePrice(-100, NBTC_POOL).valid).toBe(false);
  });
});

describe('validatePrice (NSN, tick $0.01)', () => {
  it('valid: $0.01, $0.10, $1.23', () => {
    expect(validatePrice(0.01, NASUN_POOL).valid).toBe(true);
    expect(validatePrice(0.10, NASUN_POOL).valid).toBe(true);
    expect(validatePrice(1.23, NASUN_POOL).valid).toBe(true);
  });

  it('invalid: $0.005 (half tick)', () => {
    expect(validatePrice(0.005, NASUN_POOL).valid).toBe(false);
  });
});

describe('validateQuantity', () => {
  it('NBTC: valid lot multiples', () => {
    expect(validateQuantity(0.001, NBTC_POOL).valid).toBe(true);
    expect(validateQuantity(0.00001, NBTC_POOL).valid).toBe(true);
    expect(validateQuantity(1.0, NBTC_POOL).valid).toBe(true);
  });

  it('NBTC: invalid below lot (0.000005)', () => {
    const result = validateQuantity(0.000005, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Quantity');
  });

  it('NSN: valid lot multiples (whole NSN)', () => {
    expect(validateQuantity(1, NASUN_POOL).valid).toBe(true);
    expect(validateQuantity(100, NASUN_POOL).valid).toBe(true);
  });

  it('NSN: invalid fractional (0.5)', () => {
    expect(validateQuantity(0.5, NASUN_POOL).valid).toBe(false);
  });

  it('NETH: valid 0.001 ETH', () => {
    expect(validateQuantity(0.001, NETH_POOL).valid).toBe(true);
  });

  it('rejects zero and negative', () => {
    expect(validateQuantity(0, NBTC_POOL).valid).toBe(false);
    expect(validateQuantity(-0.01, NBTC_POOL).valid).toBe(false);
  });
});

describe('validateOrder', () => {
  it('valid when both price and quantity are valid', () => {
    expect(validateOrder(77000.0, 0.01, NBTC_POOL).valid).toBe(true);
  });

  it('invalid when price is invalid', () => {
    const result = validateOrder(0, 0.01, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('price');
  });

  it('invalid when quantity is invalid', () => {
    const result = validateOrder(77000.0, 0, NBTC_POOL);
    expect(result.valid).toBe(false);
    expect(result.message).toContain('quantity');
  });
});

// ========================================
// snapToTick (NBTC tick = $0.01)
// ========================================
describe('snapToTick', () => {
  it('NBTC: 77000.015 → 77000.01', () => {
    expect(snapToTick(77000.015, NBTC_POOL)).toBeCloseTo(77000.01, 6);
  });

  it('NBTC: already-aligned 77000.00 passes through', () => {
    expect(snapToTick(77000.0, NBTC_POOL)).toBeCloseTo(77000.0, 6);
  });

  it('NBTC: 0.005 (below 1 tick) → 0.01', () => {
    expect(snapToTick(0.005, NBTC_POOL)).toBeCloseTo(0.01, 6);
  });

  it('returns 0 for zero / negative', () => {
    expect(snapToTick(0, NBTC_POOL)).toBe(0);
    expect(snapToTick(-10, NBTC_POOL)).toBe(0);
  });

  it('NSN: 0.125 → 0.12', () => {
    expect(snapToTick(0.125, NASUN_POOL)).toBeCloseTo(0.12, 6);
  });

  it('NBTC: 150000.999 → 150000.99', () => {
    expect(snapToTick(150000.999, NBTC_POOL)).toBeCloseTo(150000.99, 6);
  });
});

// ========================================
// Min Calculations
// ========================================
describe('getMinQuantity', () => {
  it('NBTC: 0.00001 BTC', () => {
    expect(getMinQuantity(NBTC_POOL)).toBeCloseTo(0.00001, 8);
  });

  it('NSN: 1.0 NSN', () => {
    expect(getMinQuantity(NASUN_POOL)).toBeCloseTo(1.0, 2);
  });

  it('NETH: 0.00001 ETH', () => {
    expect(getMinQuantity(NETH_POOL)).toBeCloseTo(0.00001, 8);
  });
});

describe('getMinPrice', () => {
  it('NBTC: $0.01 (tickSize 100000 / 10^7)', () => {
    expect(getMinPrice(NBTC_POOL)).toBeCloseTo(0.01, 6);
  });

  it('NETH: $0.01', () => {
    expect(getMinPrice(NETH_POOL)).toBeCloseTo(0.01, 6);
  });

  it('NSN: $0.01 (tickSize 10000 / 10^6)', () => {
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
  it('formats NBTC min price as $0.01', () => {
    expect(formatMinPrice(NBTC_POOL)).toBe('$0.01');
  });

  it('formats NSN min price as $0.01', () => {
    expect(formatMinPrice(NASUN_POOL)).toBe('$0.01');
  });
});

// ========================================
// computeSwapQuote — quoteRaw is independent of priceScaleExp
// (priceScaled stays at 10^quoteDecimals: bestBidPrice is already human USD)
// ========================================
describe('computeSwapQuote', () => {
  const baseDecimals = 8;   // NETH / NBTC
  const quoteDecimals = 6;  // NUSDC

  it('returns null when bids empty', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [],
      midPrice: 100,
      baseAmountRaw: 1_00000000n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 50,
    });
    expect(q).toBeNull();
  });

  it('returns null when baseAmountRaw is 0', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [{ price: 100, quantity: 10, total: 1000 }],
      midPrice: 100,
      baseAmountRaw: 0n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 50,
    });
    expect(q).toBeNull();
  });

  it('returns null when midPrice is 0', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [{ price: 100, quantity: 10, total: 1000 }],
      midPrice: 0,
      baseAmountRaw: 1_00000000n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 50,
    });
    expect(q).toBeNull();
  });

  it('quotes 1 NETH @ $1500 with 50bps slippage', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [{ price: 1500, quantity: 5, total: 7500 }],
      midPrice: 1500,
      baseAmountRaw: 1_00000000n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 50,
    }) as SwapQuote;
    expect(q.expectedQuoteRaw).toBe(1500_000000n);
    expect(q.minQuoteRaw).toBe(1492500000n);
    expect(q.effectivePrice).toBe(1500);
    expect(q.midPrice).toBe(1500);
    expect(q.priceImpact).toBe(0);
    expect(q.underestimateRisk).toBe(false);
  });

  it('marks underestimateRisk when bid depth insufficient', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [
        { price: 1500, quantity: 0.5, total: 750 },
        { price: 1499, quantity: 5,   total: 7495 },
      ],
      midPrice: 1500,
      baseAmountRaw: 1_00000000n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 50,
    }) as SwapQuote;
    expect(q.underestimateRisk).toBe(true);
  });

  it('reports priceImpact when best bid sits below mid', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [{ price: 1485, quantity: 10, total: 14850 }],
      midPrice: 1500,
      baseAmountRaw: 1_00000000n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 50,
    }) as SwapQuote;
    expect(q.priceImpact).toBeCloseTo((1500 - 1485) / 1500, 6);
    expect(q.expectedQuoteRaw).toBe(1485_000000n);
  });

  it('handles 9-decimal base (NSOL)', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [{ price: 145, quantity: 100, total: 14500 }],
      midPrice: 145,
      baseAmountRaw: 10_000_000_000n,
      baseDecimals: 9,
      quoteDecimals: 6,
      slippageBps: 50,
    }) as SwapQuote;
    expect(q.expectedQuoteRaw).toBe(1450_000000n);
    expect(q.minQuoteRaw).toBe(1442750000n);
  });

  it('returns null when bestBidPrice is non-positive', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [{ price: 0, quantity: 10, total: 0 }],
      midPrice: 100,
      baseAmountRaw: 1_00000000n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 50,
    });
    expect(q).toBeNull();
  });

  it('clamps slippageBps >= 10000 to zero minQuote', () => {
    const q = (deepbook as any).computeSwapQuote({
      bids: [{ price: 1500, quantity: 5, total: 7500 }],
      midPrice: 1500,
      baseAmountRaw: 1_00000000n,
      baseDecimals,
      quoteDecimals,
      slippageBps: 20000,
    }) as SwapQuote;
    expect(q.minQuoteRaw).toBe(0n);
  });
});

describe('recommendedSlippageBps', () => {
  const base = (impact: number): SwapQuote => ({
    expectedQuoteRaw: 0n,
    minQuoteRaw: 0n,
    effectivePrice: 100,
    midPrice: 100,
    bestBidPrice: 100,
    priceImpact: impact,
    underestimateRisk: false,
  });

  it('returns 50 for low impact', () => {
    expect(recommendedSlippageBps(base(0))).toBe(50);
    expect(recommendedSlippageBps(base(0.001))).toBe(50);
    expect(recommendedSlippageBps(base(0.004))).toBe(50);
  });

  it('returns 100 at the 0.5% threshold', () => {
    expect(recommendedSlippageBps(base(0.005))).toBe(100);
    expect(recommendedSlippageBps(base(0.02))).toBe(100);
  });
});
