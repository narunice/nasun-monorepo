/**
 * useLendingActions Hook
 * Handles deposit and withdraw transactions
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin, usePasskeyStore, getSuiClient } from '@nasun/wallet';
import {
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildWithdrawAmountTransaction,
} from '../lib/lending-client';

interface UseLendingActionsResult {
  deposit: (amount: bigint) => Promise<string>;
  withdraw: (positionId: string) => Promise<string>;
  withdrawAmount: (positionId: string, amount: bigint) => Promise<string>;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

export function useLendingActions(): UseLendingActionsResult {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  // Determine active wallet (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Sign and execute a transaction (supports both local wallet and zkLogin)
   */
  const signAndExecute = useCallback(async (tx: Transaction): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    const client = getSuiClient();
    tx.setSender(walletAddress);
    const bytes = await tx.build({ client });

    // Sign with appropriate method
    let signature: string;
    if (isZkLoggedIn && zkState) {
      // zkLogin signing
      signature = await zkSignTransaction(bytes);
    } else if (isPasskeyUnlocked && passkeyKeypair) {
      const signResult = await passkeyKeypair.signTransaction(bytes);
      signature = signResult.signature;
    } else {
      // Local wallet signing
      const keypair = getKeypair();
      if (!keypair) {
        throw new Error('Keypair not available');
      }
      const signResult = await keypair.signTransaction(bytes);
      signature = signResult.signature;
    }

    const result = await client.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error || 'Transaction failed');
    }

    return result.digest;
  }, [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair]);

  /**
   * Deposit NUSDC into the lending pool.
   * SDK's coinWithBalance intent handles coin fetching, merging, and splitting.
   */
  const deposit = useCallback(async (amount: bigint): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildDepositTransaction(amount);
      return await signAndExecute(tx);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Deposit failed';
      // Normalize SDK shortfall message to user-facing text.
      const message = raw.includes('Not enough coins of type')
        ? 'Insufficient NUSDC balance.'
        : raw;
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, signAndExecute]);

  /**
   * Withdraw full position from the lending pool
   */
  const withdraw = useCallback(async (positionId: string): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildWithdrawTransaction(positionId);
      const digest = await signAndExecute(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, signAndExecute]);

  /**
   * Withdraw specific amount from position
   */
  const withdrawAmount = useCallback(async (
    positionId: string,
    amount: bigint
  ): Promise<string> => {
    if (!walletAddress) {
      throw new Error('Wallet not connected');
    }

    setIsLoading(true);
    setError(null);

    try {
      const tx = buildWithdrawAmountTransaction(positionId, amount);
      const digest = await signAndExecute(tx);

      return digest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Withdraw failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, signAndExecute]);

  return {
    deposit,
    withdraw,
    withdrawAmount,
    isLoading,
    error,
    clearError,
  };
}
