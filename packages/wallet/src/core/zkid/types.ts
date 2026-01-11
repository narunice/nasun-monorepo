/**
 * ZK-ID Module Types
 *
 * Privacy-preserving identity verification for Nasun Wallet.
 * Supports Age/KYC/Unique claim verification without revealing personal data.
 *
 * Design Principles (from reviewer feedback):
 * 1. Proof Capability abstraction (ZKClaimType)
 * 2. Domain Separation (Nullifier)
 * 3. Prover Abstraction (Interface)
 * 4. ClaimContext for campaign/chain/time context
 * 5. Security-First Testing
 */

// ============================================
// Core Claim Types
// ============================================

/**
 * ZK Claim Type - "Proof Capability" abstraction
 * Defines what can be proven, not how it's used
 */
export type ZKClaimType =
  | 'age_over' // Age threshold verification
  | 'kyc_completed' // KYC completion status
  | 'unique_claim' // One-time claim (Sybil resistance)
  | 'custom'; // Future extensions (country, DAO membership, etc.)

/** Age threshold values */
export type AgeThreshold = 18 | 21 | 25;

/** KYC verification level */
export type KYCLevel = 'basic' | 'advanced' | 'full';

/** Credential data source */
export type CredentialSource =
  | 'government-id' // Government-issued ID
  | 'oauth' // OAuth provider (Google, etc.)
  | 'kyc-provider' // External KYC (Jumio, Onfido)
  | 'self-attested'; // Self-attestation (testing only)

// ============================================
// ZK Proof Structures
// ============================================

/**
 * ZK Proof Points (Groth16 format, same as zkLogin)
 */
export interface ZKProofPoints {
  a: string[];
  b: string[][];
  c: string[];
}

/**
 * Nullifier Input - Domain Separation principle
 * nullifier = hash(credential_secret, domain, action_id)
 *
 * SECURITY: Domain separation prevents cross-context nullifier reuse
 */
export interface NullifierInput {
  /** User's credential secret (derived from private credential data) */
  credentialSecret: string;
  /** Context domain (e.g., "nasun.link", "campaign:abc123") */
  domain: string;
  /** Action identifier (e.g., claim ID, event ID) */
  actionId: string;
}

/**
 * Claim Context - Proof generation context
 * Enables campaign/chain/time-bounded claims
 */
export interface ClaimContext {
  /** Link ID for Nasun Link integration */
  linkId: string;
  /** Optional campaign identifier */
  campaignId?: string;
  /** Chain ID where claim is valid */
  chainId: number;
  /** Context creation timestamp */
  timestamp: number;
  /** Optional expiration timestamp */
  expiresAt?: number;
}

/**
 * ZK-ID Proof
 * The cryptographic proof of a claim
 */
export interface ZKIDProof {
  /** Type of claim being proven */
  type: ZKClaimType;
  /** Groth16 proof points */
  proofPoints: ZKProofPoints;
  /** Public inputs for verification */
  publicInputs: string[];
  /** Nullifier for unique_claim (prevents double-claiming) */
  nullifier?: string;
  /** Context in which proof was generated */
  context?: ClaimContext;
  /** Proof generation timestamp */
  generatedAt: number;
  /** Proof expiration timestamp */
  expiresAt: number;
}

/**
 * ZK-ID Claim metadata
 * Stored alongside proof for reference
 */
export interface ZKIDClaim {
  /** Claim type */
  type: ZKClaimType;
  /** Age threshold (for age_over claims) */
  threshold?: AgeThreshold;
  /** KYC level (for kyc_completed claims) */
  level?: KYCLevel;
  /** Context ID (for unique_claim) */
  contextId?: string;
  /** Credential source */
  source: CredentialSource;
  /** Claim issuance timestamp */
  issuedAt: number;
}

// ============================================
// Prover Abstraction
// ============================================

/** Prover deployment type */
export type ProverType = 'local' | 'remote' | 'hybrid';

/**
 * Prover Capabilities
 * Describes what a prover implementation supports
 */
export interface ProverCapabilities {
  /** Supports local (WASM) proving */
  supportsLocal: boolean;
  /** Supports remote (API) proving */
  supportsRemote: boolean;
  /** Supported claim types */
  supportedClaimTypes: ZKClaimType[];
  /** Maximum proof generation timeout (ms) */
  maxTimeout: number;
}

