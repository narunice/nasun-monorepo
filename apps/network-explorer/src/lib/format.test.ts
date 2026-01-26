import { describe, it, expect } from 'vitest';
import { formatTokenBalance, truncateId, formatBalance, formatTimestamp } from './format';

describe('format utilities', () => {
  describe('formatTokenBalance', () => {
    it('should format NSN (9 decimals) correctly', () => {
      expect(formatTokenBalance('1000000000', '0x2::sui::SUI')).toBe('1');
      expect(formatTokenBalance('1500000000', '0x2::sui::SUI')).toBe('1.5');
      expect(formatTokenBalance('1000000', '0x2::sui::SUI')).toBe('0.001');
    });

    it('should format NUSDC (6 decimals) correctly', () => {
      expect(formatTokenBalance('1000000', '::nusdc::NUSDC')).toBe('1');
      expect(formatTokenBalance('1500000', '::nusdc::NUSDC')).toBe('1.5');
    });

    it('should format NBTC (8 decimals) correctly', () => {
      expect(formatTokenBalance('100000000', '::nbtc::NBTC')).toBe('1');
      expect(formatTokenBalance('123456789', '::nbtc::NBTC')).toBe('1.2345'); // Max 4 digits
    });
  });

  describe('truncateId', () => {
    it('should truncate long ID', () => {
      const id = '0x1234567890abcdef1234567890abcdef12345678';
      expect(truncateId(id)).toBe('0x12345678...12345678');
    });

    it('should not truncate short ID', () => {
      const id = '0x123';
      expect(truncateId(id)).toBe('0x123');
    });
  });

  describe('formatBalance', () => {
    it('should format balance correctly', () => {
      expect(formatBalance('1000000000')).toBe('1');
      expect(formatBalance('10000000000')).toBe('10');
    });
  });

  describe('formatTimestamp', () => {
    it('should format timestamp correctly', () => {
      const ts = 1704067200000; // 2024-01-01 00:00:00 UTC
      // Note: locale string can vary by environment, but we can check if it returns a string
      expect(typeof formatTimestamp(ts)).toBe('string');
      expect(formatTimestamp(undefined)).toBe('-');
    });
  });
});
