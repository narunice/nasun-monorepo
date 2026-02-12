/**
 * Nasun Wallet Transaction Hook
 * NASUN token transfer functionality using unified Signer abstraction
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useSigner } from './useSigner';
import { useRefreshBalance } from './useBalance';
import { getSuiClient, getMoveClient, parseAmount, isValidAddress } from '../sui/client';
import { useChainStore } from './useChain';
import { getChain, isNasunChain } from '../config/chains';
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
  const { signer, address, isConnected } = useSigner();
  const refreshBalance = useRefreshBalance();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);

  const sendTransaction = useCallback(
    async (request: TransactionRequest): Promise<TransactionResult> => {
      // Validate signer state
      if (!signer || !address || !isConnected) {
        const err = 'Wallet is not connected';
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

      setIsPending(true);
      setError(null);

      try {
        // Create transaction
        const tx = new Transaction();
        tx.setSender(address);

        // Split coins and transfer
        const [coin] = tx.splitCoins(tx.gas, [amountInSoe]);
        tx.transferObjects([coin], request.to);

        // Build transaction bytes (chain-aware client)
        const chainId = useChainStore.getState().currentChainId;
        const chainConfig = getChain(chainId);
        const suiClient = chainConfig && !isNasunChain(chainId)
          ? getMoveClient(chainConfig.rpcUrl)
          : getSuiClient();
        const txBytes = await tx.build({ client: suiClient });

        // Sign using unified signer interface
        const { signature } = await signer.sign(txBytes);

        // Execute transaction
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
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
    [signer, address, isConnected, refreshBalance]
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
