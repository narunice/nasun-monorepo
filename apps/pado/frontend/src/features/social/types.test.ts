/**
 * Trade Share Parsing Tests
 * Tests for isTradeShare() and parseTradeShare() with extensive edge cases.
 */

import { describe, it, expect } from 'vitest';
import { isTradeShare, parseTradeShare, type TradeShareData } from './types';

// ========================================
// isTradeShare
// ========================================

describe('isTradeShare', () => {
  it('returns true for valid [TRADE] prefix', () => {
    expect(isTradeShare('[TRADE]{"pair":"NBTC/NUSDC"}')).toBe(true);
  });

  it('returns true for [TRADE] prefix with any content', () => {
    expect(isTradeShare('[TRADE]garbage')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isTradeShare('')).toBe(false);
  });

  it('returns false for plain text message', () => {
    expect(isTradeShare('Hello traders!')).toBe(false);
  });

  it('returns false for lowercase [trade]', () => {
    expect(isTradeShare('[trade]{"pair":"NBTC/NUSDC"}')).toBe(false);
  });

  it('returns false for [TRADE] in the middle of text', () => {
    expect(isTradeShare('Check this [TRADE]{"pair":"NBTC"}')).toBe(false);
  });

  it('returns false for [SYSTEM] prefix', () => {
    expect(isTradeShare('[SYSTEM]some message')).toBe(false);
  });

  it('returns true for [TRADE] only (no payload)', () => {
    expect(isTradeShare('[TRADE]')).toBe(true);
  });
});

// ========================================
// parseTradeShare — Valid Cases
// ========================================

describe('parseTradeShare — valid cases', () => {
  const validPayload: TradeShareData = {
    pair: 'NBTC/NUSDC',
    side: 'BUY',
    price: 97500.50,
    qty: 0.5,
    total: 48750.25,
    tx: 'abc12345def67890',
  };

  it('parses a complete valid BUY trade share', () => {
    const content = '[TRADE]' + JSON.stringify(validPayload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
    expect(result!.pair).toBe('NBTC/NUSDC');
    expect(result!.side).toBe('BUY');
    expect(result!.price).toBe(97500.50);
    expect(result!.qty).toBe(0.5);
    expect(result!.total).toBe(48750.25);
    expect(result!.tx).toBe('abc12345def67890');
  });

  it('parses a complete valid SELL trade share', () => {
    const payload = { ...validPayload, side: 'SELL' };
    const content = '[TRADE]' + JSON.stringify(payload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
    expect(result!.side).toBe('SELL');
  });

  it('parses trade with PnL data', () => {
    const payload = { ...validPayload, pnl: 1500.42, pnlPct: 3.07 };
    const content = '[TRADE]' + JSON.stringify(payload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
    expect(result!.pnl).toBe(1500.42);
    expect(result!.pnlPct).toBe(3.07);
  });

  it('parses trade with negative PnL', () => {
    const payload = { ...validPayload, pnl: -500, pnlPct: -2.5 };
    const content = '[TRADE]' + JSON.stringify(payload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
    expect(result!.pnl).toBe(-500);
    expect(result!.pnlPct).toBe(-2.5);
  });

  it('parses trade with zero values', () => {
    const payload = { ...validPayload, price: 0, qty: 0, total: 0 };
    const content = '[TRADE]' + JSON.stringify(payload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
    expect(result!.price).toBe(0);
  });

  it('parses trade with shortened tx digest (dots allowed)', () => {
    const payload = { ...validPayload, tx: 'abc12345...6789' };
    const content = '[TRADE]' + JSON.stringify(payload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
    expect(result!.tx).toBe('abc12345...6789');
  });

  it('parses trade with base64-like tx (+ and = and / allowed)', () => {
    const payload = { ...validPayload, tx: 'abc+def/ghi==' };
    const content = '[TRADE]' + JSON.stringify(payload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
  });

  it('ignores extra fields in the JSON', () => {
    const payload = { ...validPayload, extraField: 'hacker', nested: { a: 1 } };
    const content = '[TRADE]' + JSON.stringify(payload);
    const result = parseTradeShare(content);
    expect(result).not.toBeNull();
    expect(result!.pair).toBe('NBTC/NUSDC');
  });
});

// ========================================
// parseTradeShare — Invalid Cases (Security)
// ========================================

describe('parseTradeShare — invalid / malformed input', () => {
  it('returns null for non-[TRADE] prefixed content', () => {
    expect(parseTradeShare('Hello world')).toBeNull();
  });

  it('returns null for [TRADE] with empty payload', () => {
    expect(parseTradeShare('[TRADE]')).toBeNull();
  });

  it('returns null for [TRADE] with invalid JSON', () => {
    expect(parseTradeShare('[TRADE]{invalid json}')).toBeNull();
  });

  it('returns null for [TRADE] with JSON array', () => {
    expect(parseTradeShare('[TRADE][1,2,3]')).toBeNull();
  });

  it('returns null for [TRADE] with JSON string', () => {
    expect(parseTradeShare('[TRADE]"hello"')).toBeNull();
  });

  it('returns null for [TRADE] with JSON number', () => {
    expect(parseTradeShare('[TRADE]42')).toBeNull();
  });

  it('returns null when pair is missing', () => {
    const payload = { side: 'BUY', price: 100, qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when side is invalid', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'LONG', price: 100, qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when side is lowercase', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'buy', price: 100, qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when price is NaN', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: NaN, qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when price is Infinity', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: Infinity, qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when price is negative', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: -100, qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when price is a string', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: '100', qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when qty is negative', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: -1, total: -100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when total is negative', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: -100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when tx is missing', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100 };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when tx is a number', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: 12345 };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when tx exceeds 64 chars', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: 'a'.repeat(65) };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when tx contains special characters (URL injection)', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: '../../malicious?q=1' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when tx contains HTML tags', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: '<script>alert(1)</script>' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when tx contains spaces', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: 'abc 123' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when pair is too long (>30 chars)', () => {
    const payload = { pair: 'A'.repeat(31), side: 'BUY', price: 100, qty: 1, total: 100, tx: 'abc' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when pnl is present but not a number', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: 'abc', pnl: 'huge' };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when pnlPct is NaN', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: 'abc', pnlPct: NaN };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });

  it('returns null when pnlPct is Infinity', () => {
    const payload = { pair: 'NBTC/NUSDC', side: 'BUY', price: 100, qty: 1, total: 100, tx: 'abc', pnlPct: Infinity };
    expect(parseTradeShare('[TRADE]' + JSON.stringify(payload))).toBeNull();
  });
});

// ========================================
// parseTradeShare — HTML entity encoding (MEDIUM-1 edge case)
// ========================================

describe('parseTradeShare — server-sanitized content', () => {
  it('returns null when quotes are HTML-encoded by server sanitization', () => {
    // Server sanitizeContent converts " to &quot;
    const sanitized = '[TRADE]{&quot;pair&quot;:&quot;NBTC/NUSDC&quot;,&quot;side&quot;:&quot;BUY&quot;,&quot;price&quot;:100,&quot;qty&quot;:1,&quot;total&quot;:100,&quot;tx&quot;:&quot;abc&quot;}';
    expect(parseTradeShare(sanitized)).toBeNull();
  });

  it('returns null when content has escaped HTML entities', () => {
    const content = '[TRADE]{\\&quot;pair\\&quot;:\\&quot;test\\&quot;}';
    expect(parseTradeShare(content)).toBeNull();
  });
});
