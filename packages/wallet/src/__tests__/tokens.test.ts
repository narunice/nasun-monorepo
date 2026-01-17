import { describe, it, expect, beforeEach } from 'vitest';
import {
  NATIVE_TOKEN,
  registerToken,
  registerTokens,
  getToken,
  getTokenByType,
  getAllTokens,
  isTokenRegistered,
  clearTokens,
} from '../config/tokens';
import type { TokenConfig } from '../types';

describe('Token Registry', () => {
  beforeEach(() => {
    // Reset registry before each test
    clearTokens();
  });

  describe('NATIVE_TOKEN', () => {
    it('should have correct native token config', () => {
      expect(NATIVE_TOKEN.symbol).toBe('NSN');
      expect(NATIVE_TOKEN.name).toBe('Nasun');
      expect(NATIVE_TOKEN.decimals).toBe(9);
      expect(NATIVE_TOKEN.type).toBe('0x2::sui::SUI');
    });

    it('should always have native token registered', () => {
      expect(isTokenRegistered('NSN')).toBe(true);
    });
  });

  describe('registerToken', () => {
    it('should register a new token', () => {
      const testToken: TokenConfig = {
        symbol: 'NBTC',
        name: 'Test BTC',
        decimals: 8,
        type: '0xtest::nbtc::NBTC',
      };

      registerToken(testToken);

      expect(isTokenRegistered('NBTC')).toBe(true);
      expect(getToken('NBTC')).toEqual(testToken);
    });

    it('should be retrievable by type', () => {
      const testToken: TokenConfig = {
        symbol: 'NUSDC',
        name: 'Test USDC',
        decimals: 6,
        type: '0xtest::nusdc::NUSDC',
      };

      registerToken(testToken);

      expect(getTokenByType('0xtest::nusdc::NUSDC')).toEqual(testToken);
    });

    it('should overwrite existing token with same symbol', () => {
      const token1: TokenConfig = {
        symbol: 'TEST',
        name: 'Test Token 1',
        decimals: 8,
        type: '0xtest::test::TEST1',
      };
      const token2: TokenConfig = {
        symbol: 'TEST',
        name: 'Test Token 2',
        decimals: 6,
        type: '0xtest::test::TEST2',
      };

      registerToken(token1);
      registerToken(token2);

      expect(getToken('TEST')).toEqual(token2);
    });
  });

  describe('registerTokens', () => {
    it('should register multiple tokens at once', () => {
      const tokens: TokenConfig[] = [
        { symbol: 'NBTC', name: 'Test BTC', decimals: 8, type: '0xtest::nbtc::NBTC' },
        { symbol: 'NUSDC', name: 'Test USDC', decimals: 6, type: '0xtest::nusdc::NUSDC' },
        { symbol: 'NETH', name: 'Test ETH', decimals: 18, type: '0xtest::neth::NETH' },
      ];

      registerTokens(tokens);

      expect(isTokenRegistered('NBTC')).toBe(true);
      expect(isTokenRegistered('NUSDC')).toBe(true);
      expect(isTokenRegistered('NETH')).toBe(true);
    });
  });

  describe('getToken', () => {
    it('should return token by symbol', () => {
      const token = getToken('NSN');
      expect(token).toEqual(NATIVE_TOKEN);
    });

    it('should return undefined for unregistered token', () => {
      expect(getToken('UNKNOWN')).toBeUndefined();
    });
  });

  describe('getTokenByType', () => {
    it('should return token by coin type', () => {
      const token = getTokenByType('0x2::sui::SUI');
      expect(token).toEqual(NATIVE_TOKEN);
    });

    it('should return undefined for unknown type', () => {
      expect(getTokenByType('0xunknown::token::TOKEN')).toBeUndefined();
    });
  });

  describe('getAllTokens', () => {
    it('should return all registered tokens', () => {
      const tokens = getAllTokens();
      expect(tokens).toContainEqual(NATIVE_TOKEN);
      expect(tokens.length).toBeGreaterThanOrEqual(1);
    });

    it('should include newly registered tokens', () => {
      const testToken: TokenConfig = {
        symbol: 'TEST',
        name: 'Test',
        decimals: 8,
        type: '0xtest::test::TEST',
      };

      registerToken(testToken);
      const tokens = getAllTokens();

      expect(tokens).toContainEqual(NATIVE_TOKEN);
      expect(tokens).toContainEqual(testToken);
      expect(tokens.length).toBe(2);
    });
  });

  describe('isTokenRegistered', () => {
    it('should return true for registered token', () => {
      expect(isTokenRegistered('NSN')).toBe(true);
    });

    it('should return false for unregistered token', () => {
      expect(isTokenRegistered('UNKNOWN')).toBe(false);
    });
  });

  describe('clearTokens', () => {
    it('should clear all tokens except native', () => {
      registerTokens([
        { symbol: 'NBTC', name: 'Test BTC', decimals: 8, type: '0xtest::nbtc::NBTC' },
        { symbol: 'NUSDC', name: 'Test USDC', decimals: 6, type: '0xtest::nusdc::NUSDC' },
      ]);

      expect(getAllTokens().length).toBe(3);

      clearTokens();

      expect(getAllTokens().length).toBe(1);
      expect(isTokenRegistered('NSN')).toBe(true);
      expect(isTokenRegistered('NBTC')).toBe(false);
      expect(isTokenRegistered('NUSDC')).toBe(false);
    });
  });
});
