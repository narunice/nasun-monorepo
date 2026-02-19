/**
 * useNasunLink Hook
 *
 * React hook for creating and claiming Nasun Links.
 * Provides a simple interface for token distribution via URLs.
 */

import { useState, useCallback, useEffect } from 'react';
import { useSigner } from './useSigner';
import { useWallet } from './useWallet';
import type {
  LinkConfig,
  LinkURL,
  LinkData,
  ClaimResult,
  ClaimValidation,
} from '../core/link/types';
import { createLink, createBatchLinks } from '../core/link/generator';
import {
  claimLink,
  parseLinkUrl,
  validateClaim,
  checkLinkBalance,
  getClaimStatus,
} from '../core/link/claim';
import { LocalSigner } from '../core/signer/adapters/LocalSigner';
import { PasskeySigner } from '../core/signer/adapters/PasskeySigner';

/**
 * Result of useNasunLink hook
 */
export interface UseNasunLinkResult {
  /** Create a single claimable link */
  create: (config: LinkConfig) => Promise<{ url: LinkURL; data: LinkData }>;
  /** Create multiple links in batch */
  createBatch: (
    config: LinkConfig,
    count: number
  ) => Promise<Array<{ url: LinkURL; data: LinkData }>>;
  /** Claim tokens from a link */
  claim: (linkData: LinkData, secret: string, password?: string) => Promise<ClaimResult>;
  /** Check if link can be claimed */
  validateClaim: (linkData: LinkData, password?: string) => Promise<ClaimValidation>;
  /** Parse link URL to extract components */
  parseUrl: (url: string) => { linkId: string; secret: string };
  /** Check link balance */
  checkBalance: (
    ephemeralAddress: string,
    coinType: string
  ) => Promise<{ balance: bigint; hasFunds: boolean }>;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Clear error */
  clearError: () => void;
  /** Whether wallet is ready for link creation */
  canCreate: boolean;
  /** Whether wallet is ready for claiming */
  canClaim: boolean;
}

/**
 * Hook for creating and claiming Nasun Links
 *
 * Provides functionality to:
 * - Create claimable links funded from your wallet
 * - Claim tokens from received links
 * - Validate claim eligibility
 *
 * @example
 * ```tsx
 * const { create, claim, isLoading, error } = useNasunLink();
 *
 * // Create a link
 * const handleCreate = async () => {
 *   const { url, data } = await create({
 *     type: 'single',
 *     coinType: 'NSN',
 *     amount: 1000000000n, // 1 NASUN
 *     message: 'Welcome gift!',
 *   });
 *
 *   // Share url.fullUrl with recipient
 *   console.log('Share this link:', url.fullUrl);
 * };
 *
 * // Claim from a link
 * const handleClaim = async (linkData: LinkData, secret: string) => {
 *   const result = await claim(linkData, secret);
 *   console.log('Claimed!', result.txDigest);
 * };
 * ```
 */
export function useNasunLink(): UseNasunLinkResult {
  const { signer, address, isConnected } = useSigner();
  const { getKeypair } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet can create links (needs signer with keypair access: local or passkey)
  const canCreate = isConnected && (signer instanceof LocalSigner || signer instanceof PasskeySigner);

  // Check if wallet can claim (just needs an address)
  const canClaim = isConnected && !!address;

  /**
   * Create a single claimable link
   */
  const create = useCallback(
    async (config: LinkConfig): Promise<{ url: LinkURL; data: LinkData }> => {
      if (!canCreate) {
        throw new Error('Wallet not ready for link creation');
      }

      // Get keypair from local wallet or passkey signer
      const keypair = signer instanceof PasskeySigner
        ? signer.getKeypair()
        : getKeypair();
      if (!keypair) {
        throw new Error('Could not access wallet keypair');
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await createLink(config, keypair);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create link';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [canCreate, getKeypair, signer]
  );

  /**
   * Create multiple links in batch
   */
  const createBatch = useCallback(
    async (
      config: LinkConfig,
      count: number
    ): Promise<Array<{ url: LinkURL; data: LinkData }>> => {
      if (!canCreate) {
        throw new Error('Wallet not ready for link creation');
      }

      // Get keypair from local wallet or passkey signer
      const keypair = signer instanceof PasskeySigner
        ? signer.getKeypair()
        : getKeypair();
      if (!keypair) {
        throw new Error('Could not access wallet keypair');
      }

      setIsLoading(true);
      setError(null);

      try {
        const results = await createBatchLinks(config, count, keypair);
        return results;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create links';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [canCreate, getKeypair, signer]
  );

  /**
   * Claim tokens from a link
   */
  const claim = useCallback(
    async (
      linkData: LinkData,
      secret: string,
      password?: string
    ): Promise<ClaimResult> => {
      if (!canClaim || !address) {
        throw new Error('Wallet not connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await claimLink(linkData, secret, address, password);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to claim';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [canClaim, address]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    create,
    createBatch,
    claim,
    validateClaim,
    parseUrl: parseLinkUrl,
    checkBalance: checkLinkBalance,
    isLoading,
    error,
    clearError,
    canCreate,
    canClaim,
  };
}

/**
 * Hook for claiming from a link URL
 *
 * Parses the URL and provides claim functionality.
 *
 * @param linkStorage - Optional storage to fetch link data
 *
 * @example
 * ```tsx
 * const { claim, isLoading, error } = useClaimFromUrl();
 *
 * const handleClaim = async (fullUrl: string, linkData: LinkData) => {
 *   const result = await claim(fullUrl, linkData);
 *   console.log('Claimed!', result.txDigest);
 * };
 * ```
 */
export function useClaimFromUrl() {
  const { claim: claimLink, isLoading, error, canClaim } = useNasunLink();

  /**
   * Claim from a full URL
   */
  const claim = useCallback(
    async (fullUrl: string, linkData: LinkData, password?: string): Promise<ClaimResult> => {
      const { secret } = parseLinkUrl(fullUrl);
      return claimLink(linkData, secret, password);
    },
    [claimLink]
  );

  return {
    claim,
    parseUrl: parseLinkUrl,
    isLoading,
    error,
    canClaim,
  };
}

/**
 * Hook for link status display
 *
 * Provides human-readable status for a link.
 */
export function useLinkStatus(linkData: LinkData | null) {
  const [status, setStatus] = useState<{
    status: string;
    message: string;
    canClaim: boolean;
  } | null>(null);

  useEffect(() => {
    if (linkData) {
      setStatus(getClaimStatus(linkData));
    } else {
      setStatus(null);
    }
  }, [linkData]);

  return status;
}

/**
 * Hook for checking link balance
 */
export function useLinkBalance(ephemeralAddress: string | null, coinType: string) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [hasFunds, setHasFunds] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!ephemeralAddress) {
      setBalance(null);
      setHasFunds(null);
      return;
    }

    setIsLoading(true);

    checkLinkBalance(ephemeralAddress, coinType)
      .then(({ balance, hasFunds }) => {
        setBalance(balance);
        setHasFunds(hasFunds);
      })
      .catch(() => {
        setBalance(null);
        setHasFunds(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [ephemeralAddress, coinType]);

  return { balance, hasFunds, isLoading };
}
