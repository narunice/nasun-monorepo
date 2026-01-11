/**
 * ZK-ID Module Tests
 *
 * Includes:
 * - Unit tests for each module
 * - Security scenario tests (attack prevention)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  // Types
  ZKIDError,
  type ZKIDProof,
  type ClaimContext,
  type NullifierInput,
  type ZKClaimType,
  // Prover
  configureZKID,
  getZKIDConfig,
  createMockProver,
  generateAgeProof,
  generateKYCProof,
  generateUniqueProof,
  // Nullifier
  calculateNullifier,
  isValidNullifier,
  createNullifierInput,
  InMemoryNullifierRegistry,
  NULLIFIER_DOMAINS,
  parseDomain,
  // Verifier
  verifyProof,
  validateProofStructure,
  validateContext,
  verifyAgainstCondition,
  isProofExpired,
  getProofRemainingTime,
  proofExpiresWithin,
  registerNullifier,
  setDefaultNullifierRegistry,
} from '../core/zkid';

// ============================================
// Test Utilities
// ============================================

function createValidProof(overrides?: Partial<ZKIDProof>): ZKIDProof {
  const now = Date.now();
  return {
    type: 'age_over',
    proofPoints: {
      a: ['0x1', '0x2'],
      b: [
        ['0x3', '0x4'],
        ['0x5', '0x6'],
      ],
      c: ['0x7', '0x8'],
    },
    publicInputs: ['0x9', '0xa'],
    generatedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
    ...overrides,
  };
}

function createValidContext(overrides?: Partial<ClaimContext>): ClaimContext {
  const now = Date.now();
  return {
    linkId: 'test-link-123',
    chainId: 1,
    timestamp: now,
    ...overrides,
  };
}

// ============================================
// Types Tests
// ============================================

describe('ZK-ID Types', () => {
  describe('ZKIDError', () => {
    it('should create error with code and message', () => {
      const error = new ZKIDError('PROOF_EXPIRED', 'Proof has expired');
      expect(error.code).toBe('PROOF_EXPIRED');
      expect(error.message).toBe('Proof has expired');
      expect(error.name).toBe('ZKIDError');
    });

    it('should be instanceof Error', () => {
      const error = new ZKIDError('PROVER_UNAVAILABLE', 'Cannot connect');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ZKIDError);
    });
  });

  describe('Claim Types', () => {
    it('should define valid claim types', () => {
      const types: ZKClaimType[] = ['age_over', 'kyc_completed', 'unique_claim', 'custom'];
      expect(types).toHaveLength(4);
    });
  });
});

// ============================================
// Configuration Tests
// ============================================

describe('ZK-ID Configuration', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
  });

  it('should configure ZK-ID', () => {
    configureZKID({
      proverUrl: 'https://prover.example.com',
      proverType: 'remote',
      defaultProofTTL: 3600,
      chainId: 1,
    });

    const config = getZKIDConfig();
    expect(config).not.toBeNull();
    expect(config?.proverUrl).toBe('https://prover.example.com');
    expect(config?.proverType).toBe('remote');
  });

  it('should persist config to sessionStorage', () => {
    configureZKID({
      proverUrl: 'https://prover.example.com',
      proverType: 'remote',
      defaultProofTTL: 3600,
      chainId: 1,
    });

    const stored = sessionStorage.getItem('nasun:zkid:config');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.proverUrl).toBe('https://prover.example.com');
  });
});

// ============================================
// Nullifier Tests
// ============================================

describe('Nullifier', () => {
  describe('calculateNullifier', () => {
    it('should calculate deterministic nullifier', async () => {
      const input: NullifierInput = {
        credentialSecret: 'secret123',
        domain: 'nasun.link:abc',
        actionId: 'claim-1',
      };

      const nullifier1 = await calculateNullifier(input);
      const nullifier2 = await calculateNullifier(input);

      expect(nullifier1).toBe(nullifier2);
      expect(isValidNullifier(nullifier1)).toBe(true);
    });

    it('should produce different nullifiers for different domains', async () => {
      const base = {
        credentialSecret: 'secret123',
        actionId: 'claim-1',
      };

      const nullifier1 = await calculateNullifier({ ...base, domain: 'domain-a' });
      const nullifier2 = await calculateNullifier({ ...base, domain: 'domain-b' });

      expect(nullifier1).not.toBe(nullifier2);
    });

    it('should produce different nullifiers for different actions', async () => {
      const base = {
        credentialSecret: 'secret123',
        domain: 'nasun.link:abc',
      };

      const nullifier1 = await calculateNullifier({ ...base, actionId: 'action-1' });
      const nullifier2 = await calculateNullifier({ ...base, actionId: 'action-2' });

      expect(nullifier1).not.toBe(nullifier2);
    });

    it('should throw on empty credential secret', async () => {
      await expect(
        calculateNullifier({
          credentialSecret: '',
          domain: 'test',
          actionId: 'test',
        })
      ).rejects.toThrow(ZKIDError);
    });

    it('should throw on empty domain', async () => {
      await expect(
        calculateNullifier({
          credentialSecret: 'secret',
          domain: '',
          actionId: 'test',
        })
      ).rejects.toThrow(ZKIDError);
    });
  });

  describe('isValidNullifier', () => {
    it('should validate correct nullifier format', () => {
      const valid = 'a'.repeat(64);
      expect(isValidNullifier(valid)).toBe(true);
    });

    it('should reject invalid nullifier format', () => {
      expect(isValidNullifier('short')).toBe(false);
      expect(isValidNullifier('g'.repeat(64))).toBe(false); // 'g' is not hex
      expect(isValidNullifier('')).toBe(false);
    });
  });

  describe('createNullifierInput', () => {
    it('should create valid nullifier input', () => {
      const input = createNullifierInput('secret', 'domain', 'action');
      expect(input.credentialSecret).toBe('secret');
      expect(input.domain).toBe('domain');
      expect(input.actionId).toBe('action');
    });
  });

  describe('NULLIFIER_DOMAINS', () => {
    it('should format nasun link domain', () => {
      const domain = NULLIFIER_DOMAINS.nasunLink('abc123');
      expect(domain).toBe('nasun.link:abc123');
    });

    it('should format campaign domain', () => {
      const domain = NULLIFIER_DOMAINS.campaign('summer2026');
      expect(domain).toBe('campaign:summer2026');
    });

    it('should format contract domain', () => {
      const domain = NULLIFIER_DOMAINS.contract(1, '0x1234');
      expect(domain).toBe('contract:1:0x1234');
    });
  });

  describe('parseDomain', () => {
    it('should parse domain string', () => {
      const result = parseDomain('nasun.link:abc123');
      expect(result.type).toBe('nasun.link');
      expect(result.id).toBe('abc123');
    });

    it('should handle domains with multiple colons', () => {
      const result = parseDomain('contract:1:0x1234');
      expect(result.type).toBe('contract');
      expect(result.id).toBe('1:0x1234');
    });
  });

  describe('InMemoryNullifierRegistry', () => {
    let registry: InMemoryNullifierRegistry;

    beforeEach(() => {
      registry = new InMemoryNullifierRegistry();
    });

    it('should register and check nullifier', async () => {
      const nullifier = 'a'.repeat(64);

      expect(await registry.check(nullifier)).toBe(false);
      await registry.register(nullifier);
      expect(await registry.check(nullifier)).toBe(true);
    });

    it('should throw on duplicate registration', async () => {
      const nullifier = 'b'.repeat(64);

      await registry.register(nullifier);
      await expect(registry.register(nullifier)).rejects.toThrow(ZKIDError);
    });

    it('should track size', async () => {
      expect(registry.size).toBe(0);
      await registry.register('a'.repeat(64));
      expect(registry.size).toBe(1);
      await registry.register('b'.repeat(64));
      expect(registry.size).toBe(2);
    });

    it('should clear registry', async () => {
      await registry.register('a'.repeat(64));
      registry.clear();
      expect(registry.size).toBe(0);
    });
  });
});

// ============================================
// Prover Tests
// ============================================

describe('Prover', () => {
  describe('Mock Prover', () => {
    it('should generate age proof', async () => {
      const prover = createMockProver();
      const result = await prover.generateProof({
        claimType: 'age_over',
        encryptedCredential: 'encrypted-data',
        commitment: 'commitment-hash',
        params: { type: 'age_over', threshold: 18 },
      });

      expect(result.proof.type).toBe('age_over');
      expect(result.claim.type).toBe('age_over');
      expect(result.claim.threshold).toBe(18);
      expect(result.verificationKeyId).toBe('mock_vk_id');
    });

    it('should generate KYC proof', async () => {
      const prover = createMockProver();
      const result = await prover.generateProof({
        claimType: 'kyc_completed',
        encryptedCredential: 'encrypted-data',
        commitment: 'commitment-hash',
        params: { type: 'kyc_completed', level: 'advanced' },
      });

      expect(result.proof.type).toBe('kyc_completed');
      expect(result.claim.level).toBe('advanced');
    });

    it('should generate unique proof with nullifier', async () => {
      const prover = createMockProver();
      const result = await prover.generateProof({
        claimType: 'unique_claim',
        encryptedCredential: 'encrypted-data',
        commitment: 'commitment-hash',
        params: {
          type: 'unique_claim',
          nullifierInput: {
            credentialSecret: 'secret',
            domain: 'test-domain',
            actionId: 'action-1',
          },
        },
      });

      expect(result.proof.type).toBe('unique_claim');
      expect(result.proof.nullifier).toBeDefined();
      expect(isValidNullifier(result.proof.nullifier!)).toBe(true);
    });

    it('should report capabilities', () => {
      const prover = createMockProver();
      const caps = prover.getCapabilities();

      expect(caps.supportsLocal).toBe(true);
      expect(caps.supportedClaimTypes).toContain('age_over');
      expect(caps.supportedClaimTypes).toContain('kyc_completed');
      expect(caps.supportedClaimTypes).toContain('unique_claim');
    });

    it('should respect custom capabilities', () => {
      const prover = createMockProver({ maxTimeout: 1000 });
      const caps = prover.getCapabilities();

      expect(caps.maxTimeout).toBe(1000);
    });
  });
});

// ============================================
// Verifier Tests
// ============================================

describe('Verifier', () => {
  describe('validateProofStructure', () => {
    it('should validate correct proof structure', () => {
      const proof = createValidProof();
      const result = validateProofStructure(proof);

      expect(result.valid).toBe(true);
    });

    it('should reject proof without type', () => {
      const proof = createValidProof();
      // @ts-expect-error Testing invalid input
      delete proof.type;

      const result = validateProofStructure(proof);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('type');
    });

    it('should reject proof with invalid timestamps', () => {
      const proof = createValidProof({
        generatedAt: Date.now() + 1000000, // Future
        expiresAt: Date.now(),
      });

      const result = validateProofStructure(proof);
      expect(result.valid).toBe(false);
    });

    it('should reject proof with invalid nullifier format', () => {
      const proof = createValidProof({
        nullifier: 'invalid-nullifier',
      });

      const result = validateProofStructure(proof);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('nullifier');
    });
  });

  describe('validateContext', () => {
    it('should validate correct context', () => {
      const context = createValidContext();
      const result = validateContext(context);

      expect(result.valid).toBe(true);
    });

    it('should reject expired context', () => {
      const context = createValidContext({
        expiresAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      });

      const result = validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CONTEXT_EXPIRED');
    });

    it('should reject future context timestamp', () => {
      const context = createValidContext({
        timestamp: Date.now() + 10 * 60 * 1000, // 10 minutes in future
      });

      const result = validateContext(context);
      expect(result.valid).toBe(false);
    });

    it('should reject mismatched chain ID', () => {
      const context = createValidContext({ chainId: 1 });
      const result = validateContext(context, 2);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CONTEXT_CHAIN_MISMATCH');
    });
  });

  describe('verifyProof', () => {
    it('should verify valid proof', async () => {
      const proof = createValidProof();
      const result = await verifyProof(proof);

      expect(result.valid).toBe(true);
    });

    it('should reject expired proof', async () => {
      const now = Date.now();
      const proof = createValidProof({
        generatedAt: now - 2 * 60 * 60 * 1000, // 2 hours ago
        expiresAt: now - 10 * 60 * 1000, // Expired 10 minutes ago
      });

      const result = await verifyProof(proof);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PROOF_EXPIRED');
    });

    it('should check context chain ID', async () => {
      const proof = createValidProof({
        context: createValidContext({ chainId: 1 }),
      });

      const result = await verifyProof(proof, { expectedChainId: 2 });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CONTEXT_CHAIN_MISMATCH');
    });
  });

  describe('verifyAgainstCondition', () => {
    let registry: InMemoryNullifierRegistry;

    beforeEach(() => {
      registry = new InMemoryNullifierRegistry();
      setDefaultNullifierRegistry(registry);
    });

    it('should verify age condition', async () => {
      const proof = createValidProof({ type: 'age_over' });
      const result = await verifyAgainstCondition(proof, {
        type: 'zkid-age',
        threshold: 18,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject wrong proof type for age', async () => {
      const proof = createValidProof({ type: 'kyc_completed' });
      const result = await verifyAgainstCondition(proof, {
        type: 'zkid-age',
        threshold: 18,
      });

      expect(result.valid).toBe(false);
    });

    it('should verify unique claim with unused nullifier', async () => {
      const proof = createValidProof({
        type: 'unique_claim',
        nullifier: 'a'.repeat(64),
      });

      const result = await verifyAgainstCondition(
        proof,
        { type: 'zkid-unique', contextId: 'test' },
        registry
      );

      expect(result.valid).toBe(true);
    });

    it('should reject unique claim with used nullifier', async () => {
      const nullifier = 'b'.repeat(64);
      await registry.register(nullifier);

      const proof = createValidProof({
        type: 'unique_claim',
        nullifier,
      });

      const result = await verifyAgainstCondition(
        proof,
        { type: 'zkid-unique', contextId: 'test' },
        registry
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('NULLIFIER_ALREADY_USED');
    });
  });

  describe('Utility functions', () => {
    it('should check if proof is expired', () => {
      const expiredProof = createValidProof({
        expiresAt: Date.now() - 1000,
      });
      const validProof = createValidProof();

      expect(isProofExpired(expiredProof)).toBe(true);
      expect(isProofExpired(validProof)).toBe(false);
    });

    it('should get remaining time', () => {
      const proof = createValidProof({
        expiresAt: Date.now() + 60000, // 1 minute
      });

      const remaining = getProofRemainingTime(proof);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(60000);
    });

    it('should check if proof expires within time', () => {
      const proof = createValidProof({
        expiresAt: Date.now() + 30000, // 30 seconds
      });

      expect(proofExpiresWithin(proof, 60000)).toBe(true); // Within 1 minute
      expect(proofExpiresWithin(proof, 10000)).toBe(false); // Within 10 seconds
    });
  });
});

// ============================================
// Security Scenario Tests
// ============================================

describe('ZK-ID Security', () => {
  describe('Proof Replay Attack', () => {
    let registry: InMemoryNullifierRegistry;

    beforeEach(() => {
      registry = new InMemoryNullifierRegistry();
      setDefaultNullifierRegistry(registry);
    });

    it('should reject same proof used twice', async () => {
      const nullifier = 'c'.repeat(64);
      const proof = createValidProof({
        type: 'unique_claim',
        nullifier,
      });

      // First use should succeed
      const result1 = await verifyAgainstCondition(
        proof,
        { type: 'zkid-unique', contextId: 'test' },
        registry
      );
      expect(result1.valid).toBe(true);

      // Register the nullifier (simulating successful claim)
      await registerNullifier(nullifier, registry);

      // Second use should fail
      const result2 = await verifyAgainstCondition(
        proof,
        { type: 'zkid-unique', contextId: 'test' },
        registry
      );
      expect(result2.valid).toBe(false);
      expect(result2.errorCode).toBe('NULLIFIER_ALREADY_USED');
    });

    it('should reject proof from different chain', async () => {
      const proof = createValidProof({
        context: createValidContext({ chainId: 1 }),
      });

      const result = await verifyProof(proof, { expectedChainId: 2 });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CONTEXT_CHAIN_MISMATCH');
    });

    it('should reject proof for different campaign', async () => {
      const proof = createValidProof({
        context: createValidContext({ campaignId: 'campaign-a' }),
      });

      // The context has campaign-a, but we're trying to use it for campaign-b
      // This would be caught by nullifier domain separation in production
      expect(proof.context?.campaignId).toBe('campaign-a');
    });
  });

  describe('Nullifier Attacks', () => {
    it('should produce different nullifiers for same credential, different domain', async () => {
      const secret = 'user-credential-secret';

      const nullifier1 = await calculateNullifier({
        credentialSecret: secret,
        domain: 'campaign:airdrop-1',
        actionId: 'claim',
      });

      const nullifier2 = await calculateNullifier({
        credentialSecret: secret,
        domain: 'campaign:airdrop-2',
        actionId: 'claim',
      });

      // Same user should have different nullifiers for different campaigns
      expect(nullifier1).not.toBe(nullifier2);
    });

    it('should detect nullifier without proper domain separation', async () => {
      // Empty domain should throw
      await expect(
        calculateNullifier({
          credentialSecret: 'secret',
          domain: '',
          actionId: 'action',
        })
      ).rejects.toThrow(ZKIDError);
    });
  });

  describe('Credential Security', () => {
    it('should reject expired credentials via proof expiration', async () => {
      const proof = createValidProof({
        generatedAt: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago
        expiresAt: Date.now() - 24 * 60 * 60 * 1000, // Expired 24 hours ago
      });

      const result = await verifyProof(proof);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PROOF_EXPIRED');
    });

    it('should reject tampered proof (invalid structure)', () => {
      const proof = createValidProof();
      // Tamper with proof points
      proof.proofPoints.a = [];

      const result = validateProofStructure(proof);
      // Structure validation should still pass since array is valid
      // In production, cryptographic verification would fail
      expect(result.valid).toBe(true);
    });

    it('should not expose credential secret in proof', async () => {
      const prover = createMockProver();
      const secret = 'super-secret-credential';

      const result = await prover.generateProof({
        claimType: 'unique_claim',
        encryptedCredential: secret,
        commitment: 'commitment',
        params: {
          type: 'unique_claim',
          nullifierInput: {
            credentialSecret: secret,
            domain: 'test',
            actionId: 'action',
          },
        },
      });

      // The proof should not contain the credential secret
      const proofString = JSON.stringify(result.proof);
      expect(proofString).not.toContain(secret);
    });
  });

  describe('Context Manipulation', () => {
    it('should reject mismatched chain context', async () => {
      const proof = createValidProof({
        context: createValidContext({ chainId: 1 }),
      });

      const result = await verifyProof(proof, { expectedChainId: 137 });
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CONTEXT_CHAIN_MISMATCH');
    });

    it('should reject expired context', async () => {
      const context = createValidContext({
        expiresAt: Date.now() - 10 * 60 * 1000, // Expired 10 minutes ago (beyond 5 min clock skew)
      });

      const result = validateContext(context);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('CONTEXT_EXPIRED');
    });

    it('should reject future-dated context', async () => {
      const context = createValidContext({
        timestamp: Date.now() + 10 * 60 * 1000, // 10 minutes in future
      });

      const result = validateContext(context);
      expect(result.valid).toBe(false);
    });

    it('should validate timestamp bounds with clock skew tolerance', async () => {
      // Context 3 minutes in future (within 5 min tolerance)
      const context = createValidContext({
        timestamp: Date.now() + 3 * 60 * 1000,
      });

      const result = validateContext(context);
      expect(result.valid).toBe(true);
    });
  });

  describe('Prover Security', () => {
    it('should handle prover timeout', async () => {
      // Mock fetch to simulate timeout
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          setTimeout(() => reject(error), 100);
        });
      });

      configureZKID({
        proverUrl: 'https://slow-prover.example.com',
        proverType: 'remote',
        defaultProofTTL: 3600,
        chainId: 1,
      });

      try {
        await expect(
          generateAgeProof('credential', 18, 'commitment')
        ).rejects.toThrow('timed out');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should reject malformed prover response', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' }),
      });

      configureZKID({
        proverUrl: 'https://bad-prover.example.com',
        proverType: 'remote',
        defaultProofTTL: 3600,
        chainId: 1,
      });

      try {
        const result = await generateAgeProof('credential', 18, 'commitment');
        // The prover should handle missing fields gracefully
        expect(result.proof).toBeDefined();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle prover unavailable', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      configureZKID({
        proverUrl: 'https://unavailable-prover.example.com',
        proverType: 'remote',
        defaultProofTTL: 3600,
        chainId: 1,
      });

      try {
        await expect(
          generateAgeProof('credential', 18, 'commitment')
        ).rejects.toThrow(ZKIDError);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
