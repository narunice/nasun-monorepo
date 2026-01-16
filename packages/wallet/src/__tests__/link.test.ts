/**
 * Nasun Link v2 Tests
 *
 * Tests for URL-based token distribution system.
 */

import { describe, it, expect } from 'vitest';

// Types
import type {
  LinkType,
  LinkStatus,
  LinkCoinType,
  LinkConfig,
  LinkData,
  ClaimResult,
  ClaimCondition,
  SerializableLinkConfig,
} from '../core/link/types';

import { serializeLinkConfig, deserializeLinkConfig } from '../core/link/types';

// Crypto utilities
import {
  generateEphemeralKeypair,
  deriveKey,
  encryptPayload,
  decryptPayload,
  generateSecret,
  generateLinkId,
  recoverKeypair,
  hashPassword,
  verifyPassword,
} from '../core/link/crypto';

// Generator
import {
  estimateLinkCreationGas,
  validateLinkConfig,
} from '../core/link/generator';

// Claim processor
import {
  validateClaim,
  parseLinkUrl,
  getClaimStatus,
} from '../core/link/claim';

// ======================================
// Type Tests
// ======================================

describe('Link Types', () => {
  describe('LinkType', () => {
    it('should accept valid link types', () => {
      const types: LinkType[] = ['single', 'multi', 'first-n'];
      expect(types).toHaveLength(3);
    });
  });

  describe('LinkStatus', () => {
    it('should accept valid link statuses', () => {
      const statuses: LinkStatus[] = ['active', 'claimed', 'expired', 'cancelled'];
      expect(statuses).toHaveLength(4);
    });
  });

  describe('LinkCoinType', () => {
    it('should define coin types', () => {
      const types: LinkCoinType[] = [
        'NASUN',
        '0x123::token::TOKEN',
      ];
      expect(types).toHaveLength(2);
    });
  });

  describe('LinkConfig', () => {
    it('should define valid link config structure', () => {
      const config: LinkConfig = {
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
        maxClaims: 1,
        expiresAt: Date.now() + 86400000,
        message: 'Test link',
      };

      expect(config.type).toBe('single');
      expect(config.amount).toBe(1000000000n);
      expect(config.maxClaims).toBe(1);
    });

    it('should accept link config with conditions', () => {
      const config: LinkConfig = {
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
        conditions: [
          { type: 'password', hash: 'abc123' },
          { type: 'twitter', handle: 'example_user' },
        ],
      };

      expect(config.conditions).toHaveLength(2);
    });
  });

  describe('ClaimCondition', () => {
    it('should define valid claim conditions', () => {
      const conditions: ClaimCondition[] = [
        { type: 'password', hash: 'hash123' },
        { type: 'twitter', handle: 'example_user' },
        { type: 'email', domain: 'example.com' },
      ];

      expect(conditions).toHaveLength(3);
    });
  });

  describe('LinkData', () => {
    it('should define valid link data structure', () => {
      const data: LinkData = {
        id: 'link123',
        creator: '0xCreator1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        config: {
          type: 'single',
          coinType: 'NASUN',
          amount: '1000000000',
        },
        ephemeralAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        encryptedPayload: 'encrypted123',
        createdAt: Date.now(),
        status: 'active',
        claimCount: 0,
      };

      expect(data.id).toBe('link123');
      expect(data.status).toBe('active');
    });
  });

  describe('ClaimResult', () => {
    it('should define claim result', () => {
      const result: ClaimResult = {
        txDigest: 'tx123',
        amount: 1000000000n,
        recipient: '0xrecipient',
        linkId: 'link123',
      };

      expect(result.txDigest).toBe('tx123');
      expect(result.amount).toBe(1000000000n);
    });
  });

  describe('serializeLinkConfig / deserializeLinkConfig', () => {
    it('should serialize and deserialize link config', () => {
      const config: LinkConfig = {
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
        maxClaims: 1,
        message: 'Test',
      };

      const serialized = serializeLinkConfig(config);
      const deserialized = deserializeLinkConfig(serialized);

      expect(deserialized.type).toBe(config.type);
      expect(deserialized.amount).toBe(config.amount);
      expect(deserialized.maxClaims).toBe(config.maxClaims);
      expect(deserialized.message).toBe(config.message);
    });

    it('should convert bigint to string when serializing', () => {
      const config: LinkConfig = {
        type: 'multi',
        coinType: 'NASUN',
        amount: 9999999999999n,
        maxClaims: 10,
      };

      const serialized = serializeLinkConfig(config);

      expect(typeof serialized.amount).toBe('string');
      expect(serialized.amount).toBe('9999999999999');
    });
  });
});

