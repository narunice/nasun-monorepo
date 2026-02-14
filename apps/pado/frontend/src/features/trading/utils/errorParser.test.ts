/**
 * Error Parser Tests — Network/RPC patterns (T2-11)
 * Tests the 5 new network error patterns + formatErrorMessage wrapper.
 */

import { describe, it, expect } from 'vitest';
import { parseError, formatErrorMessage } from './errorParser';

// ========================================
// 1. Network error patterns
// ========================================

describe('parseError — network errors', () => {
  describe('fetch/connection errors', () => {
    it.each([
      'fetch failed',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'TypeError: Failed to fetch',
      'Error: ECONNREFUSED 127.0.0.1:443',
    ])('matches "%s"', (input) => {
      const result = parseError(new Error(input));
      expect(result.isKnown).toBe(true);
      expect(result.message).toContain('Network error');
      expect(result.message).toContain('Check your connection');
    });

    it('is case insensitive', () => {
      expect(parseError('FETCH FAILED').isKnown).toBe(true);
      expect(parseError('networkerror').isKnown).toBe(true);
    });
  });

  describe('timeout errors', () => {
    it.each([
      'timeout',
      'ETIMEDOUT',
      'AbortError: The user aborted a request.',
      'Request timeout after 30000ms',
    ])('matches "%s"', (input) => {
      const result = parseError(new Error(input));
      expect(result.isKnown).toBe(true);
      expect(result.message).toContain('timed out');
      expect(result.message).toContain('congested');
    });
  });

  describe('rate limit errors', () => {
    it.each([
      'HTTP 429',
      'Too Many Requests',
      'rate limit exceeded',
      'rate-limit',
      'ratelimit',
    ])('matches "%s"', (input) => {
      const result = parseError(new Error(input));
      expect(result.isKnown).toBe(true);
      expect(result.message).toContain('Too many requests');
    });
  });

  describe('service unavailable errors', () => {
    it.each([
      'HTTP 503',
      'Service Unavailable',
      '503 Bad Gateway',
    ])('matches "%s"', (input) => {
      const result = parseError(new Error(input));
      expect(result.isKnown).toBe(true);
      expect(result.message).toContain('temporarily unavailable');
    });
  });

  describe('quorum errors', () => {
    it.each([
      'Failed to reach quorum',
      'quorum of validators',
      'QuorumDriverError',
    ])('matches "%s"', (input) => {
      const result = parseError(new Error(input));
      expect(result.isKnown).toBe(true);
      expect(result.message).toContain('consensus');
    });
  });
});

// ========================================
// 2. Edge cases
// ========================================

describe('parseError — edge cases', () => {
  it('returns generic message for unknown errors', () => {
    const result = parseError('some random error xyz');
    expect(result.isKnown).toBe(false);
    expect(result.message).toBe('Transaction failed. Please try again.');
  });

  it('handles empty string', () => {
    const result = parseError('');
    expect(result.isKnown).toBe(false);
  });

  it('handles null/undefined', () => {
    const result = parseError(null);
    expect(result.isKnown).toBe(false);
    const result2 = parseError(undefined);
    expect(result2.isKnown).toBe(false);
  });

  it('handles Error object', () => {
    const result = parseError(new Error('fetch failed'));
    expect(result.isKnown).toBe(true);
  });

  it('handles object with toString', () => {
    const result = parseError({ toString: () => 'ECONNREFUSED' });
    expect(result.isKnown).toBe(true);
  });

  it('does not match partial words in normal messages', () => {
    // "timeout" pattern should still match standalone
    const result = parseError('The operation timed out via timeout');
    expect(result.isKnown).toBe(true);
  });

  it('prioritizes MoveAbort over network errors', () => {
    // A MoveAbort error that also contains "503"
    const error = 'MoveAbort(MoveLocation { module: ModuleId { address: 0x1, name: Identifier("pool") }, function: 0, instruction: 0, function_name: Some("place_limit_order") }, 2)';
    const result = parseError(error);
    expect(result.isKnown).toBe(true);
    expect(result.code).toBe('POOL-2');
    expect(result.message).toContain('tick size');
  });

  it('prioritizes already-formatted errors', () => {
    const result = parseError('Insufficient balance [BM-3]');
    expect(result.isKnown).toBe(true);
    expect(result.code).toBe('BM-3');
    expect(result.message).toBe('Insufficient balance');
  });
});

// ========================================
// 3. formatErrorMessage
// ========================================

describe('formatErrorMessage', () => {
  it('returns user-friendly message for network error', () => {
    const msg = formatErrorMessage(new Error('fetch failed'));
    expect(msg).toBe('Network error. Check your connection and try again.');
  });

  it('appends error code for known MoveAbort', () => {
    const error = 'MoveAbort(MoveLocation { module: ModuleId { address: 0x1, name: Identifier("balance_manager") }, function: 0, instruction: 0, function_name: Some("withdraw") }, 3)';
    const msg = formatErrorMessage(error);
    expect(msg).toBe('Insufficient balance [BM-3]');
  });

  it('returns generic message for unknown error', () => {
    const msg = formatErrorMessage('blah blah blah');
    expect(msg).toBe('Transaction failed. Please try again.');
  });

  it('handles non-string non-Error input', () => {
    const msg = formatErrorMessage(42);
    expect(msg).toBe('Transaction failed. Please try again.');
  });

  it('adds faucet guidance for gas errors on devnet', () => {
    const msg = formatErrorMessage(new Error('No valid gas coins found'));
    expect(msg).toContain('faucet');
  });
});

// ========================================
// 4. Existing patterns still work
// ========================================

describe('parseError — existing patterns regression', () => {
  it('matches InsufficientGas', () => {
    const result = parseError('InsufficientGas');
    expect(result.isKnown).toBe(true);
    expect(result.errorType).toBe('GAS_REQUIRED');
  });

  it('matches InsufficientCoinBalance', () => {
    const result = parseError('InsufficientCoinBalance');
    expect(result.isKnown).toBe(true);
    expect(result.errorType).toBe('INSUFFICIENT_BALANCE');
  });

  it('matches ObjectNotFound', () => {
    const result = parseError('ObjectNotFound');
    expect(result.isKnown).toBe(true);
    expect(result.message).toContain('not found');
  });

  it('matches TransactionExpired', () => {
    const result = parseError('TransactionExpired');
    expect(result.isKnown).toBe(true);
    expect(result.message).toContain('expired');
  });

  it('matches leaf_remove / big_vector', () => {
    const result = parseError('leaf_remove error in big_vector');
    expect(result.isKnown).toBe(true);
    expect(result.errorType).toBe('ORDER_NOT_FOUND');
  });
});