/**
 * Proof Input - Common input for all proof types
 */
export interface ZKProofInput {
  /** Claim type to generate proof for */
  claimType: ZKClaimType;
  /** Encrypted credential data */
  encryptedCredential: string;
  /** User commitment (for binding) */
  commitment: string;
  /** Claim context */
  context?: ClaimContext;
  /** Type-specific parameters */
  params: ZKProofParams;
}

/** Type-specific proof parameters */
export type ZKProofParams =
  | { type: 'age_over'; threshold: AgeThreshold }
  | { type: 'kyc_completed'; level: KYCLevel }
  | { type: 'unique_claim'; nullifierInput: NullifierInput }
  | { type: 'custom'; data: Record<string, unknown> };

/**
 * Proof Output - Result from prover
 */
export interface ZKProofOutput {
  /** Generated proof */
  proof: ZKIDProof;
  /** Associated claim metadata */
  claim: ZKIDClaim;
  /** Verification key identifier */
  verificationKeyId: string;
}

/**
 * ZK Prover Interface
 * Abstraction for Local/Remote/Hybrid prover implementations
 */
export interface ZKProver {
  /** Generate a ZK proof */
  generateProof(input: ZKProofInput): Promise<ZKProofOutput>;
  /** Get prover capabilities */
  getCapabilities(): ProverCapabilities;
}

// ============================================
// Verification Types
// ============================================

/**
 * Verification Result
 */
export interface ZKIDVerificationResult {
  /** Whether verification passed */
  valid: boolean;
  /** Error reason if invalid */
  reason?: string;
  /** Detailed error code if invalid */
  errorCode?: ZKIDErrorCode;
}

/**
 * Nullifier Registry Interface
 * Tracks used nullifiers to prevent double-claiming
 */
export interface NullifierRegistry {
  /** Check if nullifier has been used */
  check(nullifier: string): Promise<boolean>;
  /** Register a nullifier as used */
  register(nullifier: string): Promise<void>;
}

// ============================================
// Configuration
// ============================================

/**
 * ZK-ID Module Configuration
 */
export interface ZKIDConfig {
  /** Prover URL for remote proving */
  proverUrl: string;
  /** Verifier URL for remote verification (optional) */
  verifierUrl?: string;
  /** Default prover type */
  proverType: ProverType;
  /** Default proof TTL in seconds */
  defaultProofTTL: number;
  /** Chain ID for context */
  chainId: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================
// Nasun Link Integration
// ============================================

/**
 * ZK Claim Requirement
 * Abstracted proof requirement for ClaimCondition
 */
export interface ZKClaimRequirement {
  /** Required claim type */
  claimType: ZKClaimType;
  /** Type-specific parameters */
  params?: Record<string, unknown>;
}

// ============================================
// Error Handling
// ============================================

/** ZK-ID Error codes */
export type ZKIDErrorCode =
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_INVALID'
  | 'PROOF_GENERATION_FAILED'
  | 'PROOF_VERIFICATION_FAILED'
  | 'PROOF_EXPIRED'
  | 'NULLIFIER_ALREADY_USED'
  | 'NULLIFIER_DOMAIN_MISMATCH'
  | 'CONTEXT_EXPIRED'
  | 'CONTEXT_CHAIN_MISMATCH'
  | 'PROVER_UNAVAILABLE'
  | 'PROVER_TIMEOUT'
  | 'UNSUPPORTED_CLAIM_TYPE'
  | 'INVALID_THRESHOLD'
  | 'CONFIG_NOT_INITIALIZED';

/**
 * ZK-ID Error class
 */
export class ZKIDError extends Error {
  constructor(
    public readonly code: ZKIDErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ZKIDError';
  }
}

// ============================================
// Store Types
// ============================================

/**
 * Proof entry for store
 */
export interface ZKIDProofEntry {
  proof: ZKIDProof;
  claim: ZKIDClaim;
  verificationKeyId: string;
  storedAt: number;
}

/**
 * Loading state per claim type
 */
export interface ZKIDLoadingState {
  age_over: boolean;
  kyc_completed: boolean;
  unique_claim: boolean;
  custom: boolean;
}

/**
 * Error state per claim type
 */
export interface ZKIDErrorState {
  age_over: ZKIDError | null;
  kyc_completed: ZKIDError | null;
  unique_claim: ZKIDError | null;
  custom: ZKIDError | null;
}
