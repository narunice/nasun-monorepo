/**
 * Ethereum Utility Unit Tests
 */

import {
  normalizeAddress,
  validateMessageFormat,
} from '../src/utils/ethereum';

describe('normalizeAddress', () => {
  it('should convert address to lowercase', () => {
    expect(normalizeAddress('0x742D35CC6634C0532925A3B844BC9E7595F0BEB')).toBe(
      '0x742d35cc6634c0532925a3b844bc9e7595f0beb'
    );
  });

  it('should handle already lowercase addresses', () => {
    const addr = '0x742d35cc6634c0532925a3b844bc9e7595f0beb';
    expect(normalizeAddress(addr)).toBe(addr);
  });
});

describe('validateMessageFormat', () => {
  const timestamp = '2026-02-18T12:00:00.000Z';

  describe('join action', () => {
    it('should accept valid English join message', () => {
      const message = `Join Nasun Frontiers Whitelist

⚠️ This signature does NOT transfer any funds
⚠️ This is only to verify you own this wallet

Timestamp: ${timestamp}`;

      expect(validateMessageFormat(message, timestamp, 'join')).toBe(true);
    });

    it('should accept valid Korean join message', () => {
      const message = `Nasun 프론티어스 화이트리스트 참여

⚠️ 이 서명으로 자금이 이체되지 않습니다
⚠️ 이 지갑이 본인 소유인지 확인하기 위함입니다

Timestamp: ${timestamp}`;

      expect(validateMessageFormat(message, timestamp, 'join')).toBe(true);
    });

    it('should reject message with wrong timestamp', () => {
      const message = `Join Nasun Frontiers Whitelist

⚠️ This signature does NOT transfer any funds
⚠️ This is only to verify you own this wallet

Timestamp: 2026-02-18T11:00:00.000Z`;

      expect(validateMessageFormat(message, timestamp, 'join')).toBe(false);
    });

    it('should reject malformed message', () => {
      const message = `Join Whitelist\nTimestamp: ${timestamp}`;
      expect(validateMessageFormat(message, timestamp, 'join')).toBe(false);
    });
  });

  describe('withdraw action', () => {
    it('should accept valid English withdraw message', () => {
      const message = `Withdraw from Nasun Frontiers Whitelist

⚠️ This signature does NOT transfer any funds
⚠️ This is only to verify you own this wallet

Timestamp: ${timestamp}`;

      expect(validateMessageFormat(message, timestamp, 'withdraw')).toBe(true);
    });

    it('should accept valid Korean withdraw message', () => {
      const message = `Nasun 프론티어스 화이트리스트 철회

⚠️ 이 서명으로 자금이 이체되지 않습니다
⚠️ 이 지갑이 본인 소유인지 확인하기 위함입니다

Timestamp: ${timestamp}`;

      expect(validateMessageFormat(message, timestamp, 'withdraw')).toBe(true);
    });

    it('should reject join message for withdraw action', () => {
      const message = `Join Nasun Frontiers Whitelist

⚠️ This signature does NOT transfer any funds
⚠️ This is only to verify you own this wallet

Timestamp: ${timestamp}`;

      expect(validateMessageFormat(message, timestamp, 'withdraw')).toBe(false);
    });
  });
});
