/**
 * Tests for passkey core utilities.
 *
 * Covers:
 * - createPasskeyWallet (mnemonic generation, encryption, storage)
 * - unlockPasskeyWallet (decryption roundtrip)
 * - Storage management (save/get/clear)
 * - Credential management (add/remove/update)
 * - Edge cases (invalid data, remove last credential)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { PasskeyCredential, PasskeyWalletState } from '../types/passkey';
import { PasskeyError } from '../types/passkey';
import {
  createPasskeyWallet,
  unlockPasskeyWallet,
  getPasskeyWallet,
  clearPasskeyWallet,
  addCredentialToWallet,
  removeCredentialFromWallet,
  updateCredentialLastUsed,
} from '../core/passkey';

// ============================================
// Test Helpers
// ============================================

function createMockCredential(overrides?: Partial<PasskeyCredential>): PasskeyCredential {
  return {
    id: 'dGVzdC1jcmVkZW50aWFsLWlk',
    publicKey: 'dGVzdC1wdWJsaWMta2V5',
    algorithm: -7,
    authenticatorType: 'platform',
    discoverable: true,
    userVerification: 'required',
    createdAt: Date.now(),
    name: 'Test Passkey',
    ...overrides,
  };
}

function createSecondCredential(): PasskeyCredential {
  return createMockCredential({
    id: 'c2Vjb25kLWNyZWRlbnRpYWw',
    name: 'Second Passkey',
    createdAt: Date.now() + 1000,
  });
}

// ============================================
// Tests
// ============================================

describe('Passkey Core', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ------------------------------------------
  // createPasskeyWallet
  // ------------------------------------------
  describe('createPasskeyWallet', () => {
    it('should create wallet with mnemonic and valid state', async () => {
      const credential = createMockCredential();
      const { wallet, keypair, mnemonic } = await createPasskeyWallet(credential);

      // Mnemonic should be 12 words
      expect(mnemonic.split(' ')).toHaveLength(12);

      // Wallet state should be complete
      expect(wallet.address).toBeTruthy();
      expect(wallet.address).toMatch(/^0x[a-f0-9]{64}$/);
      expect(wallet.primaryCredentialId).toBe(credential.id);
      expect(wallet.credentials).toHaveLength(1);
      expect(wallet.credentials[0].id).toBe(credential.id);
      expect(wallet.encryptedPrivateKey).toBeTruthy();
      expect(wallet.iv).toBeTruthy();
      expect(wallet.salt).toBeTruthy();
      expect(wallet.keyDerivationMethod).toBe('credential-id');
      expect(wallet.createdAt).toBeGreaterThan(0);

      // Keypair address should match wallet address
      expect(keypair.toSuiAddress()).toBe(wallet.address);
    });

    it('should generate unique mnemonics per call', async () => {
      const cred1 = createMockCredential({ id: 'cred-1' });
      const cred2 = createMockCredential({ id: 'cred-2' });

      const result1 = await createPasskeyWallet(cred1);
      localStorage.clear();
      const result2 = await createPasskeyWallet(cred2);

      expect(result1.mnemonic).not.toBe(result2.mnemonic);
      expect(result1.wallet.address).not.toBe(result2.wallet.address);
    });

    it('should save wallet to localStorage automatically', async () => {
      const credential = createMockCredential();
      await createPasskeyWallet(credential);

      const stored = getPasskeyWallet();
      expect(stored).not.toBeNull();
      expect(stored!.address).toBeTruthy();
      expect(stored!.primaryCredentialId).toBe(credential.id);
    });

    it('should produce unique encryption salt and IV per call', async () => {
      const cred1 = createMockCredential({ id: 'cred-a' });
      const result1 = await createPasskeyWallet(cred1);
      const salt1 = result1.wallet.salt;
      const iv1 = result1.wallet.iv;

      localStorage.clear();

      const cred2 = createMockCredential({ id: 'cred-b' });
      const result2 = await createPasskeyWallet(cred2);
      const salt2 = result2.wallet.salt;
      const iv2 = result2.wallet.iv;

      // Salt and IV should be unique per wallet creation
      expect(salt1).not.toBe(salt2);
      expect(iv1).not.toBe(iv2);
    });
  });

  // ------------------------------------------
  // unlockPasskeyWallet (roundtrip)
  // ------------------------------------------
  describe('unlockPasskeyWallet', () => {
    it('should decrypt and return same keypair after create', async () => {
      const credential = createMockCredential();
      const { wallet, keypair: originalKeypair } = await createPasskeyWallet(credential);

      const unlockedKeypair = await unlockPasskeyWallet(wallet);

      // Same address
      expect(unlockedKeypair.toSuiAddress()).toBe(originalKeypair.toSuiAddress());

      // Same public key
      expect(unlockedKeypair.getPublicKey().toBase64()).toBe(
        originalKeypair.getPublicKey().toBase64()
      );
    });

    it('should work after reading wallet from localStorage', async () => {
      const credential = createMockCredential();
      const { keypair: originalKeypair } = await createPasskeyWallet(credential);

      // Simulate browser restart: read from storage
      const storedWallet = getPasskeyWallet()!;
      expect(storedWallet).not.toBeNull();

      const unlockedKeypair = await unlockPasskeyWallet(storedWallet);
      expect(unlockedKeypair.toSuiAddress()).toBe(originalKeypair.toSuiAddress());
    });

    it('should fail with tampered encryptedPrivateKey', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);

      // Tamper with encrypted data
      const tamperedWallet: PasskeyWalletState = {
        ...wallet,
        encryptedPrivateKey: 'dGFtcGVyZWQ', // "tampered" in base64url
      };

      await expect(unlockPasskeyWallet(tamperedWallet)).rejects.toThrow(PasskeyError);
      await expect(unlockPasskeyWallet(tamperedWallet)).rejects.toMatchObject({
        type: 'DECRYPTION_FAILED',
      });
    });

    it('should fail with tampered IV', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);

      const tamperedWallet: PasskeyWalletState = {
        ...wallet,
        iv: 'YmFkLWl2LWRhdGE', // wrong IV
      };

      await expect(unlockPasskeyWallet(tamperedWallet)).rejects.toThrow(PasskeyError);
    });

    it('should fail with tampered salt', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);

      const tamperedWallet: PasskeyWalletState = {
        ...wallet,
        salt: 'YmFkLXNhbHQtZGF0YQ', // wrong salt → wrong derived key
      };

      await expect(unlockPasskeyWallet(tamperedWallet)).rejects.toThrow(PasskeyError);
    });

    it('should fail with different credential ID in wallet state', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);

      // Using a different credential ID would derive a different key
      const tamperedWallet: PasskeyWalletState = {
        ...wallet,
        primaryCredentialId: 'ZGlmZmVyZW50LWlk',
      };

      await expect(unlockPasskeyWallet(tamperedWallet)).rejects.toThrow(PasskeyError);
    });

    it('should produce deterministic results (same wallet → same keypair)', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);

      const keypair1 = await unlockPasskeyWallet(wallet);
      const keypair2 = await unlockPasskeyWallet(wallet);

      expect(keypair1.toSuiAddress()).toBe(keypair2.toSuiAddress());
      expect(keypair1.getPublicKey().toBase64()).toBe(keypair2.getPublicKey().toBase64());
    });
  });

  // ------------------------------------------
  // Storage Management
  // ------------------------------------------
  describe('Storage Management', () => {
    it('getPasskeyWallet should return null when nothing stored', () => {
      expect(getPasskeyWallet()).toBeNull();
    });

    it('savePasskeyWallet + getPasskeyWallet roundtrip', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);

      const retrieved = getPasskeyWallet();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.address).toBe(wallet.address);
      expect(retrieved!.primaryCredentialId).toBe(wallet.primaryCredentialId);
      expect(retrieved!.salt).toBe(wallet.salt);
      expect(retrieved!.iv).toBe(wallet.iv);
    });

    it('clearPasskeyWallet should remove wallet from storage', async () => {
      const credential = createMockCredential();
      await createPasskeyWallet(credential);

      expect(getPasskeyWallet()).not.toBeNull();
      clearPasskeyWallet();
      expect(getPasskeyWallet()).toBeNull();
    });

    it('getPasskeyWallet should return null for invalid JSON', () => {
      localStorage.setItem('nasun:passkey:wallet', 'not-valid-json{');
      expect(getPasskeyWallet()).toBeNull();
    });

    it('savePasskeyWallet should overwrite existing wallet', async () => {
      const cred1 = createMockCredential({ id: 'cred-1' });
      const { wallet: wallet1 } = await createPasskeyWallet(cred1);
      expect(getPasskeyWallet()!.primaryCredentialId).toBe('cred-1');

      const cred2 = createMockCredential({ id: 'cred-2' });
      const { wallet: wallet2 } = await createPasskeyWallet(cred2);
      expect(getPasskeyWallet()!.primaryCredentialId).toBe('cred-2');

      expect(wallet1.address).not.toBe(wallet2.address);
    });
  });

  // ------------------------------------------
  // Credential Management
  // ------------------------------------------
  describe('Credential Management', () => {
    it('addCredentialToWallet should add credential and save', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);
      expect(wallet.credentials).toHaveLength(1);

      const secondCred = createSecondCredential();
      const updated = addCredentialToWallet(wallet, secondCred);

      expect(updated.credentials).toHaveLength(2);
      expect(updated.credentials[1].id).toBe(secondCred.id);

      // Should be persisted
      const stored = getPasskeyWallet()!;
      expect(stored.credentials).toHaveLength(2);
    });

    it('removeCredentialFromWallet should remove non-primary credential', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);
      const secondCred = createSecondCredential();
      const withTwo = addCredentialToWallet(wallet, secondCred);

      const updated = removeCredentialFromWallet(withTwo, secondCred.id);
      expect(updated.credentials).toHaveLength(1);
      expect(updated.credentials[0].id).toBe(credential.id);
      expect(updated.primaryCredentialId).toBe(credential.id);
    });

    it('removeCredentialFromWallet should throw when removing primary credential', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);
      const secondCred = createSecondCredential();
      const withTwo = addCredentialToWallet(wallet, secondCred);

      // Primary credential cannot be removed — must delete wallet instead
      expect(() => removeCredentialFromWallet(withTwo, credential.id)).toThrow(PasskeyError);
      expect(() => removeCredentialFromWallet(withTwo, credential.id)).toThrow(
        'Cannot remove primary credential'
      );
    });

    it('removeCredentialFromWallet should throw when removing last credential', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);

      // When there's only one credential and it's primary, "last credential" check fires first
      expect(() => removeCredentialFromWallet(wallet, credential.id)).toThrow(PasskeyError);
      expect(() => removeCredentialFromWallet(wallet, credential.id)).toThrow(
        'Cannot remove the last credential'
      );
    });

    it('updateCredentialLastUsed should set timestamp', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);
      expect(wallet.credentials[0].lastUsedAt).toBeUndefined();

      const before = Date.now();
      const updated = updateCredentialLastUsed(wallet, credential.id);
      const after = Date.now();

      expect(updated.credentials[0].lastUsedAt).toBeGreaterThanOrEqual(before);
      expect(updated.credentials[0].lastUsedAt).toBeLessThanOrEqual(after);

      // Should be persisted
      const stored = getPasskeyWallet()!;
      expect(stored.credentials[0].lastUsedAt).toBe(updated.credentials[0].lastUsedAt);
    });

    it('updateCredentialLastUsed should only update matching credential', async () => {
      const credential = createMockCredential();
      const { wallet } = await createPasskeyWallet(credential);
      const secondCred = createSecondCredential();
      const withTwo = addCredentialToWallet(wallet, secondCred);

      const updated = updateCredentialLastUsed(withTwo, secondCred.id);
      expect(updated.credentials[0].lastUsedAt).toBeUndefined(); // first unchanged
      expect(updated.credentials[1].lastUsedAt).toBeDefined(); // second updated
    });
  });

  // ------------------------------------------
  // PasskeyError
  // ------------------------------------------
  describe('PasskeyError', () => {
    it('should have correct name and type', () => {
      const err = new PasskeyError('CANCELLED', 'User cancelled');
      expect(err.name).toBe('PasskeyError');
      expect(err.type).toBe('CANCELLED');
      expect(err.message).toBe('User cancelled');
      expect(err instanceof Error).toBe(true);
    });
  });
});