// ======================================
// Crypto Tests
// ======================================

describe('Link Crypto', () => {
  describe('generateEphemeralKeypair', () => {
    it('should generate a valid Ed25519 keypair', () => {
      const keypair = generateEphemeralKeypair();

      expect(keypair).toBeDefined();
      expect(keypair.toSuiAddress()).toBeTruthy();
      expect(keypair.toSuiAddress()).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should generate unique keypairs', () => {
      const keypair1 = generateEphemeralKeypair();
      const keypair2 = generateEphemeralKeypair();

      expect(keypair1.toSuiAddress()).not.toBe(keypair2.toSuiAddress());
    });
  });

  describe('generateSecret', () => {
    it('should generate a 32-byte secret by default', () => {
      const secret = generateSecret();

      expect(secret).toBeTruthy();
      expect(secret.length).toBeGreaterThan(30); // Base64 of 32 bytes is ~43 chars
    });

    it('should generate URL-safe secret', () => {
      const secret = generateSecret();

      // Should not contain +, /, or = (URL unsafe)
      expect(secret).not.toMatch(/[+/=]/);
    });

    it('should generate unique secrets', () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();

      expect(secret1).not.toBe(secret2);
    });

    it('should respect custom length', () => {
      const shortSecret = generateSecret(16);
      const longSecret = generateSecret(64);

      expect(shortSecret.length).toBeLessThan(longSecret.length);
    });
  });

  describe('generateLinkId', () => {
    it('should generate 16-character link ID', () => {
      const address = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const linkId = generateLinkId(address);

      expect(linkId).toBe('1234567890abcdef');
      expect(linkId.length).toBe(16);
    });

    it('should extract correct portion of address', () => {
      const address = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const linkId = generateLinkId(address);

      expect(linkId).toBe('abcdef1234567890');
    });
  });

  describe('deriveKey', () => {
    it('should derive a CryptoKey from secret', async () => {
      const secret = 'test-secret-123';
      const key = await deriveKey(secret);

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      // Mock returns a simple key object
    });

    it('should derive key for different secrets', async () => {
      const key1 = await deriveKey('secret1');
      const key2 = await deriveKey('secret2');

      // Both should return valid keys
      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
    });
  });

  describe('encryptPayload / decryptPayload', () => {
    it('should encrypt and decrypt private key string', async () => {
      const privateKey = 'suiprivkey1qqvz3yz47xt92ws7cvqygy3nkqn32v52nhr6ggtw3xvl09q3mxmxglxhtwd';
      const secret = generateSecret();

      const encrypted = await encryptPayload(privateKey, secret);
      const decrypted = await decryptPayload(encrypted, secret);

      expect(decrypted).toBe(privateKey);
    });

    it('should produce different ciphertext for same plaintext due to random IV', async () => {
      const privateKey = 'suiprivkey1qqtest12345';
      const secret = generateSecret();

      const encrypted1 = await encryptPayload(privateKey, secret);
      const encrypted2 = await encryptPayload(privateKey, secret);

      // Due to random IV, ciphertexts should differ
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce different encryptions for same plaintext', async () => {
      // Due to random IV, encrypting the same data twice produces different ciphertexts
      const privateKey = 'suiprivkey1qqtest12345';
      const secret = generateSecret();

      const encrypted1 = await encryptPayload(privateKey, secret);
      const encrypted2 = await encryptPayload(privateKey, secret);

      // Verify both decrypt to the same value
      const decrypted1 = await decryptPayload(encrypted1, secret);
      const decrypted2 = await decryptPayload(encrypted2, secret);

      expect(decrypted1).toBe(privateKey);
      expect(decrypted2).toBe(privateKey);
    });

    it('should produce base64 encoded output', async () => {
      const privateKey = 'suiprivkey1qqtest12345';
      const secret = generateSecret();

      const encrypted = await encryptPayload(privateKey, secret);

      // Should be valid base64
      expect(() => atob(encrypted)).not.toThrow();
    });
  });

  describe('recoverKeypair', () => {
    it('should recover keypair from encrypted payload', async () => {
      const original = generateEphemeralKeypair();
      const privateKey = original.getSecretKey();
      const secret = generateSecret();

      const encrypted = await encryptPayload(privateKey, secret);
      const recovered = await recoverKeypair(encrypted, secret);

      expect(recovered.toSuiAddress()).toBe(original.toSuiAddress());
    });
  });

  describe('hashPassword / verifyPassword', () => {
    it('should hash password deterministically', async () => {
      const password = 'mysecretpassword';

      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different passwords', async () => {
      const hash1 = await hashPassword('password1');
      const hash2 = await hashPassword('password2');

      expect(hash1).not.toBe(hash2);
    });

    it('should verify correct password', async () => {
      const password = 'correctpassword';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await hashPassword('correctpassword');

      const isValid = await verifyPassword('wrongpassword', hash);

      expect(isValid).toBe(false);
    });
  });
});

