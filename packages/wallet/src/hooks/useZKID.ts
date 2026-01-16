/**
 * useZKID Hook
 *
 * React hook for ZK-ID proof generation and verification.
 * Provides a unified interface for all ZK-ID operations.
 */

import { useCallback, useMemo } from 'react';
import { useZKIDStore } from '../stores/zkidStore';
import {
  type ZKClaimType,
  type AgeThreshold,
  type KYCLevel,
  type ClaimContext,
  type NullifierInput,
  type ZKIDProof,
  type ZKIDProofEntry,
  type ZKIDConfig,
  ZKIDError,
} from '../core/zkid/types';
import {
  configureZKID as coreConfigureZKID,
  generateAgeProof,
  generateKYCProof,
  generateUniqueProof,
} from '../core/zkid/prover';
import {
  verifyProof,
  verifyAgainstCondition,
  type ZKIDConditionCheck,
} from '../core/zkid/verifier';
import {
  decryptCredential,
  getCredentialById,
  updateCredentialLastUsed,
} from '../core/zkid/credential';
import { createNullifierInput } from '../core/zkid/nullifier';

// ============================================
// Configuration
// ============================================

/**
 * Initialize ZK-ID module
 * Should be called once at app startup
 */
export function initZKID(config: ZKIDConfig): void {
  coreConfigureZKID(config);
}

// ============================================
// Hook Options
// ============================================

export interface UseZKIDOptions {
  /** Auto-remove expired proofs on mount */
  autoCleanup?: boolean;
  /** Credential password for decryption */
  credentialPassword?: string;
}

// ============================================
// Hook Result
// ============================================

export interface UseZKIDResult {
  // State
  /** Get proof by type */
  getProof: (type: ZKClaimType) => ZKIDProofEntry | null;
  /** Check if valid proof exists */
  hasValidProof: (type: ZKClaimType) => boolean;
  /** Loading state by type */
  isLoading: (type: ZKClaimType) => boolean;
  /** Error state by type */
  getError: (type: ZKClaimType) => ZKIDError | null;

  // Proof Generation
  /** Generate age verification proof */
  proveAge: (
    credentialId: string,
    threshold: AgeThreshold,
    commitment: string,
    context?: ClaimContext
  ) => Promise<ZKIDProofEntry>;
  /** Generate KYC verification proof */
  proveKYC: (
    credentialId: string,
    level: KYCLevel,
    commitment: string,
    context?: ClaimContext
  ) => Promise<ZKIDProofEntry>;
  /** Generate unique claim proof */
  proveUnique: (
    credentialId: string,
    domain: string,
    actionId: string,
    commitment: string,
    context?: ClaimContext
  ) => Promise<ZKIDProofEntry>;

  // Verification
  /** Verify a proof */
  verify: (proof: ZKIDProof, expectedChainId?: number) => Promise<boolean>;
  /** Verify against a condition */
  verifyCondition: (
    proof: ZKIDProof,
    condition: ZKIDConditionCheck
  ) => Promise<boolean>;

