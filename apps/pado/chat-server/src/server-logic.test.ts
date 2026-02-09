/**
 * Tests for chat-server logic extracted from server.ts and indexer.ts.
 * Tests prefix blocking, large trade detection, and formatQuoteVolume.
 */
import { describe, it, expect } from 'vitest';

// ===== Prefix Blocking (from server.ts handleSendMessage) =====
// Replicating the exact logic from server.ts:132-134

function isReservedPrefix(content: string): boolean {
  return content.startsWith('[TRADE]') || content.startsWith('[SYSTEM]');
}

describe('Prefix Blocking', () => {
  it('blocks [TRADE] prefix', () => {
    expect(isReservedPrefix('[TRADE]{"pair":"NBTC/NUSDC"}')).toBe(true);
  });

  it('blocks [SYSTEM] prefix', () => {
    expect(isReservedPrefix('[SYSTEM] alert message')).toBe(true);
  });

  it('blocks exact [TRADE] with no content after', () => {
    expect(isReservedPrefix('[TRADE]')).toBe(true);
  });

  it('blocks exact [SYSTEM] with no content after', () => {
    expect(isReservedPrefix('[SYSTEM]')).toBe(true);
  });

  it('allows normal messages', () => {
    expect(isReservedPrefix('Hello, world!')).toBe(false);
  });

  it('allows messages containing [TRADE] in the middle', () => {
    expect(isReservedPrefix('I made a [TRADE] today')).toBe(false);
  });

  it('allows messages containing [SYSTEM] in the middle', () => {
    expect(isReservedPrefix('The [SYSTEM] is down')).toBe(false);
  });

  it('allows case variations (prefix is case-sensitive)', () => {
    expect(isReservedPrefix('[trade]something')).toBe(false);
    expect(isReservedPrefix('[Trade]something')).toBe(false);
    expect(isReservedPrefix('[TRADE something')).toBe(false);
    expect(isReservedPrefix('[system]message')).toBe(false);
  });

  it('allows empty string', () => {
    expect(isReservedPrefix('')).toBe(false);
  });

  it('blocks [TRADE] with whitespace after prefix', () => {
    expect(isReservedPrefix('[TRADE] some content')).toBe(true);
  });

  it('blocks [SYSTEM] with JSON payload', () => {
    expect(isReservedPrefix('[SYSTEM]{"type":"large_trade"}')).toBe(true);
  });

  it('allows bracket-only variations', () => {
    expect(isReservedPrefix('[TRADES]')).toBe(false);
    expect(isReservedPrefix('[SYSTEMS]')).toBe(false);
    expect(isReservedPrefix('[T]')).toBe(false);
  });
});

// ===== formatQuoteVolume (from server.ts:920-931) =====
// Replicating the exact logic from server.ts

function formatQuoteVolume(rawVolume: string): string {
  try {
    const raw = BigInt(rawVolume || '0');
    if (raw < 0n) return '0.00';
    const whole = raw / 1_000_000n;
    const frac = raw % 1_000_000n;
    const fracStr = frac.toString().padStart(6, '0').slice(0, 2);
    return `${whole}.${fracStr}`;
  } catch {
    return '0.00';
  }
}

describe('formatQuoteVolume', () => {
  it('formats zero', () => {
    expect(formatQuoteVolume('0')).toBe('0.00');
  });

  it('formats small amounts', () => {
    expect(formatQuoteVolume('1000000')).toBe('1.00');  // $1.00
  });

  it('formats fractional amounts', () => {
    expect(formatQuoteVolume('1500000')).toBe('1.50');  // $1.50
  });

  it('formats large amounts', () => {
    expect(formatQuoteVolume('1000000000000')).toBe('1000000.00');  // $1M
  });

  it('formats amounts with sub-cent precision (truncates to 2 decimal places)', () => {
    expect(formatQuoteVolume('1123456')).toBe('1.12');  // $1.123456 -> $1.12
  });

  it('handles empty string', () => {
    expect(formatQuoteVolume('')).toBe('0.00');
  });

  it('handles invalid string', () => {
    expect(formatQuoteVolume('not_a_number')).toBe('0.00');
  });

  it('handles negative values', () => {
    expect(formatQuoteVolume('-1000000')).toBe('0.00');
  });

  it('handles very large values', () => {
    // $100 billion worth of NUSDC
    expect(formatQuoteVolume('100000000000000000')).toBe('100000000000.00');
  });

  it('formats sub-dollar amounts', () => {
    expect(formatQuoteVolume('500000')).toBe('0.50');  // $0.50
    expect(formatQuoteVolume('10000')).toBe('0.01');   // $0.01
    expect(formatQuoteVolume('1')).toBe('0.00');       // $0.000001 rounds down
  });
});