// ======================================
// Generator Tests
// ======================================

describe('Link Generator', () => {
  describe('validateLinkConfig', () => {
    it('should validate correct single link config', () => {
      const config: LinkConfig = {
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
      };

      const result = validateLinkConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject zero amount', () => {
      const config: LinkConfig = {
        type: 'single',
        coinType: 'NASUN',
        amount: 0n,
      };

      const result = validateLinkConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Amount must be positive');
    });

    it('should reject negative amount', () => {
      const config: LinkConfig = {
        type: 'single',
        coinType: 'NASUN',
        amount: -1n,
      };

      const result = validateLinkConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Amount'))).toBe(true);
    });

    it('should validate multi link requires maxClaims', () => {
      const config: LinkConfig = {
        type: 'multi',
        coinType: 'NASUN',
        amount: 1000000000n,
        // Missing maxClaims
      };

      const result = validateLinkConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('maxClaims'))).toBe(true);
    });

    it('should validate first-n link requires maxClaims', () => {
      const config: LinkConfig = {
        type: 'first-n',
        coinType: 'NASUN',
        amount: 1000000000n,
        // Missing maxClaims
      };

      const result = validateLinkConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('maxClaims'))).toBe(true);
    });

    it('should accept valid multi link config', () => {
      const config: LinkConfig = {
        type: 'multi',
        coinType: 'NASUN',
        amount: 1000000000n,
        maxClaims: 10,
      };

      const result = validateLinkConfig(config);

      expect(result.valid).toBe(true);
    });

    it('should reject expired link', () => {
      const config: LinkConfig = {
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
        expiresAt: Date.now() - 1000, // Already expired
      };

      const result = validateLinkConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('expir'))).toBe(true);
    });
  });

  describe('estimateLinkCreationGas', () => {
    it('should estimate gas for native token', async () => {
      const gas = await estimateLinkCreationGas('0x2::sui::SUI', 1000000000n);

      expect(gas).toBeGreaterThan(0n);
    });

    it('should estimate higher gas for non-native token', async () => {
      const nativeGas = await estimateLinkCreationGas('0x2::sui::SUI', 1000000000n);
      const tokenGas = await estimateLinkCreationGas('0x123::token::TOKEN', 1000000000n);

      expect(tokenGas).toBeGreaterThan(nativeGas);
    });
  });
});

// ======================================
// Claim Processor Tests
// ======================================