  // Management
  /** Clear proof by type */
  clearProof: (type: ZKClaimType) => void;
  /** Clear all proofs */
  clearAllProofs: () => void;
  /** Clear errors */
  clearErrors: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useZKID(options: UseZKIDOptions = {}): UseZKIDResult {
  const { credentialPassword } = options;

  const store = useZKIDStore();

  // ========================================
  // State Selectors
  // ========================================

  const getProof = useCallback(
    (type: ZKClaimType) => store.getProof(type),
    [store]
  );

  const hasValidProof = useCallback(
    (type: ZKClaimType) => store.hasValidProof(type),
    [store]
  );

  const isLoading = useCallback(
    (type: ZKClaimType) => store.loading[type],
    [store.loading]
  );

  const getError = useCallback(
    (type: ZKClaimType) => store.errors[type],
    [store.errors]
  );

  // ========================================
  // Helper: Decrypt Credential
  // ========================================

  const getDecryptedCredential = useCallback(
    async (credentialId: string) => {
      if (!credentialPassword) {
        throw new ZKIDError(
          'CREDENTIAL_INVALID',
          'Credential password not provided'
        );
      }

      const entry = getCredentialById(credentialId);
      if (!entry) {
        throw new ZKIDError(
          'CREDENTIAL_INVALID',
          `Credential not found: ${credentialId}`
        );
      }

      const raw = await decryptCredential(entry.credential, credentialPassword);
      updateCredentialLastUsed(credentialId);

      return raw;
    },
    [credentialPassword]
  );

  // ========================================
  // Proof Generation
  // ========================================

  const proveAge = useCallback(
    async (
      credentialId: string,
      threshold: AgeThreshold,
      commitment: string,
      context?: ClaimContext
    ): Promise<ZKIDProofEntry> => {
      const type: ZKClaimType = 'age_over';

      try {
        store.setLoading(type, true);
        store.setError(type, null);

        // Get credential
        const credential = await getDecryptedCredential(credentialId);

        // Generate proof
        const result = await generateAgeProof(
          JSON.stringify(credential),
          threshold,
          commitment,
          context
        );

        const entry: ZKIDProofEntry = {
          proof: result.proof,
          claim: result.claim,
          verificationKeyId: result.verificationKeyId,
          storedAt: Date.now(),
        };

        store.setProof(type, entry);
        return entry;
      } catch (error) {
        const zkError =
          error instanceof ZKIDError
            ? error
            : new ZKIDError(
                'PROOF_GENERATION_FAILED',
                error instanceof Error ? error.message : 'Unknown error'
              );
        store.setError(type, zkError);
        throw zkError;
      } finally {
        store.setLoading(type, false);
      }
    },
    [store, getDecryptedCredential]
  );

  const proveKYC = useCallback(
    async (
      credentialId: string,
      level: KYCLevel,
      commitment: string,
      context?: ClaimContext
    ): Promise<ZKIDProofEntry> => {
      const type: ZKClaimType = 'kyc_completed';

      try {
        store.setLoading(type, true);
        store.setError(type, null);

        const credential = await getDecryptedCredential(credentialId);

        const result = await generateKYCProof(
          JSON.stringify(credential),
          level,
          commitment,
          context
        );

        const entry: ZKIDProofEntry = {
          proof: result.proof,
          claim: result.claim,
          verificationKeyId: result.verificationKeyId,
          storedAt: Date.now(),
        };

        store.setProof(type, entry);
        return entry;
      } catch (error) {
        const zkError =
          error instanceof ZKIDError
            ? error
            : new ZKIDError(
                'PROOF_GENERATION_FAILED',
                error instanceof Error ? error.message : 'Unknown error'
              );
        store.setError(type, zkError);
        throw zkError;
      } finally {
        store.setLoading(type, false);
      }
    },
    [store, getDecryptedCredential]
  );

  const proveUnique = useCallback(
    async (
      credentialId: string,
      domain: string,
      actionId: string,
      commitment: string,
      context?: ClaimContext
    ): Promise<ZKIDProofEntry> => {
      const type: ZKClaimType = 'unique_claim';

      try {
        store.setLoading(type, true);
        store.setError(type, null);

        const credential = await getDecryptedCredential(credentialId);

        const nullifierInput: NullifierInput = createNullifierInput(
          credential.secret,
          domain,
          actionId
        );

        const result = await generateUniqueProof(
          JSON.stringify(credential),
          nullifierInput,
          commitment,
          context
        );

        const entry: ZKIDProofEntry = {
          proof: result.proof,
          claim: result.claim,
          verificationKeyId: result.verificationKeyId,
          storedAt: Date.now(),
        };

        store.setProof(type, entry);
        return entry;
      } catch (error) {
        const zkError =
          error instanceof ZKIDError
            ? error
            : new ZKIDError(
                'PROOF_GENERATION_FAILED',
                error instanceof Error ? error.message : 'Unknown error'
              );
        store.setError(type, zkError);
        throw zkError;
      } finally {
        store.setLoading(type, false);
      }
    },
    [store, getDecryptedCredential]
  );

  // ========================================
  // Verification
  // ========================================

  const verify = useCallback(
    async (proof: ZKIDProof, expectedChainId?: number): Promise<boolean> => {
      const result = await verifyProof(proof, { expectedChainId });
      return result.valid;
    },
    []
  );

  const verifyCondition = useCallback(
    async (
      proof: ZKIDProof,
      condition: ZKIDConditionCheck
    ): Promise<boolean> => {
      const result = await verifyAgainstCondition(proof, condition);
      return result.valid;
    },
    []
  );

  // ========================================
  // Management
  // ========================================

  const clearProof = useCallback(
    (type: ZKClaimType) => {
      store.removeProof(type);
    },
    [store]
  );

  const clearAllProofs = useCallback(() => {
    store.clearAllProofs();
  }, [store]);

  const clearErrors = useCallback(() => {
    store.clearErrors();
  }, [store]);

  // ========================================
  // Return
  // ========================================

  return useMemo(
    () => ({
      // State
      getProof,
      hasValidProof,
      isLoading,
      getError,
      // Proof Generation
      proveAge,
      proveKYC,
      proveUnique,
      // Verification
      verify,
      verifyCondition,
      // Management
      clearProof,
      clearAllProofs,
      clearErrors,
    }),
    [
      getProof,
      hasValidProof,
      isLoading,
      getError,
      proveAge,
      proveKYC,
      proveUnique,
      verify,
      verifyCondition,
      clearProof,
      clearAllProofs,
      clearErrors,
    ]
  );
}
