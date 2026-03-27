import { describe, it, expect } from 'vitest';
import {
  formatTokenBalance,
  truncateId,
  truncateAddress,
  truncateType,
  formatBalance,
  formatTimestamp,
  formatDuration,
  formatSoe,
  formatCoinType,
  formatObjectType,
  formatPercentage,
  formatLastUpdated,
  truncateDigest,
  getTxTypeInfo,
  sanitizeJsonForDisplay,
} from './format';
import type { SuiTransactionBlockResponse } from '@mysten/sui/client';

describe('format utilities', () => {
  // ============================================
  // Existing tests (Phase 0 baseline)
  // ============================================
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
      expect(formatTokenBalance('123456789', '::nbtc::NBTC')).toBe('1.2345');
    });

    it('should handle zero balance', () => {
      expect(formatTokenBalance('0', '0x2::sui::SUI')).toBe('0');
    });

    it('should handle very large balances', () => {
      expect(formatTokenBalance('1000000000000000000', '0x2::sui::SUI')).toBe('1,000,000,000');
    });

    it('should use knownDecimals when provided', () => {
      expect(formatTokenBalance('100', '0xunknown::mod::TOKEN', 2)).toBe('1');
    });

    it('should return N/A for invalid input', () => {
      expect(formatTokenBalance('not-a-number', '0x2::sui::SUI')).toBe('N/A');
    });

    it('should trim trailing zeros in fractional part', () => {
      expect(formatTokenBalance('1100000000', '0x2::sui::SUI')).toBe('1.1');
    });
  });

  describe('truncateId', () => {
    it('should truncate long ID', () => {
      const id = '0x1234567890abcdef1234567890abcdef12345678';
      expect(truncateId(id)).toBe('0x12345678...12345678');
    });

    it('should not truncate short ID', () => {
      expect(truncateId('0x123')).toBe('0x123');
    });

    it('should respect custom startLen and endLen', () => {
      const id = '0x1234567890abcdef1234567890abcdef12345678';
      expect(truncateId(id, 6, 4)).toBe('0x1234...5678');
    });
  });

  describe('truncateAddress', () => {
    it('should truncate long address', () => {
      const addr = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(truncateAddress(addr)).toBe('0x123456...abcdef');
    });

    it('should not truncate short address', () => {
      expect(truncateAddress('0x1234')).toBe('0x1234');
    });
  });

  describe('truncateType', () => {
    it('should truncate long package type', () => {
      const type = '0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC';
      const result = truncateType(type);
      expect(result).toContain('::nusdc::NUSDC');
      expect(result.length).toBeLessThan(type.length);
    });

    it('should not truncate short type', () => {
      expect(truncateType('0x2::sui::SUI')).toBe('0x2::sui::SUI');
    });

    it('should truncate non-module types over 30 chars', () => {
      const longStr = 'a'.repeat(40);
      const result = truncateType(longStr);
      expect(result).toContain('...');
    });

    it('should not truncate short non-module types', () => {
      expect(truncateType('short')).toBe('short');
    });
  });

  // ============================================
  // Phase 1 tests
  // ============================================
  describe('formatBalance', () => {
    it('should format balance correctly', () => {
      expect(formatBalance('1000000000')).toBe('1');
      expect(formatBalance('10000000000')).toBe('10');
    });

    it('should handle zero', () => {
      expect(formatBalance('0')).toBe('0');
    });

    it('should handle undefined', () => {
      expect(formatBalance(undefined)).toBe('0');
    });

    it('should handle fractional balances', () => {
      expect(formatBalance('1500000000')).toBe('1.5');
      expect(formatBalance('100000000')).toBe('0.1');
    });

    it('should return N/A for invalid input', () => {
      expect(formatBalance('not-a-number')).toBe('N/A');
    });

    it('should format large balances with commas', () => {
      expect(formatBalance('1000000000000000000')).toBe('1,000,000,000');
    });
  });

  describe('formatTimestamp', () => {
    it('should format valid timestamp', () => {
      const result = formatTimestamp(1704067200000);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return dash for undefined/null', () => {
      expect(formatTimestamp(undefined)).toBe('-');
      expect(formatTimestamp(null)).toBe('-');
    });

    it('should handle string timestamp', () => {
      const result = formatTimestamp('1704067200000');
      expect(typeof result).toBe('string');
      expect(result).not.toBe('-');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(30000)).toBe('30s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(120000)).toBe('2m 0s');
    });

    it('should handle zero', () => {
      expect(formatDuration(0)).toBe('0s');
    });
  });

  describe('formatSoe', () => {
    it('should format number values', () => {
      expect(formatSoe(1000)).toBe('1,000 SOE');
    });

    it('should format string values', () => {
      expect(formatSoe('1000000')).toBe('1,000,000 SOE');
    });

    it('should format bigint values', () => {
      expect(formatSoe(BigInt(500))).toBe('500 SOE');
    });

    it('should return dash for undefined', () => {
      expect(formatSoe(undefined)).toBe('-');
    });
  });

  describe('formatCoinType', () => {
    it('should convert SUI to NSN', () => {
      expect(formatCoinType('0x2::sui::SUI')).toBe('NSN');
    });

    it('should return NSN for undefined', () => {
      expect(formatCoinType(undefined)).toBe('NSN');
    });

    it('should pass through non-SUI types with SUI replaced', () => {
      expect(formatCoinType('0x2::coin::Coin<0x2::sui::SUI>')).toContain('NSN');
    });
  });

  describe('formatObjectType', () => {
    it('should transform SUI references to NSN', () => {
      const result = formatObjectType('0x2::coin::Coin<0x2::sui::SUI>');
      expect(result).toContain('0x2::nasun::NSN');
    });

    it('should return dash for undefined', () => {
      expect(formatObjectType(undefined)).toBe('-');
    });

    it('should transform StakedSui to StakedNasun', () => {
      const result = formatObjectType('0x3::staking_pool::StakedSui');
      expect(result).toBe('0x3::staking_pool::StakedNasun');
    });

    it('should transform SuiSystem to NasunSystem', () => {
      const result = formatObjectType('0x3::sui_system::SuiSystem');
      expect(result).toContain('NasunSystem');
    });
  });

  describe('formatPercentage', () => {
    it('should format decimal to percentage', () => {
      expect(formatPercentage(0.0512)).toBe('5.12%');
      expect(formatPercentage(0.5)).toBe('50.00%');
      expect(formatPercentage(1.0)).toBe('100.00%');
    });

    it('should handle zero', () => {
      expect(formatPercentage(0)).toBe('0.00%');
    });
  });

  describe('formatLastUpdated', () => {
    it('should return formatted time string', () => {
      const date = new Date('2024-01-01T12:30:00');
      const result = formatLastUpdated(date);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty string for undefined', () => {
      expect(formatLastUpdated(undefined)).toBe('');
    });
  });

  describe('truncateDigest', () => {
    it('should truncate long digest', () => {
      const digest = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0UV1';
      const result = truncateDigest(digest);
      expect(result).toContain('...');
      expect(result.length).toBeLessThan(digest.length);
    });

    it('should not truncate short digest', () => {
      expect(truncateDigest('short')).toBe('short');
    });
  });

  // ============================================
  // Phase 1-5: getTxTypeInfo
  // ============================================
  describe('getTxTypeInfo', () => {
    function makeTx(transactions: Record<string, unknown>[]): SuiTransactionBlockResponse {
      return {
        digest: 'test',
        transaction: {
          data: {
            transaction: {
              kind: 'ProgrammableTransaction',
              transactions,
              inputs: [],
            },
            sender: '0x1',
            gasData: { budget: '1', owner: '0x1', payment: [], price: '1' },
            messageVersion: 'v1',
          },
          txSignatures: [],
        },
        confirmedLocalExecution: false,
      } as unknown as SuiTransactionBlockResponse;
    }

    it('should detect Publish', () => {
      const tx = makeTx([{ Publish: ['', []] }]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'Publish', variant: 'success' });
    });

    it('should detect Upgrade', () => {
      const tx = makeTx([{ Upgrade: ['', '', ''] }]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'Upgrade', variant: 'info' });
    });

    it('should detect MoveCall', () => {
      const tx = makeTx([{ MoveCall: { package: '0x2', module: 'coin', function: 'transfer' } }]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'MoveCall', variant: 'info' });
    });

    it('should detect TransferObjects', () => {
      const tx = makeTx([{ TransferObjects: [[], ''] }]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'Transfer', variant: 'default' });
    });

    it('should detect SplitCoins', () => {
      const tx = makeTx([{ SplitCoins: ['', []] }]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'SplitCoins', variant: 'default' });
    });

    it('should detect MergeCoins', () => {
      const tx = makeTx([{ MergeCoins: ['', []] }]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'MergeCoins', variant: 'default' });
    });

    it('should prioritize Publish over MoveCall', () => {
      const tx = makeTx([
        { MoveCall: { package: '0x2', module: 'coin', function: 'transfer' } },
        { Publish: ['', []] },
      ]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'Publish', variant: 'success' });
    });

    it('should return PTB for empty transactions', () => {
      const tx = makeTx([]);
      expect(getTxTypeInfo(tx)).toEqual({ label: 'PTB', variant: 'default' });
    });

    it('should handle non-ProgrammableTransaction kind', () => {
      const tx = {
        digest: 'test',
        transaction: {
          data: {
            transaction: { kind: 'ChangeEpoch' },
            sender: '0x1',
            gasData: { budget: '1', owner: '0x1', payment: [], price: '1' },
            messageVersion: 'v1',
          },
          txSignatures: [],
        },
      } as unknown as SuiTransactionBlockResponse;
      expect(getTxTypeInfo(tx)).toEqual({ label: 'ChangeEpoch', variant: 'default' });
    });

    it('should handle missing transaction data', () => {
      const tx = { digest: 'test' } as SuiTransactionBlockResponse;
      const result = getTxTypeInfo(tx);
      expect(result.variant).toBe('default');
    });
  });

  describe('sanitizeJsonForDisplay', () => {
    it('should replace 0x2::sui::SUI in strings', () => {
      expect(sanitizeJsonForDisplay('0x2::sui::SUI')).toBe('0x2::nasun::NSN');
    });

    it('should replace ::sui:: module references', () => {
      expect(sanitizeJsonForDisplay('0x2::sui::something')).toBe('0x2::nasun::something');
    });

    it('should replace StakedSui and SuiSystem', () => {
      expect(sanitizeJsonForDisplay('StakedSui')).toBe('StakedNasun');
      expect(sanitizeJsonForDisplay('SuiSystem')).toBe('NasunSystem');
    });

    it('should recursively process nested objects', () => {
      const input = {
        coinType: '0x2::sui::SUI',
        nested: { type: '0x2::coin::Coin<0x2::sui::SUI>' },
      };
      const result = sanitizeJsonForDisplay(input) as Record<string, unknown>;
      expect(result.coinType).toBe('0x2::nasun::NSN');
      expect((result.nested as Record<string, unknown>).type).toBe('0x2::coin::Coin<0x2::nasun::NSN>');
    });

    it('should process arrays', () => {
      const input = ['0x2::sui::SUI', '0x2::coin::Coin<0x2::sui::SUI>'];
      const result = sanitizeJsonForDisplay(input) as string[];
      expect(result[0]).toBe('0x2::nasun::NSN');
      expect(result[1]).toBe('0x2::coin::Coin<0x2::nasun::NSN>');
    });

    it('should preserve non-string values', () => {
      const input = { num: 42, bool: true, nil: null };
      const result = sanitizeJsonForDisplay(input);
      expect(result).toEqual({ num: 42, bool: true, nil: null });
    });
  });
});
