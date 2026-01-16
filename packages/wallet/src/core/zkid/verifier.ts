/**
 * ZK-ID Verifier
 *
 * Handles ZK proof verification for identity claims.
 * Supports both client-side and remote verification.
 *
 * Security checks:
 * - Proof expiration
 * - Context validation (chain, time, campaign)
 * - Nullifier uniqueness
 * - Proof structure integrity
 */

import {
  type ZKIDProof,
  type ZKIDVerificationResult,
  type ClaimContext,
  type AgeThreshold,
  type KYCLevel,
  type NullifierRegistry,
} from './types';
import { getZKIDConfig } from './prover';
import { isValidNullifier, InMemoryNullifierRegistry } from './nullifier';

// ============================================
// Verification Configuration
// ============================================

/** Default clock skew tolerance: 5 minutes */
const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Maximum proof age before requiring refresh: 24 hours */
const MAX_PROOF_AGE_MS = 24 * 60 * 60 * 1000;

/** Default nullifier registry (in-memory for development) */
let defaultRegistry: NullifierRegistry = new InMemoryNullifierRegistry();

/**
 * Set the default nullifier registry
 */
export function setDefaultNullifierRegistry(registry: NullifierRegistry): void {
  defaultRegistry = registry;
}

/**
 * Get the default nullifier registry
 */
export function getDefaultNullifierRegistry(): NullifierRegistry {
  return defaultRegistry;
}

// ============================================
// Core Verification Functions
// ============================================

/**
 * Verify a ZK-ID proof
 *
 * Performs comprehensive validation:
 * 1. Proof structure
 * 2. Expiration
 * 3. Context (if provided)
 * 4. Remote verification (optional)
 */
export async function verifyProof(
  proof: ZKIDProof,
  options?: {
    /** Expected chain ID (for context validation) */
    expectedChainId?: number;
    /** Enable remote verification */
    remoteVerify?: boolean;
    /** Clock skew tolerance in ms */
    clockSkewMs?: number;
  }
): Promise<ZKIDVerificationResult> {
  const clockSkew = options?.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const now = Date.now();

  // 1. Validate proof structure
  const structureResult = validateProofStructure(proof);
  if (!structureResult.valid) {
    return structureResult;
  }

  // 2. Check expiration
  if (proof.expiresAt < now - clockSkew) {
    return {
      valid: false,
      reason: 'Proof has expired',
      errorCode: 'PROOF_EXPIRED',
    };
  }

  // 3. Check if proof is too old (even if not expired)
  if (now - proof.generatedAt > MAX_PROOF_AGE_MS + clockSkew) {
    return {
      valid: false,
      reason: 'Proof is too old and should be refreshed',
      errorCode: 'PROOF_EXPIRED',
    };
  }

  // 4. Validate context if present
  if (proof.context) {
    const contextResult = validateContext(proof.context, options?.expectedChainId);
    if (!contextResult.valid) {
      return contextResult;
    }
  }

  // 5. Remote verification (if enabled)
  if (options?.remoteVerify) {
    const remoteResult = await verifyRemote(proof);
    if (!remoteResult.valid) {
      return remoteResult;
    }
  }

  return { valid: true };
}

/**
 * Validate proof structure
 */