// ===== Large Trade Detection (from indexer.ts:162-177) =====
// Replicating the threshold check and message formatting logic

interface LargeTradeTestInput {
  quote_quantity: string;
  base_quantity: string;
  price: string;
  taker_is_bid: boolean;
}

interface LargeTradeOptions {
  thresholdRaw: bigint;
}

function detectLargeTrade(json: LargeTradeTestInput, opts: LargeTradeOptions): string | null {
  try {
    const quoteRaw = BigInt(json.quote_quantity || '0');
    if (quoteRaw >= opts.thresholdRaw) {
      const quoteUsd = Number(quoteRaw / 1_000_000n) + Number(quoteRaw % 1_000_000n) / 1_000_000;
      const baseQty = Number(json.base_quantity) / 1_000_000_000; // 9 decimals for base
      const side = json.taker_is_bid ? 'bought' : 'sold';
      const priceNum = Number(json.price) / 1_000_000_000; // price uses 9 decimals
      const msg = `Large trade: ${baseQty.toFixed(4)} NBTC ${side} at $${priceNum.toLocaleString('en-US', { maximumFractionDigits: 2 })} ($${quoteUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})`;
      return msg;
    }
  } catch {
    return null;
  }
  return null;
}

describe('Large Trade Detection', () => {
  // Default threshold: $1000 NUSDC = 1000 * 1_000_000 = 1_000_000_000_000 raw
  const DEFAULT_THRESHOLD = BigInt(1000) * 1_000_000n;

  it('detects trade at exactly the threshold', () => {
    const msg = detectLargeTrade({
      quote_quantity: '1000000000', // $1000 NUSDC (1000 * 1_000_000)
      base_quantity: '10000000000', // 10 NBTC (9 decimals)
      price: '100000000000',        // $100 (9 decimals)
      taker_is_bid: true,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).not.toBeNull();
    expect(msg).toContain('Large trade:');
    expect(msg).toContain('NBTC');
    expect(msg).toContain('bought');
  });

  it('ignores trade below threshold', () => {
    const msg = detectLargeTrade({
      quote_quantity: '999999999', // $999.999999 (just below $1000)
      base_quantity: '10000000000',
      price: '100000000000',
      taker_is_bid: true,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).toBeNull();
  });

  it('detects large sell trade', () => {
    const msg = detectLargeTrade({
      quote_quantity: '5000000000', // $5000
      base_quantity: '50000000000', // 50 NBTC
      price: '100000000000',
      taker_is_bid: false,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).not.toBeNull();
    expect(msg).toContain('sold');
  });

  it('detects large buy trade', () => {
    const msg = detectLargeTrade({
      quote_quantity: '50000000000', // $50,000
      base_quantity: '500000000',   // 0.5 NBTC
      price: '100000000000000',     // $100,000
      taker_is_bid: true,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).not.toBeNull();
    expect(msg).toContain('bought');
    expect(msg).toContain('0.5000'); // 0.5 NBTC
  });

  it('formats USD amount correctly for large trades', () => {
    const msg = detectLargeTrade({
      quote_quantity: '48750000000', // $48,750
      base_quantity: '500000000',    // 0.5 NBTC
      price: '97500000000000',       // $97,500
      taker_is_bid: true,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).not.toBeNull();
    expect(msg).toContain('$48,750');
  });

  it('handles zero quote quantity', () => {
    const msg = detectLargeTrade({
      quote_quantity: '0',
      base_quantity: '0',
      price: '0',
      taker_is_bid: true,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).toBeNull();
  });

  it('handles empty quote quantity', () => {
    const msg = detectLargeTrade({
      quote_quantity: '',
      base_quantity: '0',
      price: '0',
      taker_is_bid: true,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).toBeNull();
  });

  it('respects custom threshold', () => {
    const customThreshold = BigInt(100) * 1_000_000n; // $100

    const msg = detectLargeTrade({
      quote_quantity: '100000000', // $100
      base_quantity: '1000000000',
      price: '100000000000',
      taker_is_bid: true,
    }, { thresholdRaw: customThreshold });

    expect(msg).not.toBeNull();
  });

  it('handles very large trade (precision safe)', () => {
    // $10 million trade
    const msg = detectLargeTrade({
      quote_quantity: '10000000000000', // $10,000,000
      base_quantity: '100000000000',    // 100 NBTC
      price: '100000000000000',         // $100,000
      taker_is_bid: true,
    }, { thresholdRaw: DEFAULT_THRESHOLD });

    expect(msg).not.toBeNull();
    expect(msg).toContain('$10,000,000');
  });

  it('handles minimum threshold enforcement (100 NUSDC)', () => {
    // Config enforces Math.max(value, 100) minimum
    const minThreshold = BigInt(100) * 1_000_000n; // $100

    const belowMin = detectLargeTrade({
      quote_quantity: '99999999', // $99.999999
      base_quantity: '1000000000',
      price: '100000000000',
      taker_is_bid: true,
    }, { thresholdRaw: minThreshold });

    expect(belowMin).toBeNull();

    const atMin = detectLargeTrade({
      quote_quantity: '100000000', // $100
      base_quantity: '1000000000',
      price: '100000000000',
      taker_is_bid: true,
    }, { thresholdRaw: minThreshold });

    expect(atMin).not.toBeNull();
  });
});

// ===== Threshold Configuration (from types.ts:201) =====

describe('Threshold Configuration', () => {
  function computeThreshold(envValue: string | undefined): number {
    return Math.max(parseInt(envValue || '1000', 10), 100);
  }

  it('defaults to 1000 when env not set', () => {
    expect(computeThreshold(undefined)).toBe(1000);
  });

  it('uses env value when set', () => {
    expect(computeThreshold('5000')).toBe(5000);
  });

  it('enforces minimum of 100', () => {
    expect(computeThreshold('50')).toBe(100);
    expect(computeThreshold('0')).toBe(100);
    expect(computeThreshold('-1000')).toBe(100);
  });

  it('handles invalid env value (NaN propagates)', () => {
    // parseInt returns NaN for invalid strings, Math.max(NaN, 100) = NaN
    // This is a known JS quirk. The config would produce NaN, which is caught
    // by BigInt() conversion throwing at runtime. Production should validate env vars.
    expect(computeThreshold('abc')).toBeNaN();
  });

  it('handles exact minimum', () => {
    expect(computeThreshold('100')).toBe(100);
  });

  it('handles very large values', () => {
    expect(computeThreshold('1000000')).toBe(1000000);
  });
});

// ===== BigInt to Raw Conversion (from server.ts:962) =====

describe('Threshold Raw Conversion', () => {
  function computeThresholdRaw(nusdcAmount: number): bigint {
    return BigInt(nusdcAmount) * 1_000_000n;
  }

  it('converts $1000 to raw', () => {
    // $1000 * 1_000_000 (6 decimals) = 1_000_000_000
    expect(computeThresholdRaw(1000)).toBe(1_000_000_000n);
  });

  it('converts $100 to raw', () => {
    expect(computeThresholdRaw(100)).toBe(100_000_000n);
  });

  it('converts $1 to raw', () => {
    expect(computeThresholdRaw(1)).toBe(1_000_000n);
  });
});
