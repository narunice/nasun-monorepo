import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatBalance,
  parseAmount,
  isValidAddress,
  shortenAddress,
  configureWallet,
  getWalletConfig,
  isSessionPersistEnabled,
  saveSessionPassword,
  getSessionPassword,
  clearSessionPassword,
} from '../sui/client';

describe('Client Utilities', () => {
  describe('formatBalance', () => {
    it('should format zero balance', () => {
      expect(formatBalance('0')).toBe('0');
      expect(formatBalance(0n)).toBe('0');
    });

    it('should format whole numbers correctly', () => {
      expect(formatBalance('1000000000')).toBe('1'); // 1 NASUN
      expect(formatBalance('10000000000')).toBe('10'); // 10 NASUN
      expect(formatBalance('1000000000000')).toBe('1000'); // 1000 NASUN
    });

    it('should format fractional amounts', () => {
      expect(formatBalance('1500000000')).toBe('1.5'); // 1.5 NASUN
      expect(formatBalance('1234567890')).toBe('1.234567'); // max 6 decimals
      expect(formatBalance('100000000')).toBe('0.1'); // 0.1 NASUN
      expect(formatBalance('10000000')).toBe('0.01'); // 0.01 NASUN
    });

    it('should trim trailing zeros', () => {
      expect(formatBalance('1100000000')).toBe('1.1');
      expect(formatBalance('1010000000')).toBe('1.01');
      expect(formatBalance('1001000000')).toBe('1.001');
    });

    it('should handle bigint input', () => {
      expect(formatBalance(1000000000n)).toBe('1');
      expect(formatBalance(1500000000n)).toBe('1.5');
    });

    it('should handle custom decimals', () => {
      expect(formatBalance('100000000', 8)).toBe('1'); // 8 decimals (BTC-like)
      expect(formatBalance('1000000', 6)).toBe('1'); // 6 decimals (USDC-like)
    });
  });

  describe('parseAmount', () => {
    it('should parse whole numbers', () => {
      expect(parseAmount('1')).toBe(1000000000n);
      expect(parseAmount('10')).toBe(10000000000n);
      expect(parseAmount('100')).toBe(100000000000n);
    });

    it('should parse fractional amounts', () => {
      expect(parseAmount('1.5')).toBe(1500000000n);
      expect(parseAmount('0.1')).toBe(100000000n);
      expect(parseAmount('0.001')).toBe(1000000n);
    });

    it('should handle zero', () => {
      expect(parseAmount('0')).toBe(0n);
      expect(parseAmount('0.0')).toBe(0n);
    });

    it('should pad short fractions', () => {
      expect(parseAmount('1.1')).toBe(1100000000n);
      expect(parseAmount('1.01')).toBe(1010000000n);
    });

    it('should truncate long fractions', () => {
      // More than 9 decimals should be truncated
      expect(parseAmount('1.1234567891')).toBe(1123456789n);
    });

    it('should handle missing integer part', () => {
      expect(parseAmount('.5')).toBe(500000000n);
    });
  });

  describe('isValidAddress', () => {
    it('should validate correct addresses', () => {
      const validAddress = '0x' + 'a'.repeat(64);
      expect(isValidAddress(validAddress)).toBe(true);

      const validAddress2 = '0x' + '1234567890abcdef'.repeat(4);
      expect(isValidAddress(validAddress2)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      // Missing 0x prefix
      expect(isValidAddress('a'.repeat(64))).toBe(false);

      // Too short
      expect(isValidAddress('0x' + 'a'.repeat(63))).toBe(false);

      // Too long
      expect(isValidAddress('0x' + 'a'.repeat(65))).toBe(false);

      // Invalid characters
      expect(isValidAddress('0x' + 'g'.repeat(64))).toBe(false);

      // Empty
      expect(isValidAddress('')).toBe(false);
    });

    it('should be case insensitive', () => {
      const lowerCase = '0x' + 'abcdef'.repeat(10) + 'abcd';
      const upperCase = '0x' + 'ABCDEF'.repeat(10) + 'ABCD';
      const mixedCase = '0x' + 'AbCdEf'.repeat(10) + 'AbCd';

      expect(isValidAddress(lowerCase)).toBe(true);
      expect(isValidAddress(upperCase)).toBe(true);
      expect(isValidAddress(mixedCase)).toBe(true);
    });
  });

  describe('shortenAddress', () => {
    const fullAddress = '0x' + '1234567890abcdef'.repeat(4);

    it('should shorten address with default chars', () => {
      const shortened = shortenAddress(fullAddress);
      expect(shortened).toBe('0x123456...abcdef');
      expect(shortened.length).toBeLessThan(fullAddress.length);
    });

    it('should handle custom char count', () => {
      const shortened = shortenAddress(fullAddress, 4);
      expect(shortened).toBe('0x1234...cdef');
    });

    it('should handle empty address', () => {
      expect(shortenAddress('')).toBe('');
    });

    it('should handle very short char count', () => {
      const shortened = shortenAddress(fullAddress, 2);
      expect(shortened).toBe('0x12...ef');
    });
  });

  describe('Wallet Configuration', () => {
    beforeEach(() => {
      // Reset to default config
      configureWallet({
        rpcUrl: 'https://rpc.devnet.nasun.io',
        faucetUrl: 'https://faucet.devnet.nasun.io',
        networkName: 'Nasun Devnet',
        sessionPersist: false,
      });
    });

    it('should have default config', () => {
      const config = getWalletConfig();
      expect(config.rpcUrl).toBe('https://rpc.devnet.nasun.io');
      expect(config.networkName).toBe('Nasun Devnet');
    });

    it('should update config partially', () => {
      configureWallet({ rpcUrl: 'https://custom.rpc.io' });
      const config = getWalletConfig();
      expect(config.rpcUrl).toBe('https://custom.rpc.io');
      expect(config.networkName).toBe('Nasun Devnet'); // unchanged
    });

    it('should enable session persistence', () => {
      expect(isSessionPersistEnabled()).toBe(false);
      configureWallet({ sessionPersist: true });
      expect(isSessionPersistEnabled()).toBe(true);
    });
  });

  describe('Session Password', () => {
    beforeEach(() => {
      configureWallet({ sessionPersist: true });
      clearSessionPassword();
    });

    it('should save and retrieve password when enabled', () => {
      saveSessionPassword('testPassword123');
      expect(getSessionPassword()).toBe('testPassword123');
    });

    it('should clear password', () => {
      saveSessionPassword('testPassword123');
      clearSessionPassword();
      expect(getSessionPassword()).toBeNull();
    });

    it('should not save password when disabled', () => {
      configureWallet({ sessionPersist: false });
      saveSessionPassword('testPassword123');
      expect(getSessionPassword()).toBeNull();
    });

    it('should handle special characters', () => {
      const specialPassword = 'p@$$w0rd!#%^&*()';
      saveSessionPassword(specialPassword);
      expect(getSessionPassword()).toBe(specialPassword);
    });
  });
});
