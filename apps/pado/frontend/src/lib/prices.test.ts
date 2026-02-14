import { describe, it, expect, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('./sui-client', () => ({
  getSuiClient: vi.fn(() => ({})),
}));
vi.mock('./oracle-client', () => ({
  getPrice: vi.fn(),
  isFresh: vi.fn(),
}));
vi.mock('./logger', () => ({
  logOnce: vi.fn(),
  logThrottled: vi.fn(),
}));

import {
  getUnifiedPrice,
  getPriceSource,
  getPriceWithFreshness,
  set24hChange,
  getPriceChange24h,
  calculateUsdValue,
  calculate24hPnl,
  formatUsdValue,
  formatPercentage,
  getTokenByOracleId,
  getAllPrices,
} from './prices';

// ========================================
// getUnifiedPrice (sync, cache-based)
// ========================================
describe('getUnifiedPrice', () => {
  it('returns simulated price for NBTC when cache is empty', () => {
    expect(getUnifiedPrice('NBTC')).toBe(69000);
  });

  it('returns $1.00 for NUSDC', () => {
    expect(getUnifiedPrice('NUSDC')).toBe(1.0);
  });

  it('returns simulated price for NASUN', () => {
    expect(getUnifiedPrice('NASUN')).toBe(0.1);
  });

  it('returns simulated price for NETH', () => {
    expect(getUnifiedPrice('NETH')).toBe(2000);
  });

  it('returns simulated price for NSOL', () => {
    expect(getUnifiedPrice('NSOL')).toBe(85);
  });
});

// ========================================
// getPriceSource
// ========================================
describe('getPriceSource', () => {
  it('returns unknown when cache is empty', () => {
    expect(getPriceSource('NBTC')).toBe('unknown');
  });
});

// ========================================
// getPriceWithFreshness
// ========================================
describe('getPriceWithFreshness', () => {
  it('returns simulated fallback with isFresh=false when cache empty', () => {
    const result = getPriceWithFreshness('NBTC');
    expect(result.price).toBe(69000);
    expect(result.isFresh).toBe(false);
    expect(result.source).toBe('unknown');
    expect(result.timestamp).toBe(0);
  });
});

// ========================================
// getTokenByOracleId
// ========================================
describe('getTokenByOracleId', () => {
  it('maps oracle ID 1 to NBTC', () => {
    expect(getTokenByOracleId(1)).toBe('NBTC');
  });

  it('maps oracle ID 2 to NETH', () => {
    expect(getTokenByOracleId(2)).toBe('NETH');
  });

  it('maps oracle ID 3 to NASUN', () => {
    expect(getTokenByOracleId(3)).toBe('NASUN');
  });

  it('maps oracle ID 4 to NSOL', () => {
    expect(getTokenByOracleId(4)).toBe('NSOL');
  });

  it('returns null for unknown oracle ID', () => {
    expect(getTokenByOracleId(99)).toBeNull();
  });
});

// ========================================
// set24hChange / getPriceChange24h
// ========================================
describe('24h Price Change', () => {
  it('returns 0 for NUSDC (stablecoin)', () => {
    expect(getPriceChange24h('NUSDC')).toBe(0);
  });

  it('returns 0 (fallback) when no change data set', () => {
    expect(getPriceChange24h('NBTC')).toBe(0);
  });

  it('returns set change value', () => {
    set24hChange('NBTC', 2.5);
    expect(getPriceChange24h('NBTC')).toBe(2.5);
  });

  it('returns negative change', () => {
    set24hChange('NETH', -3.7);
    expect(getPriceChange24h('NETH')).toBe(-3.7);
  });

  it('overwrites previous change', () => {
    set24hChange('NSOL', 5.0);
    set24hChange('NSOL', -1.0);
    expect(getPriceChange24h('NSOL')).toBe(-1.0);
  });

  it('NUSDC always returns 0 regardless of set value', () => {
    set24hChange('NUSDC', 999);
    expect(getPriceChange24h('NUSDC')).toBe(0);
  });
});

// ========================================
// calculateUsdValue
// ========================================
describe('calculateUsdValue', () => {
  it('calculates BTC value correctly', () => {
    // Price = 69000, amount = 0.5
    expect(calculateUsdValue('NBTC', 0.5)).toBe(34500);
  });

  it('returns 0 for zero amount', () => {
    expect(calculateUsdValue('NBTC', 0)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    // 0.333 * 69000 = 22977
    const result = calculateUsdValue('NBTC', 0.333);
    expect(result).toBe(22977);
  });

  it('handles NUSDC (1:1 ratio)', () => {
    expect(calculateUsdValue('NUSDC', 100)).toBe(100);
  });
});

// ========================================
// calculate24hPnl
// ========================================
describe('calculate24hPnl', () => {
  it('calculates positive PnL', () => {
    set24hChange('NBTC', 5.0);
    // PnL = currentValue * change / (100 + change)
    // = 1000 * 5 / 105 = 47.62
    const pnl = calculate24hPnl('NBTC', 1000);
    expect(pnl).toBeCloseTo(47.62, 1);
  });

  it('calculates negative PnL', () => {
    set24hChange('NBTC', -5.0);
    // PnL = 1000 * (-5) / (100 + (-5)) = -5000/95 = -52.63
    const pnl = calculate24hPnl('NBTC', 1000);
    expect(pnl).toBeCloseTo(-52.63, 1);
  });

  it('returns 0 PnL for stablecoin', () => {
    expect(calculate24hPnl('NUSDC', 1000)).toBe(0);
  });

  it('returns 0 PnL for zero value', () => {
    set24hChange('NBTC', 5.0);
    expect(calculate24hPnl('NBTC', 0)).toBe(0);
  });
});

// ========================================
// formatUsdValue
// ========================================
describe('formatUsdValue', () => {
  it('formats basic USD value', () => {
    expect(formatUsdValue(1234.56)).toBe('$1,234.56');
  });

  it('formats with showSign for positive values', () => {
    const result = formatUsdValue(100, { showSign: true });
    expect(result).toBe('+$100.00');
  });

  it('formats negative values with minus', () => {
    const result = formatUsdValue(-50.5);
    expect(result).toBe('-$50.50');
  });

  it('does not add + sign for negative with showSign', () => {
    const result = formatUsdValue(-50, { showSign: true });
    expect(result).toBe('-$50.00');
  });

  it('formats compact values (>= 1000)', () => {
    const result = formatUsdValue(1500, { compact: true });
    // Should use compact notation like $1.5K
    expect(result).toMatch(/\$1\.5K/);
  });

  it('formats zero', () => {
    expect(formatUsdValue(0)).toBe('$0.00');
  });
});

// ========================================
// formatPercentage
// ========================================
describe('formatPercentage', () => {
  it('formats positive percentage with + sign', () => {
    expect(formatPercentage(2.5)).toBe('+2.50%');
  });

  it('formats negative percentage with - sign', () => {
    expect(formatPercentage(-3.75)).toBe('-3.75%');
  });

  it('formats zero as +0.00%', () => {
    expect(formatPercentage(0)).toBe('+0.00%');
  });
});

// ========================================
// getAllPrices
// ========================================
describe('getAllPrices', () => {
  it('returns all token prices', () => {
    const prices = getAllPrices();
    expect(prices.NASUN).toBe(0.1);
    expect(prices.NBTC).toBe(69000);
    expect(prices.NUSDC).toBe(1.0);
    expect(prices.NETH).toBe(2000);
    expect(prices.NSOL).toBe(85);
  });
});