describe('Claim Processor', () => {
  describe('validateClaim', () => {
    const createBaseLink = (): LinkData => ({
      id: 'testlink12345678',
      creator: '0xCreator1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
      config: serializeLinkConfig({
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
      }),
      ephemeralAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      encryptedPayload: 'encrypted123',
      createdAt: Date.now(),
      status: 'active',
      claimCount: 0,
    });

    it('should validate active single link', async () => {
      const link = createBaseLink();
      const result = await validateClaim(link);

      expect(result.canClaim).toBe(true);
    });

    it('should reject already claimed single link', async () => {
      const claimedLink = createBaseLink();
      claimedLink.status = 'claimed';
      claimedLink.claimCount = 1;

      const result = await validateClaim(claimedLink);

      expect(result.canClaim).toBe(false);
      expect(result.reason).toContain('claimed');
    });

    it('should reject expired link', async () => {
      const expiredLink = createBaseLink();
      expiredLink.config = serializeLinkConfig({
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
        expiresAt: Date.now() - 1000,
      });

      const result = await validateClaim(expiredLink);

      expect(result.canClaim).toBe(false);
      expect(result.reason?.toLowerCase()).toContain('expired');
    });

    it('should reject cancelled link', async () => {
      const cancelledLink = createBaseLink();
      cancelledLink.status = 'cancelled';

      const result = await validateClaim(cancelledLink);

      expect(result.canClaim).toBe(false);
      expect(result.reason).toContain('cancelled');
    });

    it('should allow multi link with remaining claims', async () => {
      const multiLink = createBaseLink();
      multiLink.config = serializeLinkConfig({
        type: 'multi',
        coinType: 'NASUN',
        amount: 1000000000n,
        maxClaims: 10,
      });
      multiLink.claimCount = 5;

      const result = await validateClaim(multiLink);

      expect(result.canClaim).toBe(true);
    });

    it('should reject multi link with no remaining claims', async () => {
      const exhaustedLink = createBaseLink();
      exhaustedLink.config = serializeLinkConfig({
        type: 'multi',
        coinType: 'NASUN',
        amount: 1000000000n,
        maxClaims: 10,
      });
      exhaustedLink.claimCount = 10;

      const result = await validateClaim(exhaustedLink);

      expect(result.canClaim).toBe(false);
      expect(result.reason?.toLowerCase()).toContain('maximum');
    });

    it('should require password for password-protected link', async () => {
      const hash = await hashPassword('correct');
      const protectedLink = createBaseLink();
      protectedLink.config = serializeLinkConfig({
        type: 'single',
        coinType: 'NASUN',
        amount: 1000000000n,
        conditions: [{ type: 'password', hash }],
      });

      // Without password
      const result1 = await validateClaim(protectedLink);
      expect(result1.canClaim).toBe(false);
      expect(result1.reason?.toLowerCase()).toContain('password');

      // With correct password
      const result2 = await validateClaim(protectedLink, 'correct');
      expect(result2.canClaim).toBe(true);

      // With wrong password
      const result3 = await validateClaim(protectedLink, 'wrong');
      expect(result3.canClaim).toBe(false);
      expect(result3.reason?.toLowerCase()).toContain('password');
    });
  });

  describe('parseLinkUrl', () => {
    it('should parse valid claim URL', () => {
      const url = 'https://app.nasun.io/claim/abc123#secrethash';

      const parsed = parseLinkUrl(url);

      expect(parsed.linkId).toBe('abc123');
      expect(parsed.secret).toBe('secrethash');
    });

    it('should throw for URL without hash', () => {
      expect(() => parseLinkUrl('https://app.nasun.io/claim/abc123')).toThrow();
    });
  });

  describe('getClaimStatus', () => {
    it('should return status object for active link', () => {
      const linkData: LinkData = {
        id: 'test123',
        creator: '0xCreator1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        config: serializeLinkConfig({
          type: 'single',
          coinType: 'NASUN',
          amount: 1000000000n,
        }),
        ephemeralAddress: '0x123',
        encryptedPayload: 'encrypted',
        createdAt: Date.now(),
        status: 'active',
        claimCount: 0,
      };

      const status = getClaimStatus(linkData);

      expect(status.status).toBe('active');
      expect(status.canClaim).toBe(true);
    });

    it('should detect multi link with remaining claims', () => {
      const linkData: LinkData = {
        id: 'test123',
        creator: '0xCreator1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        config: serializeLinkConfig({
          type: 'multi',
          coinType: 'NASUN',
          amount: 1000000000n,
          maxClaims: 10,
        }),
        ephemeralAddress: '0x123',
        encryptedPayload: 'encrypted',
        createdAt: Date.now(),
        status: 'active',
        claimCount: 5,
      };

      const status = getClaimStatus(linkData);

      expect(status.status).toBe('active');
      expect(status.canClaim).toBe(true);
    });

    it('should detect exhausted multi link', () => {
      const linkData: LinkData = {
        id: 'test123',
        creator: '0xCreator1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
        config: serializeLinkConfig({
          type: 'multi',
          coinType: 'NASUN',
          amount: 1000000000n,
          maxClaims: 10,
        }),
        ephemeralAddress: '0x123',
        encryptedPayload: 'encrypted',
        createdAt: Date.now(),
        status: 'active',
        claimCount: 10,
      };

      const status = getClaimStatus(linkData);

      expect(status.canClaim).toBe(false);
    });
  });
});

