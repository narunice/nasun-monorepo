import { describe, it, expect } from 'vitest';
import { KNOWN_ADDRESSES } from './known-addresses';

describe('known-addresses', () => {
  describe('system addresses (permanent)', () => {
    it('should map Move Stdlib (0x1)', () => {
      const addr = '0x' + '0'.repeat(63) + '1';
      expect(KNOWN_ADDRESSES[addr]).toBe('Move Stdlib');
    });

    it('should map Sui Framework (0x2)', () => {
      const addr = '0x' + '0'.repeat(63) + '2';
      expect(KNOWN_ADDRESSES[addr]).toBe('Sui Framework');
    });

    it('should map Sui System (0x3)', () => {
      const addr = '0x' + '0'.repeat(63) + '3';
      expect(KNOWN_ADDRESSES[addr]).toBe('Sui System');
    });

    it('should map SuiSystem shared object (0x5)', () => {
      const addr = '0x' + '0'.repeat(63) + '5';
      expect(KNOWN_ADDRESSES[addr]).toBe('SuiSystem');
    });

    it('should map Clock (0x6)', () => {
      const addr = '0x' + '0'.repeat(63) + '6';
      expect(KNOWN_ADDRESSES[addr]).toBe('Clock');
    });

    it('should map Random (0x403)', () => {
      const addr = '0x' + '0'.repeat(61) + '403';
      expect(KNOWN_ADDRESSES[addr]).toBe('Random');
    });
  });

  describe('devnet V7 addresses', () => {
    it('should map Admin address', () => {
      expect(KNOWN_ADDRESSES['0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90']).toBe('Admin');
    });

    it('should map Token Faucet', () => {
      expect(KNOWN_ADDRESSES['0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92']).toBe('Token Faucet');
    });

    it('should map all registries', () => {
      expect(KNOWN_ADDRESSES['0x509825058d4a537d3e9dfea39120077c02c1cf68f8b33969689017ae97c8e833']).toBe('Baram Registry');
      expect(KNOWN_ADDRESSES['0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656']).toBe('Executor Registry');
      expect(KNOWN_ADDRESSES['0xf1acc0794f5aa692de3f825953b708f940c5ccd83655bf79fe0c520052588583']).toBe('AER Registry');
      expect(KNOWN_ADDRESSES['0x120434fe3c76f084b13e9a294bec0c42e95ac408cdeb7327ea5d46e822c3c290']).toBe('Attestation Registry');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for unknown addresses', () => {
      expect(KNOWN_ADDRESSES['0x9999999999999999999999999999999999999999999999999999999999999999']).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(KNOWN_ADDRESSES['']).toBeUndefined();
    });

    it('should be case-sensitive (lowercase hex)', () => {
      // All known addresses use lowercase hex
      const addr = '0x' + '0'.repeat(63) + '6';
      expect(KNOWN_ADDRESSES[addr]).toBe('Clock');
      // Uppercase should not match
      const upperAddr = '0x' + '0'.repeat(63) + '6';
      expect(KNOWN_ADDRESSES[upperAddr.replace('0x', '0X')]).toBeUndefined();
    });

    it('should have all addresses as 66-character hex strings', () => {
      for (const addr of Object.keys(KNOWN_ADDRESSES)) {
        expect(addr).toMatch(/^0x[0-9a-f]{64}$/);
      }
    });

    it('should have no duplicate labels', () => {
      const labels = Object.values(KNOWN_ADDRESSES);
      const unique = new Set(labels);
      expect(labels.length).toBe(unique.size);
    });
  });
});
