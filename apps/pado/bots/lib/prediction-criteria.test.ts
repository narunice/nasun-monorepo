/**
 * Tests for prediction-keeper resolution criteria parser + evaluator.
 *
 * These functions decide YES/NO outcomes deterministically from market
 * metadata + a price reading, so any drift = real user funds at stake.
 */

import { describe, it, expect } from 'vitest';
import {
  parseResolutionCriteria,
  evaluateOutcome,
  type ResolutionCriteria,
} from './prediction-criteria.js';

const VALID = `Source: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
Reading time: 2026-05-19 00:00:00 UTC
Comparison: price >= 100000
Tie-breaking: NO if exactly equal`;

const VALID_STOCK = `Source: https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day
Symbol: AAPL
Currency: USD
Reading time: 2026-06-30 20:00:00 UTC
Comparison: close > 250
Tie-breaking: NO`;

const VALID_KR_STOCK = `Source: https://api.twelvedata.com/time_series?symbol=005930.KS&interval=1day
Symbol: 005930.KS
Currency: KRW
Reading time: 2026-06-30 06:30:00 UTC
Comparison: close > 90,001
Tie-breaking: NO`;

describe('parseResolutionCriteria — crypto', () => {
  it('parses the canonical crypto block', () => {
    const c = parseResolutionCriteria(VALID);
    expect(c).not.toBeNull();
    expect(c).toMatchObject({
      kind: 'crypto',
      source: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      sourceHost: 'api.binance.com',
      symbol: 'BTCUSDT',
      comparison: '>=',
      threshold: 100000,
      tieBreak: 'NO',
    });
    expect(c?.currency).toBeUndefined();
  });

  it('uppercases the extracted symbol', () => {
    const text = VALID.replace('BTCUSDT', 'btcusdt');
    const c = parseResolutionCriteria(text);
    expect(c?.symbol).toBe('BTCUSDT');
  });

  it.each(['>=', '>', '<=', '<'] as const)('accepts comparison operator %s', (op) => {
    const text = VALID.replace('>= 100000', `${op} 50000`);
    const c = parseResolutionCriteria(text);
    expect(c?.comparison).toBe(op);
    expect(c?.threshold).toBe(50000);
  });

  it('parses fractional thresholds', () => {
    const text = VALID.replace('>= 100000', '>= 0.5');
    const c = parseResolutionCriteria(text);
    expect(c?.threshold).toBe(0.5);
  });

  it.each(['YES', 'NO', 'N/A'] as const)('accepts tie-break %s', (tie) => {
    const text = VALID.replace('NO if exactly equal', `${tie} if exactly equal`);
    const c = parseResolutionCriteria(text);
    expect(c?.tieBreak).toBe(tie);
  });

  it('returns null when Source is missing', () => {
    const text = VALID.split('\n').slice(1).join('\n');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('returns null when Comparison is missing', () => {
    const text = VALID.replace('Comparison: price >= 100000\n', '');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('returns null when Tie-breaking is missing', () => {
    const text = VALID.replace('Tie-breaking: NO if exactly equal', '');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('returns null when source URL has no ?symbol= param', () => {
    const text = VALID.replace(
      'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      'https://api.binance.com/api/v3/ticker/price',
    );
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('returns null when threshold is zero or negative', () => {
    const t1 = VALID.replace('>= 100000', '>= 0');
    expect(parseResolutionCriteria(t1)).toBeNull();
  });

  it('rejects non-standard comparison without "price"/"close" keyword', () => {
    const text = VALID.replace('Comparison: price >= 100000', 'Comparison: >= 100000');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('tolerates extra whitespace inside fields', () => {
    const text = VALID.replace('Comparison: price >= 100000', 'Comparison:   price   >=   100000');
    const c = parseResolutionCriteria(text);
    expect(c?.threshold).toBe(100000);
    expect(c?.comparison).toBe('>=');
  });

  it('accepts &symbol= as well as ?symbol=', () => {
    const text = VALID.replace('?symbol=BTCUSDT', '?foo=bar&symbol=ETHUSDT');
    const c = parseResolutionCriteria(text);
    expect(c?.symbol).toBe('ETHUSDT');
  });

  it('rejects unknown source host', () => {
    const text = VALID.replace('api.binance.com', 'evil.example.com');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('rejects http (non-TLS) source URL', () => {
    const text = VALID.replace('https://', 'http://');
    expect(parseResolutionCriteria(text)).toBeNull();
  });
});

describe('parseResolutionCriteria — stock', () => {
  it('parses Twelve Data US stock block', () => {
    const c = parseResolutionCriteria(VALID_STOCK);
    expect(c).not.toBeNull();
    expect(c).toMatchObject({
      kind: 'stock',
      sourceHost: 'api.twelvedata.com',
      symbol: 'AAPL',
      currency: 'USD',
      comparison: '>',
      threshold: 250,
      tieBreak: 'NO',
    });
  });

  it('parses KR stock with dotted ticker and KRW thousands separators', () => {
    const c = parseResolutionCriteria(VALID_KR_STOCK);
    expect(c).not.toBeNull();
    expect(c?.symbol).toBe('005930.KS');
    expect(c?.currency).toBe('KRW');
    expect(c?.threshold).toBe(90001);
  });

  it('accepts Yahoo Finance host', () => {
    const text = VALID_STOCK.replace(
      'https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day',
      'https://query1.finance.yahoo.com/v8/finance/chart/AAPL',
    );
    const c = parseResolutionCriteria(text);
    expect(c?.kind).toBe('stock');
    expect(c?.sourceHost).toBe('query1.finance.yahoo.com');
    expect(c?.symbol).toBe('AAPL');
  });

  it('rejects stock block without Symbol field', () => {
    const text = VALID_STOCK.replace('Symbol: AAPL\n', '');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('rejects stock block without Currency field', () => {
    const text = VALID_STOCK.replace('Currency: USD\n', '');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('rejects symbol with disallowed characters', () => {
    const text = VALID_STOCK.replace('Symbol: AAPL', 'Symbol: AAPL$$');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it('rejects 3-letter currency that is not all uppercase', () => {
    // Regex requires uppercase, so "Usd" should fail.
    const text = VALID_STOCK.replace('Currency: USD', 'Currency: usd');
    expect(parseResolutionCriteria(text)).toBeNull();
  });

  it.each(['>', '<', '>=', '<='] as const)('accepts comparison %s for stock', (op) => {
    const text = VALID_STOCK.replace('> 250', `${op} 270`);
    const c = parseResolutionCriteria(text);
    expect(c?.comparison).toBe(op);
    expect(c?.threshold).toBe(270);
  });

  it('accepts uppercase ticker even when written lowercase', () => {
    const text = VALID_STOCK.replace('Symbol: AAPL', 'Symbol: aapl');
    const c = parseResolutionCriteria(text);
    expect(c?.symbol).toBe('AAPL');
  });
});

describe('evaluateOutcome', () => {
  function make(
    overrides: Partial<ResolutionCriteria> = {},
  ): ResolutionCriteria {
    return {
      kind: 'crypto',
      source: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      sourceHost: 'api.binance.com',
      symbol: 'BTCUSDT',
      comparison: '>=',
      threshold: 100,
      tieBreak: 'NO',
      ...overrides,
    };
  }

  describe('non-tie cases (price !== threshold)', () => {
    it('>= 100 with price 101 -> YES', () => {
      expect(evaluateOutcome(make({ comparison: '>=' }), 101)).toBe(true);
    });
    it('>= 100 with price 99 -> NO', () => {
      expect(evaluateOutcome(make({ comparison: '>=' }), 99)).toBe(false);
    });
    it('> 100 with price 101 -> YES', () => {
      expect(evaluateOutcome(make({ comparison: '>' }), 101)).toBe(true);
    });
    it('< 100 with price 99 -> YES', () => {
      expect(evaluateOutcome(make({ comparison: '<' }), 99)).toBe(true);
    });
    it('<= 100 with price 101 -> NO', () => {
      expect(evaluateOutcome(make({ comparison: '<=' }), 101)).toBe(false);
    });
  });

  describe('exact tie (price === threshold)', () => {
    it('tieBreak YES overrides any comparison', () => {
      expect(evaluateOutcome(make({ tieBreak: 'YES', comparison: '<' }), 100)).toBe(true);
      expect(evaluateOutcome(make({ tieBreak: 'YES', comparison: '<=' }), 100)).toBe(true);
      expect(evaluateOutcome(make({ tieBreak: 'YES', comparison: '>' }), 100)).toBe(true);
    });

    it('tieBreak NO overrides any comparison', () => {
      expect(evaluateOutcome(make({ tieBreak: 'NO', comparison: '>=' }), 100)).toBe(false);
      expect(evaluateOutcome(make({ tieBreak: 'NO', comparison: '>' }), 100)).toBe(false);
      expect(evaluateOutcome(make({ tieBreak: 'NO', comparison: '<' }), 100)).toBe(false);
    });

    it('tieBreak N/A falls through to >= -> YES on equality', () => {
      expect(evaluateOutcome(make({ tieBreak: 'N/A', comparison: '>=' }), 100)).toBe(true);
    });

    it('tieBreak N/A falls through to <= -> YES on equality', () => {
      expect(evaluateOutcome(make({ tieBreak: 'N/A', comparison: '<=' }), 100)).toBe(true);
    });

    it('tieBreak N/A falls through to > -> NO on equality (boundary-sensitive)', () => {
      expect(evaluateOutcome(make({ tieBreak: 'N/A', comparison: '>' }), 100)).toBe(false);
    });

    it('tieBreak N/A falls through to < -> NO on equality (boundary-sensitive)', () => {
      expect(evaluateOutcome(make({ tieBreak: 'N/A', comparison: '<' }), 100)).toBe(false);
    });
  });

  it('handles fractional thresholds at exact tie', () => {
    expect(evaluateOutcome(make({ threshold: 0.5, tieBreak: 'YES' }), 0.5)).toBe(true);
    expect(evaluateOutcome(make({ threshold: 0.5, tieBreak: 'NO' }), 0.5)).toBe(false);
  });
});
