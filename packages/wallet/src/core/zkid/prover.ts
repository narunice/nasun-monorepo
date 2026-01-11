/**
 * ZK-ID Prover Client
 *
 * Handles ZK proof generation for identity claims.
 * Supports Local/Remote/Hybrid prover configurations.
 *
 * Pattern follows zklogin.ts for consistency.
 */

import {
  type ZKIDConfig,
  type ZKProver,
  type ZKProofInput,
  type ZKProofOutput,
  type ProverCapabilities,
  type ZKClaimType,
  type ZKIDProof,
  type ZKIDClaim,
  type AgeThreshold,
  type KYCLevel,
  type ClaimContext,
  type NullifierInput,
  ZKIDError,
} from './types';
import { calculateNullifier } from './nullifier';

// ============================================
// Configuration
// ============================================

/** Default proof TTL: 24 hours */
const DEFAULT_PROOF_TTL = 24 * 60 * 60;

/** Default prover timeout: 30 seconds */
const DEFAULT_PROVER_TIMEOUT = 30000;

/** Storage key for ZK-ID config */
const ZKID_CONFIG_KEY = 'nasun:zkid:config';

/** Module-level configuration */
let zkidConfig: ZKIDConfig | null = null;

/**
 * Configure ZK-ID module
 */
export function configureZKID(config: ZKIDConfig): void {
  zkidConfig = config;
  // Persist to sessionStorage for cross-page access
  try {
    sessionStorage.setItem(ZKID_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors (SSR, etc.)
  }
}

/**
 * Get current ZK-ID configuration
 */
export function getZKIDConfig(): ZKIDConfig | null {
  if (zkidConfig) return zkidConfig;

  // Try to restore from sessionStorage
  try {
    const stored = sessionStorage.getItem(ZKID_CONFIG_KEY);
    if (stored) {
      zkidConfig = JSON.parse(stored) as ZKIDConfig;
      return zkidConfig;
    }
  } catch {
    // Ignore storage errors
  }

  return null;
}

/**
 * Ensure config is initialized
 */
function ensureConfig(): ZKIDConfig {
  const config = getZKIDConfig();
  if (!config) {
    throw new ZKIDError(
      'CONFIG_NOT_INITIALIZED',
      'ZK-ID not configured. Call configureZKID() first.'
    );
  }
  return config;
}

// ============================================
// Remote Prover Client
// ============================================

/**
 * Remote Prover Response format
 */
interface RemoteProverResponse {
  proof: {
    a: string[];
    b: string[][];
    c: string[];
  };
  publicInputs: string[];
  nullifier?: string;
  verificationKeyId: string;
}

/**
 * Generate proof via remote prover API
 */
async function generateRemoteProof(
  config: ZKIDConfig,
  input: ZKProofInput
): Promise<ZKProofOutput> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_PROVER_TIMEOUT);

  try {
    const response = await fetch(`${config.proverUrl}/prove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        claimType: input.claimType,
        encryptedCredential: input.encryptedCredential,
        commitment: input.commitment,
        context: input.context,
        params: input.params,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new ZKIDError(
        'PROOF_GENERATION_FAILED',
        `Prover error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as RemoteProverResponse;

    const now = Date.now();
    const ttl = config.defaultProofTTL || DEFAULT_PROOF_TTL;

    // Build proof object
    const proof: ZKIDProof = {
      type: input.claimType,
      proofPoints: data.proof,
      publicInputs: data.publicInputs,
      nullifier: data.nullifier,
      context: input.context,
      generatedAt: now,
      expiresAt: now + ttl * 1000,
    };

    // Build claim metadata
    const claim = buildClaimMetadata(input);

    return {
      proof,
      claim,
      verificationKeyId: data.verificationKeyId,
    };
  } catch (error) {
    if (error instanceof ZKIDError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ZKIDError('PROVER_TIMEOUT', 'Prover request timed out');
    }

    throw new ZKIDError(
      'PROVER_UNAVAILABLE',
      `Failed to connect to prover: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build claim metadata from input
 */
function buildClaimMetadata(input: ZKProofInput): ZKIDClaim {
  const base: ZKIDClaim = {
    type: input.claimType,
    source: 'self-attested', // Default, should be overridden
    issuedAt: Date.now(),
  };

  switch (input.params.type) {
    case 'age_over':
      return { ...base, threshold: input.params.threshold };
    case 'kyc_completed':
      return { ...base, level: input.params.level };
    case 'unique_claim':
      return { ...base, contextId: input.params.nullifierInput.actionId };
    default:
      return base;
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Generate age verification proof
 */
export async function generateAgeProof(
  encryptedCredential: string,
  threshold: AgeThreshold,
  commitment: string,
  context?: ClaimContext
): Promise<ZKProofOutput> {
  const config = ensureConfig();

  const input: ZKProofInput = {
    claimType: 'age_over',
    encryptedCredential,
    commitment,
    context,
    params: { type: 'age_over', threshold },
  };

  return generateRemoteProof(config, input);
}

/**
 * Generate KYC verification proof
 */
export async function generateKYCProof(
  encryptedCredential: string,
  level: KYCLevel,
  commitment: string,
  context?: ClaimContext
): Promise<ZKProofOutput> {
  const config = ensureConfig();

  const input: ZKProofInput = {
    claimType: 'kyc_completed',
    encryptedCredential,
    commitment,
    context,
    params: { type: 'kyc_completed', level },
  };

  return generateRemoteProof(config, input);
}

/**
 * Generate unique claim proof with nullifier
 */
export async function generateUniqueProof(
  encryptedCredential: string,
  nullifierInput: NullifierInput,
  commitment: string,
  context?: ClaimContext
): Promise<ZKProofOutput> {
  const config = ensureConfig();

  // Pre-calculate nullifier for client-side verification
  const nullifier = await calculateNullifier(nullifierInput);

  const input: ZKProofInput = {
    claimType: 'unique_claim',
    encryptedCredential,
    commitment,
    context,
    params: { type: 'unique_claim', nullifierInput },
  };

  const result = await generateRemoteProof(config, input);

  // Verify nullifier matches
  if (result.proof.nullifier && result.proof.nullifier !== nullifier) {
    throw new ZKIDError(
      'NULLIFIER_DOMAIN_MISMATCH',
      'Prover nullifier does not match expected value'
    );
  }

  // Ensure nullifier is set
  result.proof.nullifier = nullifier;

  return result;
}

// ============================================
// Prover Interface Implementation
// ============================================

/**
 * Create a remote prover instance
 */
export function createRemoteProver(): ZKProver {
  return {
    async generateProof(input: ZKProofInput): Promise<ZKProofOutput> {
      const config = ensureConfig();
      return generateRemoteProof(config, input);
    },

    getCapabilities(): ProverCapabilities {
      return {
        supportsLocal: false,
        supportsRemote: true,
        supportedClaimTypes: ['age_over', 'kyc_completed', 'unique_claim'],
        maxTimeout: DEFAULT_PROVER_TIMEOUT,
      };
    },
  };
}

/**
 * Get prover based on configuration
 */
export function getProver(): ZKProver {
  const config = getZKIDConfig();
  if (!config) {
    throw new ZKIDError(
      'CONFIG_NOT_INITIALIZED',
      'ZK-ID not configured. Call configureZKID() first.'
    );
  }

  // Currently only remote prover is supported
  // Future: Add local WASM prover, hybrid prover
  switch (config.proverType) {
    case 'local':
      throw new ZKIDError(
        'UNSUPPORTED_CLAIM_TYPE',
        'Local prover not yet implemented'
      );
    case 'hybrid':
      // Hybrid would try local first, fallback to remote
      return createRemoteProver();
    case 'remote':
    default:
      return createRemoteProver();
  }
}

// ============================================
// Mock Prover (for testing)
// ============================================

/**
 * Create a mock prover for testing
 */
export function createMockProver(
  overrides?: Partial<ProverCapabilities>
): ZKProver {
  const capabilities: ProverCapabilities = {
    supportsLocal: true,
    supportsRemote: false,
    supportedClaimTypes: ['age_over', 'kyc_completed', 'unique_claim', 'custom'],
    maxTimeout: 5000,
    ...overrides,
  };

  return {
    async generateProof(input: ZKProofInput): Promise<ZKProofOutput> {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      const now = Date.now();

      // Generate mock nullifier for unique_claim
      let nullifier: string | undefined;
      if (input.params.type === 'unique_claim') {
        nullifier = await calculateNullifier(input.params.nullifierInput);
      }

      const proof: ZKIDProof = {
        type: input.claimType,
        proofPoints: {
          a: ['mock_a_0', 'mock_a_1'],
          b: [
            ['mock_b_0_0', 'mock_b_0_1'],
            ['mock_b_1_0', 'mock_b_1_1'],
          ],
          c: ['mock_c_0', 'mock_c_1'],
        },
        publicInputs: ['mock_public_input'],
        nullifier,
        context: input.context,
        generatedAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000,
      };

      const claim = buildClaimMetadata(input);

      return {
        proof,
        claim,
        verificationKeyId: 'mock_vk_id',
      };
    },

    getCapabilities(): ProverCapabilities {
      return capabilities;
    },
  };
}
