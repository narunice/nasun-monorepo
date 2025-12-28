import { describe, it, expect, beforeEach, vi } from 'vitest';
import { localStorageMock } from './setup';

describe('Keystore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock._setStore({});
  });

  describe('hasKeystore', () => {
    it('should return false when no keystore exists', async () => {
      const { hasKeystore } = await import('../core/keystore');
      expect(hasKeystore()).toBe(false);
    });

    it('should return true when keystore exists', async () => {
      const { hasKeystore, saveKeystore } = await import('../core/keystore');

      saveKeystore({
        encryptedPrivateKey: 'test',
        iv: 'test',
        salt: 'test',
        address: '0x' + 'a'.repeat(64),
        createdAt: Date.now(),
      });

      expect(hasKeystore()).toBe(true);
    });
  });

  describe('loadKeystore', () => {
    it('should return null when no keystore exists', async () => {
      const { loadKeystore } = await import('../core/keystore');
      expect(loadKeystore()).toBeNull();
    });

    it('should load saved keystore', async () => {
      const { loadKeystore, saveKeystore } = await import('../core/keystore');

      const testKeystore = {
        encryptedPrivateKey: 'encrypted123',
        iv: 'iv123',
        salt: 'salt123',
        address: '0x' + 'b'.repeat(64),
        createdAt: 1234567890,
      };

      saveKeystore(testKeystore);
      const loaded = loadKeystore();

      expect(loaded).toEqual(testKeystore);
    });

    it('should return null for invalid JSON', async () => {
      const { loadKeystore } = await import('../core/keystore');

      localStorage.setItem('nasun_wallet_keystore', 'invalid json');
      expect(loadKeystore()).toBeNull();
    });
  });

  describe('saveKeystore', () => {
    it('should save keystore to localStorage', async () => {
      const { saveKeystore } = await import('../core/keystore');

      const testKeystore = {
        encryptedPrivateKey: 'encrypted',
        iv: 'iv',
        salt: 'salt',
        address: '0x' + 'c'.repeat(64),
        createdAt: Date.now(),
      };

      saveKeystore(testKeystore);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'nasun_wallet_keystore',
        JSON.stringify(testKeystore)
      );
    });
  });

  describe('deleteKeystore', () => {
    it('should remove keystore from localStorage', async () => {
      const { deleteKeystore, saveKeystore, hasKeystore } = await import('../core/keystore');

      saveKeystore({
        encryptedPrivateKey: 'test',
        iv: 'test',
        salt: 'test',
        address: '0x' + 'd'.repeat(64),
        createdAt: Date.now(),
      });

      expect(hasKeystore()).toBe(true);

      deleteKeystore();

      expect(localStorage.removeItem).toHaveBeenCalledWith('nasun_wallet_keystore');
    });
  });

  describe('getStoredAddress', () => {
    it('should return null when no keystore exists', async () => {
      const { getStoredAddress } = await import('../core/keystore');
      expect(getStoredAddress()).toBeNull();
    });

    it('should return address from keystore', async () => {
      const { getStoredAddress, saveKeystore } = await import('../core/keystore');

      const address = '0x' + 'e'.repeat(64);
      saveKeystore({
        encryptedPrivateKey: 'test',
        iv: 'test',
        salt: 'test',
        address,
        createdAt: Date.now(),
      });

      expect(getStoredAddress()).toBe(address);
    });
  });

  describe('createAndSaveWallet', () => {
    it('should create and save a new wallet', async () => {
      const { createAndSaveWallet, hasKeystore, getStoredAddress } = await import(
        '../core/keystore'
      );

      const password = 'testPassword123';
      const address = await createAndSaveWallet(password);

      expect(hasKeystore()).toBe(true);
      expect(getStoredAddress()).toBe(address);
      expect(address).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('createWalletWithMnemonic', () => {
    it('should create wallet and return mnemonic', async () => {
      const { createWalletWithMnemonic, hasKeystore } = await import('../core/keystore');

      const password = 'testPassword123';
      const result = await createWalletWithMnemonic(password);

      expect(hasKeystore()).toBe(true);
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result.mnemonic.split(' ').length).toBe(12);
    });
  });

  describe('importWalletFromMnemonic', () => {
    it('should import wallet from valid mnemonic', async () => {
      const { importWalletFromMnemonic, createWalletWithMnemonic, deleteKeystore } = await import(
        '../core/keystore'
      );

      // First create a wallet to get a valid mnemonic
      const { mnemonic, address: originalAddress } = await createWalletWithMnemonic('password1');

      // Delete and reimport
      deleteKeystore();
      const importedAddress = await importWalletFromMnemonic(mnemonic, 'password2');

      expect(importedAddress).toBe(originalAddress);
    });

    it('should reject invalid mnemonic', async () => {
      const { importWalletFromMnemonic } = await import('../core/keystore');

      await expect(importWalletFromMnemonic('invalid mnemonic phrase', 'password')).rejects.toThrow(
        'Invalid mnemonic phrase'
      );
    });
  });

  describe('importWalletFromPrivateKey', () => {
    it('should import wallet from valid private key', async () => {
      const { importWalletFromPrivateKey, createAndSaveWallet, deleteKeystore, unlockKeystore } =
        await import('../core/keystore');
      const { getSecretKeyFromKeypair, getAddressFromKeypair } = await import('../core/crypto');

      // Create a wallet and get its private key
      const originalAddress = await createAndSaveWallet('password1');
      const keypair = await unlockKeystore('password1');
      const secretKey = getSecretKeyFromKeypair(keypair);

      // Delete and reimport
      deleteKeystore();
      const importedAddress = await importWalletFromPrivateKey(secretKey, 'password2');

      expect(importedAddress).toBe(originalAddress);
    });

    it('should reject invalid private key format', async () => {
      const { importWalletFromPrivateKey } = await import('../core/keystore');

      await expect(importWalletFromPrivateKey('invalidkey', 'password')).rejects.toThrow(
        'Invalid private key format'
      );
    });
  });

  describe('unlockKeystore', () => {
    it('should throw when no wallet exists', async () => {
      const { unlockKeystore } = await import('../core/keystore');

      await expect(unlockKeystore('password')).rejects.toThrow('No wallet found');
    });

    it('should unlock with correct password', async () => {
      const { createAndSaveWallet, unlockKeystore } = await import('../core/keystore');
      const { getAddressFromKeypair } = await import('../core/crypto');

      const password = 'correctPassword';
      const address = await createAndSaveWallet(password);

      const keypair = await unlockKeystore(password);
      expect(getAddressFromKeypair(keypair)).toBe(address);
    });
  });
});
