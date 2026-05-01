/**
 * Tests for prediction-keeper resolution criteria parser + evaluator.
 *
 * These functions decide YES/NO outcomes deterministically from market
 * metadata + a price tick, so any drift = real user funds at stake.
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

describe('parseResolutionCriteria', () => {
  it('parses the canonical 4-field block', () => {
    const c = parseResolutionCriteria(VALID);
    expect(c).not.toBeNull();
    expect(c).toMatchObject({
      source: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      symbol: 'BTCUSDT',
      comparison: '>=',
      threshold: 100000,
      tieBreak: 'NO',
    });
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

  it('rejects non-standard comparison without "price" keyword', () => {
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
});

describe('evaluateOutcome', () => {
  function make(
    overrides: Partial<ResolutionCriteria> = {},
  ): ResolutionCriteria {
    return {
      source: 'x',
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
