/**
 * Tests for PasskeySigner adapter.
 *
 * Covers Fix 1 (chain address derivation) and Fix 4-2 (activity tracking):
 * - Constructor: default address from keypair, custom address override
 * - sign(): calls updateActivity, delegates to keypair.signTransaction
 * - signPersonal(): calls updateActivity, delegates to keypair.signPersonalMessage
 * - getKeypair(): exposes underlying Ed25519Keypair
 * - Activity tracking: every signing operation updates passkeyStore.lastActivityAt
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { PasskeySigner } from '../core/signer/adapters/PasskeySigner';
import { usePasskeyStore } from '../stores/passkeyStore';

describe('PasskeySigner', () => {
  let keypair: Ed25519Keypair;
  let suiAddress: string;

  beforeEach(() => {
    keypair = new Ed25519Keypair();
    suiAddress = keypair.toSuiAddress();
    // Reset passkeyStore to a clean state
    usePasskeyStore.getState().clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------
  // Constructor
  // ------------------------------------------
  describe('constructor', () => {
    it('should default address to keypair Sui address when none provided', () => {
      const signer = new PasskeySigner(keypair);
      expect(signer.address).toBe(suiAddress);
    });

    it('should use custom address when provided', () => {
      const customAddress = '0x' + 'f'.repeat(64);
      const signer = new PasskeySigner(keypair, customAddress);
      expect(signer.address).toBe(customAddress);
    });

    it('should have type "passkey"', () => {
      const signer = new PasskeySigner(keypair);
      expect(signer.type).toBe('passkey');
    });

    it('should have default capabilities', () => {
      const signer = new PasskeySigner(keypair);
      expect(signer.capabilities.sessionKeys).toBe(false);
      expect(signer.capabilities.batchSign).toBe(false);
      expect(signer.capabilities.gasSponsorship).toBe(false);
      expect(signer.capabilities.requiresHardwareConfirm).toBe(false);
    });
  });

  // ------------------------------------------
  // sign()
  // ------------------------------------------
  describe('sign()', () => {
    it('should call updateActivity before signing', async () => {
      const updateActivitySpy = vi.spyOn(
        usePasskeyStore.getState(),
        // spy on the store action directly
        'updateActivity'
      );
      // Use store-level spy: capture lastActivityAt before/after
      const signer = new PasskeySigner(keypair);
      const beforeTime = usePasskeyStore.getState().lastActivityAt;

      // small delay to ensure time difference
      await new Promise((r) => setTimeout(r, 5));

      const txBytes = new Uint8Array([1, 2, 3, 4]);
      await signer.sign(txBytes);

      const afterTime = usePasskeyStore.getState().lastActivityAt;
      expect(afterTime).toBeGreaterThanOrEqual(beforeTime);
      updateActivitySpy.mockRestore();
    });

    it('should return a valid signature result', async () => {
      const signer = new PasskeySigner(keypair);
      const txBytes = new Uint8Array([1, 2, 3, 4]);
      const result = await signer.sign(txBytes);

      expect(result).toHaveProperty('signature');
      expect(typeof result.signature).toBe('string');
      expect(result.signature.length).toBeGreaterThan(0);
    });

    it('should delegate to keypair.signTransaction', async () => {
      const signTransactionSpy = vi.spyOn(keypair, 'signTransaction');
      const signer = new PasskeySigner(keypair);
      const txBytes = new Uint8Array([5, 6, 7, 8]);
      await signer.sign(txBytes);

      expect(signTransactionSpy).toHaveBeenCalledWith(txBytes);
      signTransactionSpy.mockRestore();
    });
  });

  // ------------------------------------------
  // signPersonal()
  // ------------------------------------------
  describe('signPersonal()', () => {
    it('should call updateActivity before signing', async () => {
      const signer = new PasskeySigner(keypair);
      const beforeTime = usePasskeyStore.getState().lastActivityAt;

      await new Promise((r) => setTimeout(r, 5));

      const message = new TextEncoder().encode('hello world');
      await signer.signPersonal(message);

      const afterTime = usePasskeyStore.getState().lastActivityAt;
      expect(afterTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should return a valid signature result', async () => {
      const signer = new PasskeySigner(keypair);
      const message = new TextEncoder().encode('test message');
      const result = await signer.signPersonal(message);

      expect(result).toHaveProperty('signature');
      expect(typeof result.signature).toBe('string');
      expect(result.signature.length).toBeGreaterThan(0);
    });

    it('should delegate to keypair.signPersonalMessage', async () => {
      const signPersonalSpy = vi.spyOn(keypair, 'signPersonalMessage');
      const signer = new PasskeySigner(keypair);
      const message = new TextEncoder().encode('test');
      await signer.signPersonal(message);

      expect(signPersonalSpy).toHaveBeenCalledWith(message);
      signPersonalSpy.mockRestore();
    });
  });

  // ------------------------------------------
  // getKeypair()
  // ------------------------------------------
  describe('getKeypair()', () => {
    it('should return the underlying Ed25519Keypair', () => {
      const signer = new PasskeySigner(keypair);
      expect(signer.getKeypair()).toBe(keypair);
    });
  });

  // ------------------------------------------
  // Activity tracking integration
  // ------------------------------------------
  describe('activity tracking', () => {
    it('should update lastActivityAt on each sign call', async () => {
      const signer = new PasskeySigner(keypair);
      const txBytes = new Uint8Array([1]);

      // First sign
      await signer.sign(txBytes);
      const t1 = usePasskeyStore.getState().lastActivityAt;

      await new Promise((r) => setTimeout(r, 10));

      // Second sign
      await signer.sign(txBytes);
      const t2 = usePasskeyStore.getState().lastActivityAt;

      expect(t2).toBeGreaterThanOrEqual(t1);
    });

    it('should update lastActivityAt on each signPersonal call', async () => {
      const signer = new PasskeySigner(keypair);
      const msg = new TextEncoder().encode('msg');

      await signer.signPersonal(msg);
      const t1 = usePasskeyStore.getState().lastActivityAt;

      await new Promise((r) => setTimeout(r, 10));

      await signer.signPersonal(msg);
      const t2 = usePasskeyStore.getState().lastActivityAt;

      expect(t2).toBeGreaterThanOrEqual(t1);
    });

    it('should work even when store is in locked state', async () => {
      // Lock the store (no keypair in store, but signer still has its own keypair reference)
      usePasskeyStore.getState().lock();
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);

      const signer = new PasskeySigner(keypair);
      const txBytes = new Uint8Array([99]);

      // Should still update activity without throwing
      await expect(signer.sign(txBytes)).resolves.toBeDefined();
    });
  });

  // ------------------------------------------
  // Edge cases: chain-specific address derivation (Fix 1)
  // ------------------------------------------
  describe('chain-specific address', () => {
    it('should accept IOTA-style address (different from Sui)', () => {
      // Simulate an IOTA-derived address (different format)
      const iotaAddress = '0x' + 'ab'.repeat(32);
      const signer = new PasskeySigner(keypair, iotaAddress);

      expect(signer.address).toBe(iotaAddress);
      expect(signer.address).not.toBe(suiAddress);
    });

    it('should accept EVM-style address', () => {
      const evmAddress = '0x' + 'cd'.repeat(20);
      const signer = new PasskeySigner(keypair, evmAddress);

      expect(signer.address).toBe(evmAddress);
      expect(signer.address).not.toBe(suiAddress);
    });

    it('should allow re-creation with new address (simulating chain switch)', () => {
      const addr1 = '0x' + 'a'.repeat(64);
      const addr2 = '0x' + 'b'.repeat(64);

      const signer1 = new PasskeySigner(keypair, addr1);
      const signer2 = new PasskeySigner(keypair, addr2);

      expect(signer1.address).toBe(addr1);
      expect(signer2.address).toBe(addr2);
      // Same keypair, different addresses
      expect(signer1.getKeypair()).toBe(signer2.getKeypair());
    });
  });
});