// ======================================
// Integration Tests
// ======================================

describe('Link Integration', () => {
  it('should create and recover keypair correctly', async () => {
    const keypair = generateEphemeralKeypair();
    const privateKey = keypair.getSecretKey();
    const secret = generateSecret();

    const encrypted = await encryptPayload(privateKey, secret);
    const recovered = await recoverKeypair(encrypted, secret);

    expect(recovered.toSuiAddress()).toBe(keypair.toSuiAddress());
  });

  it('should handle full crypto flow', async () => {
    // 1. Generate ephemeral keypair
    const ephemeral = generateEphemeralKeypair();
    const ephemeralAddress = ephemeral.toSuiAddress();

    // 2. Generate secret
    const secret = generateSecret();

    // 3. Get private key and encrypt
    const privateKey = ephemeral.getSecretKey();
    const encrypted = await encryptPayload(privateKey, secret);

    // 4. Generate link ID
    const linkId = generateLinkId(ephemeralAddress);

    // 5. Simulate URL creation
    const baseUrl = 'https://app.nasun.io';
    const config = serializeLinkConfig({
      type: 'single',
      coinType: 'NASUN',
      amount: 1000000000n,
    });
    const payload = btoa(JSON.stringify(config)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const url = `${baseUrl}/claim/${linkId}?p=${payload}&e=${encodeURIComponent(encrypted)}#${secret}`;

    // 6. Parse URL
    const urlObj = new URL(url);
    const parsedLinkId = urlObj.pathname.split('/').pop();
    const parsedPayload = urlObj.searchParams.get('p');
    const parsedEncrypted = urlObj.searchParams.get('e');
    const parsedSecret = urlObj.hash.slice(1);

    expect(parsedLinkId).toBe(linkId);
    expect(parsedPayload).toBe(payload);
    expect(parsedSecret).toBe(secret);

    // 7. Decrypt and recover
    const recoveredKeypair = await recoverKeypair(
      decodeURIComponent(parsedEncrypted!),
      parsedSecret
    );

    expect(recoveredKeypair.toSuiAddress()).toBe(ephemeralAddress);

    // 8. Decode config
    const decodedPayload = parsedPayload!.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - decodedPayload.length % 4) % 4);
    const decodedConfig = JSON.parse(atob(decodedPayload + padding)) as SerializableLinkConfig;

    expect(decodedConfig.type).toBe('single');
    expect(decodedConfig.amount).toBe('1000000000');
  });

  it('should handle password-protected links', async () => {
    const password = 'mysecretpassword';
    const hash = await hashPassword(password);

    // Verify correct password
    expect(await verifyPassword(password, hash)).toBe(true);

    // Reject wrong password
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('should serialize and deserialize configs correctly', () => {
    const originalConfig: LinkConfig = {
      type: 'multi',
      coinType: '0x123::token::TOKEN',
      amount: 5000000n,
      maxClaims: 100,
      expiresAt: Date.now() + 86400000,
      message: 'Welcome gift!',
      conditions: [{ type: 'password', hash: 'somehash' }],
    };

    const serialized = serializeLinkConfig(originalConfig);
    const deserialized = deserializeLinkConfig(serialized);

    expect(deserialized.type).toBe(originalConfig.type);
    expect(deserialized.amount).toBe(originalConfig.amount);
    expect(deserialized.maxClaims).toBe(originalConfig.maxClaims);
    expect(deserialized.expiresAt).toBe(originalConfig.expiresAt);
    expect(deserialized.message).toBe(originalConfig.message);
    expect(deserialized.conditions).toEqual(originalConfig.conditions);
  });
});
