/**
 * Config Module Tests
 *
 * Tests market configuration, price/quantity conversion helpers,
 * and tick/lot size rounding.
 */

import { describe, it, expect } from 'vitest';
import {
  MARKETS,
  MARKET,
  priceToRaw,
  quantityToRaw,
  rawToPrice,
  rawToQuantity,
  roundToTickSize,
  roundToLotSize,
  loadConfig,
} from './config.js';

// ========================================
// MARKETS Configuration
// ========================================

describe('MARKETS', () => {
  it('contains NBTC, NETH, NSOL', () => {
    expect(MARKETS).toHaveProperty('NBTC');
    expect(MARKETS).toHaveProperty('NETH');
    expect(MARKETS).toHaveProperty('NSOL');
    expect(Object.keys(MARKETS)).toHaveLength(3);
  });

  it('all markets use NUSDC as quote token', () => {
    for (const market of Object.values(MARKETS)) {
      expect(market.quoteType).toContain('nusdc::NUSDC');
      expect(market.quoteDecimals).toBe(6);
    }
  });

  it('NBTC uses V1 faucet, NETH/NSOL use V2', () => {
    expect(MARKETS.NBTC.faucetType).toBe('v1');
    expect(MARKETS.NETH.faucetType).toBe('v2');
    expect(MARKETS.NSOL.faucetType).toBe('v2');
  });

  it('each market has valid pool ID format', () => {
    for (const market of Object.values(MARKETS)) {
      expect(market.poolId).toMatch(/^0x[a-f0-9]{64}$/);
    }
  });

  it('each market has valid Binance symbol', () => {
    expect(MARKETS.NBTC.binanceSymbol).toBe('BTCUSDT');
    expect(MARKETS.NETH.binanceSymbol).toBe('ETHUSDT');
    expect(MARKETS.NSOL.binanceSymbol).toBe('SOLUSDT');
  });

  it('each market has valid decimals', () => {
    expect(MARKETS.NBTC.baseDecimals).toBe(8);
    expect(MARKETS.NETH.baseDecimals).toBe(8);
    expect(MARKETS.NSOL.baseDecimals).toBe(9);
  });

  it('price bounds are sensible', () => {
    for (const market of Object.values(MARKETS)) {
      expect(market.defaultMinPrice).toBeGreaterThan(0);
      expect(market.defaultMaxPrice).toBeGreaterThan(market.defaultMinPrice);
      expect(market.defaultOrderSize).toBeGreaterThan(0);
    }
  });
});

// ========================================
// MARKET singleton
// ========================================

describe('MARKET singleton', () => {
  it('defaults to NBTC when LP_MARKET is not set', () => {
    // In test env, LP_MARKET is likely not set
    expect(MARKET.name).toBe('NBTC');
  });
});

// ========================================
// Price/Quantity Conversion
// ========================================

describe('priceToRaw', () => {
  // Default test market is NBTC (baseDecimals=8, quoteDecimals=6).
  // DeepBook V3: raw price = human_price * 10^(quoteDecimals + 9 - baseDecimals) = * 10^7.
  it('converts BTC price to DeepBook raw price', () => {
    // $100,000 → 100000 * 10^7 = 1_000_000_000_000
    expect(priceToRaw(100000)).toBe(1_000_000_000_000n);
  });

  it('converts fractional price correctly', () => {
    // $99,999.50 → 99999.5 * 10^7 = 999_995_000_000
    expect(priceToRaw(99999.5)).toBe(999_995_000_000n);
  });

  it('handles very small prices (SOL-range)', () => {
    // $150.25 → 150.25 * 10^7 = 1_502_500_000
    expect(priceToRaw(150.25)).toBe(1_502_500_000n);
  });

  it('settles to correct quote raw via DeepBook formula', () => {
    // For 1 BTC (1 * 10^baseDecimals=10^8 base raw) at $100,000:
    //   quote_raw = priceRaw * baseRaw / 10^9
    //   = 1e12 * 1e8 / 1e9 = 1e11
    //   = 100,000 NUSDC at 6 decimals → 100_000 * 10^6 = 1e11 ✓
    const priceRaw = priceToRaw(100000);
    const baseRaw = 100_000_000n; // 1 BTC
    const quoteRaw = (priceRaw * baseRaw) / 1_000_000_000n;
    expect(quoteRaw).toBe(100_000_000_000n);
  });
});

describe('rawToPrice', () => {
  it('converts raw price back to human USD', () => {
    expect(rawToPrice(1_000_000_000_000n)).toBe(100000);
  });

  it('is inverse of priceToRaw', () => {
    const price = 98765.43;
    const raw = priceToRaw(price);
    const back = rawToPrice(raw);
    expect(Math.abs(back - price)).toBeLessThan(0.01);
  });
});

describe('quantityToRaw', () => {
  it('converts BTC amount to raw units (8 decimals)', () => {
    // 0.01 BTC → 0.01 * 10^8 = 1,000,000
    expect(quantityToRaw(0.01)).toBe(1000000n);
  });

  it('converts 1 BTC correctly', () => {
    expect(quantityToRaw(1)).toBe(100000000n);
  });
});

describe('rawToQuantity', () => {
  it('converts raw base units to human amount', () => {
    expect(rawToQuantity(100000000n)).toBe(1);
  });

  it('is inverse of quantityToRaw', () => {
    const qty = 0.05;
    const raw = quantityToRaw(qty);
    const back = rawToQuantity(raw);
    expect(Math.abs(back - qty)).toBeLessThan(0.000001);
  });
});

// ========================================
// Rounding
// ========================================

describe('roundToTickSize', () => {
  it('rounds price down to tick size', () => {
    // NBTC tick size: 100000 ($0.1)
    // 99999950000 / 100000 = 999999 * 100000 = 99999900000
    expect(roundToTickSize(99999950000n)).toBe(99999900000n);
  });

  it('does not change already-rounded price', () => {
    expect(roundToTickSize(100000000000n)).toBe(100000000000n);
  });

  it('rounds small amounts correctly', () => {
    // 150000 → rounds to tick
    const tickSize = MARKET.tickSize; // 100000 for NBTC
    const input = 250000n;
    const expected = (input / tickSize) * tickSize;
    expect(roundToTickSize(input)).toBe(expected);
  });
});

describe('roundToLotSize', () => {
  it('rounds quantity down to lot size', () => {
    // NBTC lot size: 1000 (0.00001 BTC)
    // 1234567 / 1000 = 1234 * 1000 = 1234000
    expect(roundToLotSize(1234567n)).toBe(1234000n);
  });

  it('does not change already-rounded quantity', () => {
    expect(roundToLotSize(5000n)).toBe(5000n);
  });

  it('returns 0 for sub-lot quantities', () => {
    expect(roundToLotSize(999n)).toBe(0n);
  });
});

// ========================================
// loadConfig
// ========================================

describe('loadConfig', () => {
  it('loads default config without errors', () => {
    const config = loadConfig();
    expect(config.spreadBps).toBeGreaterThan(0);
    expect(config.orderLevels).toBeGreaterThan(0);
    expect(config.orderSize).toBeGreaterThan(0);
    expect(config.minPriceUsd).toBeLessThan(config.maxPriceUsd);
  });

  it('all numeric fields are valid numbers', () => {
    const config = loadConfig();
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'number') {
        expect(isNaN(value)).toBe(false);
      }
    }
  });
});
