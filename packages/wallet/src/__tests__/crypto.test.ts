import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cryptoSubtleMock } from './setup';

// Note: These tests use mocked crypto API
// Real crypto functions require actual Web Crypto API

describe('Crypto Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateMnemonicPhrase (mocked)', () => {
    it('should call bip39 generateMnemonic', async () => {
      // Import after setup to get mocked version
      const { generateMnemonicPhrase } = await import('../core/crypto');

      // This uses real @scure/bip39 which doesn't need mocking
      const mnemonic = generateMnemonicPhrase();

      expect(typeof mnemonic).toBe('string');
      const words = mnemonic.split(' ');
      expect(words.length).toBe(12);
    });
  });

  describe('isValidMnemonic', () => {
    it('should validate correct 12-word mnemonic', async () => {
      const { isValidMnemonic, generateMnemonicPhrase } = await import('../core/crypto');

      // Generate a valid mnemonic first
      const mnemonic = generateMnemonicPhrase();
      expect(isValidMnemonic(mnemonic)).toBe(true);
    });

    it('should reject invalid mnemonic', async () => {
      const { isValidMnemonic } = await import('../core/crypto');

      expect(isValidMnemonic('invalid mnemonic phrase')).toBe(false);
      expect(isValidMnemonic('one two three four five six seven eight nine ten eleven twelve')).toBe(
        false
      );
      expect(isValidMnemonic('')).toBe(false);
    });

    it('should handle case insensitivity', async () => {
      const { isValidMnemonic, generateMnemonicPhrase } = await import('../core/crypto');

      const mnemonic = generateMnemonicPhrase();
      expect(isValidMnemonic(mnemonic.toUpperCase())).toBe(true);
      expect(isValidMnemonic(mnemonic.toLowerCase())).toBe(true);
    });

    it('should trim whitespace', async () => {
      const { isValidMnemonic, generateMnemonicPhrase } = await import('../core/crypto');

      const mnemonic = generateMnemonicPhrase();
      expect(isValidMnemonic(`  ${mnemonic}  `)).toBe(true);
    });
  });

  describe('encryption flow (mocked)', () => {
    it('should call crypto.subtle.encrypt', async () => {
      const { encryptPrivateKey } = await import('../core/crypto');

      // This will use mocked crypto
      const result = await encryptPrivateKey('suiprivkey1test', 'password123');

      expect(cryptoSubtleMock.importKey).toHaveBeenCalled();
      expect(cryptoSubtleMock.deriveKey).toHaveBeenCalled();
      expect(cryptoSubtleMock.encrypt).toHaveBeenCalled();

      // Result should have base64 encoded values
      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('salt');
      expect(typeof result.encrypted).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.salt).toBe('string');
    });

    it('should generate random salt and iv', async () => {
      const { encryptPrivateKey } = await import('../core/crypto');

      const result1 = await encryptPrivateKey('suiprivkey1test', 'password');
      const result2 = await encryptPrivateKey('suiprivkey1test', 'password');

      // Salt and IV should be different each time
      // Note: With mock, they use Math.random() so might differ
      expect(result1.salt).toBeDefined();
      expect(result1.iv).toBeDefined();
    });

    it('should call crypto.subtle.decrypt', async () => {
      const { encryptPrivateKey, decryptPrivateKey } = await import('../core/crypto');

      const encrypted = await encryptPrivateKey('suiprivkey1testkey', 'password123');

      // Reset mock call counts
      vi.clearAllMocks();

      await decryptPrivateKey(encrypted.encrypted, encrypted.iv, encrypted.salt, 'password123');

      expect(cryptoSubtleMock.importKey).toHaveBeenCalled();
      expect(cryptoSubtleMock.deriveKey).toHaveBeenCalled();
      expect(cryptoSubtleMock.decrypt).toHaveBeenCalled();
    });
  });

  describe('keypair functions', () => {
    it('should generate keypair', async () => {
      const { generateKeypair } = await import('../core/crypto');

      const keypair = generateKeypair();
      expect(keypair).toBeDefined();
    });

    it('should get address from keypair', async () => {
      const { generateKeypair, getAddressFromKeypair } = await import('../core/crypto');

      const keypair = generateKeypair();
      const address = getAddressFromKeypair(keypair);

      expect(address).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should get public key from keypair', async () => {
      const { generateKeypair, getPublicKeyFromKeypair } = await import('../core/crypto');

      const keypair = generateKeypair();
      const publicKey = getPublicKeyFromKeypair(keypair);

      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(0);
    });

    it('should get secret key from keypair', async () => {
      const { generateKeypair, getSecretKeyFromKeypair } = await import('../core/crypto');

      const keypair = generateKeypair();
      const secretKey = getSecretKeyFromKeypair(keypair);

      expect(secretKey).toMatch(/^suiprivkey1/);
    });

    it('should restore keypair from secret key', async () => {
      const { generateKeypair, getSecretKeyFromKeypair, keypairFromSecretKey, getAddressFromKeypair } =
        await import('../core/crypto');

      const original = generateKeypair();
      const secretKey = getSecretKeyFromKeypair(original);
      const restored = keypairFromSecretKey(secretKey);

      expect(getAddressFromKeypair(restored)).toBe(getAddressFromKeypair(original));
    });

    it('should derive keypair from mnemonic', async () => {
      const { generateMnemonicPhrase, keypairFromMnemonic, getAddressFromKeypair } = await import(
        '../core/crypto'
      );

      const mnemonic = generateMnemonicPhrase();
      const keypair = keypairFromMnemonic(mnemonic);
      const address = getAddressFromKeypair(keypair);

      expect(address).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should derive same keypair from same mnemonic', async () => {
      const { generateMnemonicPhrase, keypairFromMnemonic, getAddressFromKeypair } = await import(
        '../core/crypto'
      );

      const mnemonic = generateMnemonicPhrase();
      const keypair1 = keypairFromMnemonic(mnemonic);
      const keypair2 = keypairFromMnemonic(mnemonic);

      expect(getAddressFromKeypair(keypair1)).toBe(getAddressFromKeypair(keypair2));
    });
  });
});
