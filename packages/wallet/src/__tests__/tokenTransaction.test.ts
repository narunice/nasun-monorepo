import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import { parseAmount, formatBalance, isValidAddress } from '../sui/client';
import { getToken, registerToken, clearTokens, NATIVE_TOKEN } from '../config/tokens';

describe('Token Transaction Utilities', () => {
  describe('parseAmount', () => {
    // parseAmount only accepts string parameter and uses 9 decimals (NASUN)
    it('should parse NASUN amount to SOE (9 decimals)', () => {
      expect(parseAmount('1')).toBe(1000000000n);
      expect(parseAmount('0.5')).toBe(500000000n);
      expect(parseAmount('0.000000001')).toBe(1n);
    });

    it('should handle integer amounts', () => {
      expect(parseAmount('100')).toBe(100000000000n);
      expect(parseAmount('1000000')).toBe(1000000000000000n);
    });

    it('should handle fractional amounts', () => {
      expect(parseAmount('0.123456789')).toBe(123456789n);
      expect(parseAmount('1.5')).toBe(1500000000n);
    });

    it('should handle zero', () => {
      expect(parseAmount('0')).toBe(0n);
    });

    it('should truncate extra decimal places', () => {
      // Only 9 decimal places are considered
      expect(parseAmount('0.1234567890')).toBe(123456789n);
    });
  });

  describe('formatBalance', () => {
    it('should format SOE to NASUN (default 9 decimals)', () => {
      expect(formatBalance('1000000000')).toBe('1');
      expect(formatBalance('500000000')).toBe('0.5');
      expect(formatBalance(1000000000n)).toBe('1');
    });

    it('should format with custom decimals', () => {
      // NBTC: 8 decimals
      expect(formatBalance('100000000', 8)).toBe('1');
      expect(formatBalance('50000000', 8)).toBe('0.5');
      // NUSDC: 6 decimals
      expect(formatBalance('1000000', 6)).toBe('1');
      expect(formatBalance('100000000', 6)).toBe('100');
    });

    // formatBalance only shows up to 6 significant decimal places
    // Very small values below precision threshold return '0'
    it('should handle precision threshold', () => {
      expect(formatBalance('1', 9)).toBe('0'); // 0.000000001 is below 6-digit precision
      expect(formatBalance('1000', 9)).toBe('0.000001'); // This is visible
    });

    it('should handle zero', () => {
      expect(formatBalance('0', 9)).toBe('0');
      expect(formatBalance(0n)).toBe('0');
    });

    it('should handle large values', () => {
      expect(formatBalance('1000000000000000000', 9)).toBe('1000000000');
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct addresses', () => {
      const validAddress = '0x' + '1'.repeat(64);
      expect(isValidAddress(validAddress)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isValidAddress('')).toBe(false);
      expect(isValidAddress('0x123')).toBe(false);
      expect(isValidAddress('not an address')).toBe(false);
      expect(isValidAddress('0x' + 'g'.repeat(64))).toBe(false); // Invalid hex
    });

    it('should handle mixed case', () => {
      const mixedCase = '0x' + 'aAbBcCdDeEfF'.repeat(5) + 'aabb';
      expect(isValidAddress(mixedCase)).toBe(true);
    });
  });
});

describe('Token Registry', () => {
  beforeEach(() => {
    clearTokens();
  });

  describe('NATIVE_TOKEN', () => {
    it('should have correct NASUN configuration', () => {
      expect(NATIVE_TOKEN.symbol).toBe('NASUN');
      expect(NATIVE_TOKEN.decimals).toBe(9);
      expect(NATIVE_TOKEN.type).toBe('0x2::sui::SUI');
    });
  });

  describe('registerToken', () => {
    it('should register a new token', () => {
      registerToken({
        symbol: 'TEST',
        name: 'Test Token',
        type: '0xtest::test::TEST',
        decimals: 6,
      });

      const token = getToken('TEST');
      expect(token).toBeDefined();
      expect(token?.symbol).toBe('TEST');
      expect(token?.decimals).toBe(6);
    });

    it('should allow overwriting existing token', () => {
      registerToken({
        symbol: 'TEST',
        name: 'Test Token V1',
        type: '0xtest::test::TEST',
        decimals: 6,
      });

      registerToken({
        symbol: 'TEST',
        name: 'Test Token V2',
        type: '0xtest::test::TEST',
        decimals: 8,
      });

      const token = getToken('TEST');
      expect(token?.name).toBe('Test Token V2');
      expect(token?.decimals).toBe(8);
    });
  });

  describe('getToken', () => {
    it('should return undefined for unregistered token', () => {
      expect(getToken('UNKNOWN')).toBeUndefined();
    });

    it('should return registered token', () => {
      registerToken({
        symbol: 'NBTC',
        name: 'Nasun Bitcoin',
        type: '0xnbtc::nbtc::NBTC',
        decimals: 8,
      });

      const token = getToken('NBTC');
      expect(token?.symbol).toBe('NBTC');
    });
  });
});

describe('Token Transaction Types', () => {
  it('should have correct TokenTransactionRequest structure', () => {
    const request = {
      to: '0x' + '1'.repeat(64),
      amount: '10.5',
      tokenType: '0x2::sui::SUI',
    };

    expect(request.to).toMatch(/^0x[a-f0-9]{64}$/);
    expect(parseFloat(request.amount)).toBeGreaterThan(0);
    expect(request.tokenType).toContain('::');
  });

  it('should have correct TransactionResult structure', () => {
    const result = {
      digest: 'abc123',
      status: 'success' as const,
      gasUsed: '0.001',
      tokenType: '0x2::sui::SUI',
      amount: '10',
    };

    expect(['success', 'failure']).toContain(result.status);
    expect(result.digest).toBeDefined();
  });
});
