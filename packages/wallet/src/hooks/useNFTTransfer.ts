/**
 * Nasun Wallet NFT Transfer Hook
 * Transfer NFTs to other addresses using unified Signer abstraction
 */

import { useState, useCallback } from 'react';
import { useSigner } from './useSigner';
import { useRefreshNFTs } from './useNFTs';
import { getSuiClient, isValidAddress } from '../sui/client';
import { buildNFTTransferTransaction } from '../sui/nft';
import type { TransactionResult } from '../types';
import type { NFTTransferRequest } from '../types/nft';

interface UseNFTTransferReturn {
  // State
  isPending: boolean;
  error: string | null;
  lastResult: TransactionResult | null;

  // Actions
  transferNFT: (request: NFTTransferRequest) => Promise<TransactionResult>;
  clearError: () => void;
  clearResult: () => void;
}

export function useNFTTransfer(): UseNFTTransferReturn {
  const { signer, address, isConnected } = useSigner();
  const refreshNFTs = useRefreshNFTs();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TransactionResult | null>(null);

  const transferNFT = useCallback(
    async (request: NFTTransferRequest): Promise<TransactionResult> => {
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

      // Validate object ID
      if (!request.objectId || !request.objectId.startsWith('0x')) {
        const err = 'Invalid NFT object ID';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const suiClient = getSuiClient();

        // Build transfer transaction
        const tx = buildNFTTransferTransaction(request.objectId, request.to);
        tx.setSender(address);

        // Build and sign transaction
        const txBytes = await tx.build({ client: suiClient });
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

        // Refresh NFT list
        refreshNFTs();

        return txResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'NFT transfer failed';
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
    [signer, address, isConnected, refreshNFTs]
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
    transferNFT,
    clearError,
    clearResult,
  };
}
