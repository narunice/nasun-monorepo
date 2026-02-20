import { describe, it, expect } from 'vitest';
import {
  parseContent,
  isCoinType,
  extractPackageId,
  getOwnerAddress,
  getOwnerDisplay,
  getOwnerLink,
} from './object-utils';

describe('object-utils', () => {
  describe('parseContent', () => {
    it('should parse moveObject content with fields', () => {
      const content = { dataType: 'moveObject', fields: { id: '0x123', value: 42 } };
      const result = parseContent(content);
      expect(result).toEqual({ fields: { id: '0x123', value: 42 } });
    });

    it('should return null for non-moveObject', () => {
      expect(parseContent({ dataType: 'package' })).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(parseContent(null)).toBeNull();
      expect(parseContent(undefined)).toBeNull();
    });

    it('should return null for non-object', () => {
      expect(parseContent('string')).toBeNull();
      expect(parseContent(42)).toBeNull();
    });

    it('should handle missing fields gracefully', () => {
      const result = parseContent({ dataType: 'moveObject' });
      expect(result).toEqual({ fields: undefined });
    });
  });

  describe('isCoinType', () => {
    it('should detect Coin types', () => {
      expect(isCoinType('0x2::coin::Coin<0x2::sui::SUI>')).toBe(true);
      expect(isCoinType('0x2::coin::Coin<0xabc::token::TOKEN>')).toBe(true);
    });

    it('should reject non-Coin types', () => {
      expect(isCoinType('0x2::nft::NFT')).toBe(false);
      expect(isCoinType('0x2::coin::CoinMetadata<0x2::sui::SUI>')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isCoinType(null)).toBe(false);
      expect(isCoinType(undefined)).toBe(false);
      expect(isCoinType('')).toBe(false);
    });
  });

  describe('extractPackageId', () => {
    it('should extract package ID from type string', () => {
      expect(extractPackageId('0x2::coin::Coin')).toBe('0x2');
      expect(extractPackageId('0xabcdef123::module::Type')).toBe('0xabcdef123');
    });

    it('should return null for invalid type strings', () => {
      expect(extractPackageId('invalid')).toBeNull();
      expect(extractPackageId(null)).toBeNull();
      expect(extractPackageId(undefined)).toBeNull();
      expect(extractPackageId('')).toBeNull();
    });
  });

  describe('getOwnerAddress', () => {
    it('should extract AddressOwner', () => {
      expect(getOwnerAddress({ AddressOwner: '0xabc' })).toBe('0xabc');
    });

    it('should extract ObjectOwner', () => {
      expect(getOwnerAddress({ ObjectOwner: '0xdef' })).toBe('0xdef');
    });

    it('should return null for Shared or Immutable', () => {
      expect(getOwnerAddress('Immutable')).toBeNull();
      expect(getOwnerAddress({ Shared: { initial_shared_version: 1 } })).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(getOwnerAddress(null)).toBeNull();
      expect(getOwnerAddress(undefined)).toBeNull();
    });
  });

  describe('getOwnerDisplay', () => {
    it('should display Immutable', () => {
      expect(getOwnerDisplay('Immutable')).toBe('Immutable');
    });

    it('should display AddressOwner address', () => {
      expect(getOwnerDisplay({ AddressOwner: '0xabc123' })).toBe('0xabc123');
    });

    it('should display ObjectOwner address', () => {
      expect(getOwnerDisplay({ ObjectOwner: '0xdef456' })).toBe('0xdef456');
    });

    it('should display Shared with version', () => {
      expect(getOwnerDisplay({ Shared: { initial_shared_version: '5' } })).toBe('Shared (v5)');
    });

    it('should return dash for null/undefined', () => {
      expect(getOwnerDisplay(null)).toBe('-');
      expect(getOwnerDisplay(undefined)).toBe('-');
    });
  });

  describe('getOwnerLink', () => {
    it('should return address link for AddressOwner', () => {
      expect(getOwnerLink({ AddressOwner: '0xabc' })).toBe('/address/0xabc');
    });

    it('should return object link for ObjectOwner', () => {
      expect(getOwnerLink({ ObjectOwner: '0xdef' })).toBe('/object/0xdef');
    });

    it('should return undefined for Shared objects', () => {
      expect(getOwnerLink({ Shared: { initial_shared_version: '1' } })).toBeUndefined();
    });

    it('should return undefined for Immutable', () => {
      expect(getOwnerLink('Immutable')).toBeUndefined();
    });

    it('should return undefined for null/undefined', () => {
      expect(getOwnerLink(null)).toBeUndefined();
      expect(getOwnerLink(undefined)).toBeUndefined();
    });
  });
});