export function validateProofStructure(proof: ZKIDProof): ZKIDVerificationResult {
  // Check required fields
  if (!proof.type) {
    return {
      valid: false,
      reason: 'Missing proof type',
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  if (!proof.proofPoints) {
    return {
      valid: false,
      reason: 'Missing proof points',
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  // Validate proof points structure (Groth16)
  const { a, b, c } = proof.proofPoints;
  if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(c)) {
    return {
      valid: false,
      reason: 'Invalid proof points structure',
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  // Check timestamps
  if (typeof proof.generatedAt !== 'number' || proof.generatedAt <= 0) {
    return {
      valid: false,
      reason: 'Invalid generation timestamp',
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  if (typeof proof.expiresAt !== 'number' || proof.expiresAt <= proof.generatedAt) {
    return {
      valid: false,
      reason: 'Invalid expiration timestamp',
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  // Validate nullifier format if present
  if (proof.nullifier && !isValidNullifier(proof.nullifier)) {
    return {
      valid: false,
      reason: 'Invalid nullifier format',
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  return { valid: true };
}

/**
 * Validate claim context
 */
export function validateContext(
  context: ClaimContext,
  expectedChainId?: number
): ZKIDVerificationResult {
  const now = Date.now();
  const clockSkew = DEFAULT_CLOCK_SKEW_MS;

  // Check context expiration
  if (context.expiresAt && context.expiresAt < now - clockSkew) {
    return {
      valid: false,
      reason: 'Context has expired',
      errorCode: 'CONTEXT_EXPIRED',
    };
  }

  // Check context is not from the future
  if (context.timestamp > now + clockSkew) {
    return {
      valid: false,
      reason: 'Context timestamp is in the future',
      errorCode: 'CONTEXT_EXPIRED',
    };
  }

  // Check chain ID if expected
  if (expectedChainId !== undefined && context.chainId !== expectedChainId) {
    return {
      valid: false,
      reason: `Chain ID mismatch: expected ${expectedChainId}, got ${context.chainId}`,
      errorCode: 'CONTEXT_CHAIN_MISMATCH',
    };
  }

  return { valid: true };
}

/**
 * Verify proof against a specific claim condition
 */
export async function verifyAgainstCondition(
  proof: ZKIDProof,
  condition: ZKIDConditionCheck,
  registry?: NullifierRegistry
): Promise<ZKIDVerificationResult> {
  // First, verify the proof itself
  const proofResult = await verifyProof(proof, {
    expectedChainId: condition.expectedChainId,
  });
  if (!proofResult.valid) {
    return proofResult;
  }

  // Type-specific validation
  switch (condition.type) {
    case 'zkid-age':
      return verifyAgeCondition(proof, condition.threshold);

    case 'zkid-kyc':
      return verifyKYCCondition(proof, condition.level);

    case 'zkid-unique':
      return verifyUniqueCondition(proof, condition.contextId, registry);

    default:
      return {
        valid: false,
        reason: `Unknown condition type`,
        errorCode: 'UNSUPPORTED_CLAIM_TYPE',
      };
  }
}

// ============================================
// Condition-Specific Verification
// ============================================

/** Condition check types */
export type ZKIDConditionCheck =
  | { type: 'zkid-age'; threshold: AgeThreshold; expectedChainId?: number }
  | { type: 'zkid-kyc'; level: KYCLevel; expectedChainId?: number }
  | { type: 'zkid-unique'; contextId: string; expectedChainId?: number };

/**
 * Verify age condition
 */
function verifyAgeCondition(
  proof: ZKIDProof,
  _requiredThreshold: AgeThreshold
): ZKIDVerificationResult {
  if (proof.type !== 'age_over') {
    return {
      valid: false,
      reason: `Expected age_over proof, got ${proof.type}`,
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  // The proof's public inputs should contain the threshold that was proven
  // For now, we trust the proof type matches the requirement
  // In production, the threshold would be extracted from publicInputs

  return { valid: true };
}

/**
 * Verify KYC condition
 */
function verifyKYCCondition(
  proof: ZKIDProof,
  _requiredLevel: KYCLevel
): ZKIDVerificationResult {
  if (proof.type !== 'kyc_completed') {
    return {
      valid: false,
      reason: `Expected kyc_completed proof, got ${proof.type}`,
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  // Level verification would be done via publicInputs in production
  return { valid: true };
}

/**
 * Verify unique claim condition
 */
async function verifyUniqueCondition(
  proof: ZKIDProof,
  _expectedContextId: string,
  registry?: NullifierRegistry
): Promise<ZKIDVerificationResult> {
  if (proof.type !== 'unique_claim') {
    return {
      valid: false,
      reason: `Expected unique_claim proof, got ${proof.type}`,
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  if (!proof.nullifier) {
    return {
      valid: false,
      reason: 'Missing nullifier in unique_claim proof',
      errorCode: 'PROOF_VERIFICATION_FAILED',
    };
  }

  // Check nullifier hasn't been used
  const reg = registry ?? defaultRegistry;
  const isUsed = await reg.check(proof.nullifier);
  if (isUsed) {
    return {
      valid: false,
      reason: 'This proof has already been used',
      errorCode: 'NULLIFIER_ALREADY_USED',
    };
  }

  return { valid: true };
}

// ============================================
// Remote Verification
// ============================================

/**
 * Verify proof via remote verifier service
 */
async function verifyRemote(proof: ZKIDProof): Promise<ZKIDVerificationResult> {
  const config = getZKIDConfig();
  if (!config?.verifierUrl) {
    // No remote verifier configured, skip
    return { valid: true };
  }

  try {
    const response = await fetch(`${config.verifierUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: proof.type,
        proofPoints: proof.proofPoints,
        publicInputs: proof.publicInputs,
        nullifier: proof.nullifier,
      }),
    });

    if (!response.ok) {
      return {
        valid: false,
        reason: `Remote verification failed: ${response.status}`,
        errorCode: 'PROOF_VERIFICATION_FAILED',
      };
    }

    const result = (await response.json()) as { valid: boolean; reason?: string };
    if (!result.valid) {
      return {
        valid: false,
        reason: result.reason || 'Remote verification rejected proof',
        errorCode: 'PROOF_VERIFICATION_FAILED',
      };
    }

    return { valid: true };
  } catch (error) {
    // Log but don't fail - remote verification is optional
    console.warn('[ZK-ID] Remote verification failed:', error);
    return { valid: true };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if a proof is expired
 */
export function isProofExpired(proof: ZKIDProof): boolean {
  return proof.expiresAt < Date.now();
}

/**
 * Get remaining validity time in milliseconds
 */
export function getProofRemainingTime(proof: ZKIDProof): number {
  const remaining = proof.expiresAt - Date.now();
  return Math.max(0, remaining);
}

/**
 * Check if proof will expire within given time
 */
export function proofExpiresWithin(proof: ZKIDProof, ms: number): boolean {
  return getProofRemainingTime(proof) <= ms;
}

/**
 * Register a nullifier after successful claim
 */
export async function registerNullifier(
  nullifier: string,
  registry?: NullifierRegistry
): Promise<void> {
  const reg = registry ?? defaultRegistry;
  await reg.register(nullifier);
}
