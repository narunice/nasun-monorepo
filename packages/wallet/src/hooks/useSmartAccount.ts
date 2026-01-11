/**
 * useSmartAccount Hook
 *
 * React hook for managing ERC-4337 smart accounts.
 * Provides seamless integration with the signer abstraction layer.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Address, Hex } from 'viem';
import { useSigner } from './useSigner';
import { useChain } from './useChain';
import { EVMSigner } from '../core/signer/adapters/EVMSigner';
import { SmartAccountSigner } from '../core/signer/adapters/SmartAccountSigner';
import {
  getSimpleSmartAccount,
  getSmartAccountAddress,
  isAccountDeployed,
} from '../core/aa/account';
import type { SmartAccountState, SmartAccountTxRequest } from '../core/aa/types';

/**
 * Result of useSmartAccount hook
 */
export interface UseSmartAccountResult {
  /** Smart account state */
  state: SmartAccountState | null;
  /** Whether smart account is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** SmartAccountSigner instance */
  signer: SmartAccountSigner | null;
  /** Send transaction via smart account */
  sendTransaction: (tx: SmartAccountTxRequest) => Promise<Hex>;
  /** Send batch transactions */
  sendBatchTransactions: (txs: SmartAccountTxRequest[]) => Promise<Hex>;
  /** Whether gas sponsorship is enabled */
  isSponsored: boolean;
  /** Enable/disable sponsorship */
  setSponsored: (enabled: boolean) => void;
  /** Refresh smart account state */
  refresh: () => Promise<void>;
}

/**
 * Hook for managing ERC-4337 Smart Account
 *
 * Automatically initializes a smart account when an EVM signer
 * is available and the current chain supports AA.
 *
 * @param paymasterApiKey - Optional Pimlico API key for gas sponsorship
 *
 * @example
 * ```tsx
 * const { state, sendTransaction, isSponsored } = useSmartAccount('pk_...');
 *
 * // Check if smart account is ready
 * if (!state) {
 *   return <div>Loading smart account...</div>;
 * }
 *
 * // Send sponsored transaction
 * const handleSend = async () => {
 *   const hash = await sendTransaction({
 *     to: '0x...',
 *     value: parseEther('0.1'),
 *   });
 *   console.log('Transaction:', hash);
 * };
 * ```
 */
export function useSmartAccount(
  paymasterApiKey?: string
): UseSmartAccountResult {
  const { signer: baseSigner, hasSigner } = useSigner();
  const { chain, isEVM, supportsAA } = useChain();

  const [state, setState] = useState<SmartAccountState | null>(null);
  const [smartSigner, setSmartSigner] = useState<SmartAccountSigner | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSponsored, setIsSponsored] = useState(!!paymasterApiKey);

  /**
   * Initialize smart account
   */
  const initSmartAccount = useCallback(async () => {
    // Check prerequisites
    if (!isEVM || !supportsAA || !hasSigner('evm')) {
      setState(null);
      setSmartSigner(null);
      return;
    }

    // Check if baseSigner is an EVMSigner
    const evmSigner = baseSigner;
    if (!evmSigner || !(evmSigner instanceof EVMSigner)) {
      setState(null);
      setSmartSigner(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create smart account
      const smartAccount = await getSimpleSmartAccount(evmSigner, chain);

      // Check if deployed
      const deployed = await isAccountDeployed(chain, smartAccount.address);

      // Update state
      setState({
        address: smartAccount.address,
        isDeployed: deployed,
        type: 'simple',
        owner: evmSigner.address as Address,
        chainId: chain.chainId!,
      });

      // Create SmartAccountSigner
      const apiKey = isSponsored ? paymasterApiKey : undefined;
      const signer = new SmartAccountSigner(smartAccount, chain, apiKey);
      setSmartSigner(signer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to init smart account';
      setError(message);
      setState(null);
      setSmartSigner(null);
    } finally {
      setIsLoading(false);
    }
  }, [isEVM, supportsAA, baseSigner, hasSigner, chain, isSponsored, paymasterApiKey]);

  // Initialize on mount and when dependencies change
  useEffect(() => {
    initSmartAccount();
  }, [initSmartAccount]);

  /**
   * Toggle gas sponsorship
   */
  const setSponsored = useCallback(
    (enabled: boolean) => {
      if (enabled && !paymasterApiKey) {
        console.warn('[SmartAccount] Cannot enable sponsorship without API key');
        return;
      }
      setIsSponsored(enabled);
    },
    [paymasterApiKey]
  );

  /**
   * Send single transaction
   */
  const sendTransaction = useCallback(
    async (tx: SmartAccountTxRequest): Promise<Hex> => {
      if (!smartSigner) {
        throw new Error('Smart account not initialized');
      }
      return smartSigner.sendTransaction(tx);
    },
    [smartSigner]
  );

  /**
   * Send batch transactions
   */
  const sendBatchTransactions = useCallback(
    async (txs: SmartAccountTxRequest[]): Promise<Hex> => {
      if (!smartSigner) {
        throw new Error('Smart account not initialized');
      }
      return smartSigner.sendBatchTransactions(txs);
    },
    [smartSigner]
  );

  /**
   * Refresh smart account state
   */
  const refresh = useCallback(async () => {
    await initSmartAccount();
  }, [initSmartAccount]);

  return {
    state,
    isLoading,
    error,
    signer: smartSigner,
    sendTransaction,
    sendBatchTransactions,
    isSponsored,
    setSponsored,
    refresh,
  };
}

/**
 * Hook to get smart account address without full initialization
 *
 * Returns the counterfactual address that the smart account
 * would have once deployed.
 */
export function useSmartAccountAddress(): Address | null {
  const { signer, hasSigner } = useSigner();
  const { chain, isEVM, supportsAA } = useChain();
  const [address, setAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (!isEVM || !supportsAA || !hasSigner('evm')) {
      setAddress(null);
      return;
    }

    const evmSigner = signer;
    if (!evmSigner || !(evmSigner instanceof EVMSigner)) {
      setAddress(null);
      return;
    }

    getSmartAccountAddress(evmSigner, chain)
      .then(setAddress)
      .catch(() => setAddress(null));
  }, [isEVM, supportsAA, signer, hasSigner, chain]);

  return address;
}

/**
 * Hook to check if smart account is deployed
 */
export function useIsSmartAccountDeployed(): boolean {
  const { state } = useSmartAccount();
  return state?.isDeployed ?? false;
}
