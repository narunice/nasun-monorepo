/**
 * ZK-ID Module
 *
 * Privacy-preserving identity verification for Nasun Wallet.
 *
 * Features:
 * - Age Verification (without revealing actual age)
 * - KYC Verification (without revealing personal data)
 * - Unique Claim (Sybil resistance via nullifiers)
 *
 * Design Principles:
 * 1. Proof Capability abstraction (ZKClaimType)
 * 2. Domain Separation (Nullifier)
 * 3. Prover Abstraction (Interface)
 * 4. ClaimContext for campaign/chain/time context
 * 5. Security-First Testing
 */

// ============================================
// Types
// ============================================

export type {
  // Core claim types
  ZKClaimType,
  AgeThreshold,
  KYCLevel,
  CredentialSource,
  // Proof structures
  ZKProofPoints,
  NullifierInput,
  ClaimContext,
  ZKIDProof,
  ZKIDClaim,
  // Prover types
  ProverType,
  ProverCapabilities,
  ZKProofInput,
  ZKProofParams,
  ZKProofOutput,
  ZKProver,
  // Verification types
  ZKIDVerificationResult,
  NullifierRegistry,
  // Configuration
  ZKIDConfig,
  ZKClaimRequirement,
  // Store types
  ZKIDProofEntry,
  ZKIDLoadingState,
  ZKIDErrorState,
  // Error types
  ZKIDErrorCode,
} from './types';

export { ZKIDError } from './types';

// ============================================
// Prover
// ============================================

export {
  // Configuration
  configureZKID,
  getZKIDConfig,
  // Proof generation
  generateAgeProof,
  generateKYCProof,
  generateUniqueProof,
  // Prover instances
  createRemoteProver,
  createMockProver,
  getProver,
} from './prover';

// ============================================
// Nullifier
// ============================================

export {
  // Calculation
  calculateNullifier,
  isValidNullifier,
  createNullifierInput,
  // Registry implementations
  InMemoryNullifierRegistry,
  APIBackedNullifierRegistry,
  // Domain helpers
  NULLIFIER_DOMAINS,
  parseDomain,
} from './nullifier';

// ============================================
// Verifier
// ============================================

export {
  // Core verification
  verifyProof,
  validateProofStructure,
  validateContext,
  verifyAgainstCondition,
  // Condition types
  type ZKIDConditionCheck,
  // Registry management
  setDefaultNullifierRegistry,
  getDefaultNullifierRegistry,
  registerNullifier,
  // Utility functions
  isProofExpired,
  getProofRemainingTime,
  proofExpiresWithin,
} from './verifier';
