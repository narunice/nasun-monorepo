/**
 * Nasun Wallet Transaction Hook
 * NASUN token transfer functionality
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet } from './useWallet';
import { useRefreshBalance } from './useBalance';
import { getSuiClient, parseAmount, isValidAddress } from '../sui/client';
import type { TransactionRequest, TransactionResult } from '../types';

interface UseTransactionReturn {
  // State
  isPending: boolean;
  error: string | null;
  lastResult: TransactionResult | null;

  // Actions
  sendTransaction: (request: TransactionRequest) => Promise<TransactionResult>;
  clearError: () => void;
  clearResult: () => void;
}

export function useTransaction(): UseTransactionReturn {
  const { status, account, getKeypair } = useWallet();
  const refreshBalance = useRefreshBalance();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);

  const sendTransaction = useCallback(
    async (request: TransactionRequest): Promise<TransactionResult> => {
      // Validate wallet state
      if (status !== 'unlocked' || !account) {
        const err = 'Wallet is not unlocked';
        setError(err);
        throw new Error(err);
      }

      // Validate recipient address
      if (!isValidAddress(request.to)) {
        const err = 'Invalid recipient address';
        setError(err);
        throw new Error(err);
      }

      // Validate amount
      const amountInSoe = parseAmount(request.amount);
      if (amountInSoe <= BigInt(0)) {
        const err = 'Invalid amount';
        setError(err);
        throw new Error(err);
      }

      // Get keypair
      const keypair = getKeypair();
      if (!keypair) {
        const err = 'Keypair not available';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        // Create transaction
        const tx = new Transaction();

        // Split coins and transfer
        const [coin] = tx.splitCoins(tx.gas, [amountInSoe]);
        tx.transferObjects([coin], request.to);

        // Sign and execute transaction
        const suiClient = getSuiClient();
        const result = await suiClient.signAndExecuteTransaction({
          signer: keypair,
          transaction: tx,
          options: {
            showEffects: true,
          },
        });

        // Parse result
        const txResult: TransactionResult = {
          digest: result.digest,
          status: result.effects?.status?.status === 'success' ? 'success' : 'failure',
          gasUsed: result.effects?.gasUsed
            ? (
                BigInt(result.effects.gasUsed.computationCost) +
                BigInt(result.effects.gasUsed.storageCost) -
                BigInt(result.effects.gasUsed.storageRebate)
              ).toString()
            : undefined,
          error: result.effects?.status?.error,
        };

        setLastResult(txResult);
        setIsPending(false);

        // Refresh balance
        await refreshBalance();

        return txResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';
        setError(message);
        setIsPending(false);

        const failedResult: TransactionResult = {
          digest: '',
          status: 'failure',
          error: message,
        };
        setLastResult(failedResult);

        throw err;
      }
    },
    [status, account, getKeypair, refreshBalance]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return {
    isPending,
    error,
    lastResult,
    sendTransaction,
    clearError,
    clearResult,
  };
}
