/**
 * useEVMTransaction Hook
 *
 * Sends EVM transactions using the EVMSigner.
 * Supports native token transfers and contract interactions.
 */

import { useState, useCallback } from 'react';
import { parseEther } from 'viem';
import { useChain } from './useChain';
import { useRefreshEVMBalance } from './useEVMBalance';
import { getEVMClient } from '../core/evm/client';
import { EVMSigner } from '../core/signer/adapters/EVMSigner';
import { SignerManager } from '../core/signer/SignerManager';
import { isValidEVMAddress } from '../core/evm/wallet';

/**
 * EVM transaction request for native token transfer
 */
export interface EVMTransferRequest {
  /** Recipient address */
  to: string;
  /** Amount in ETH (or native token) as string */
  amount: string;
}

/**
 * EVM transaction request for contract interaction
 */
export interface EVMContractCallRequest {
  /** Contract address */
  to: string;
  /** Encoded call data */
  data: `0x${string}`;
  /** Optional value to send (in wei) */
  value?: bigint;
}

/**
 * EVM transaction result
 */
export interface EVMTransactionResult {
  /** Transaction hash */
  hash: `0x${string}`;
  /** Transaction status */
  status: 'success' | 'failure' | 'pending';
  /** Gas used (after confirmation) */
  gasUsed?: string;
  /** Block number (after confirmation) */
  blockNumber?: bigint;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Result of useEVMTransaction hook
 */
export interface UseEVMTransactionResult {
  /** Transaction is pending */
  isPending: boolean;
  /** Current error message */
  error: string | null;
  /** Last transaction result */
  lastResult: EVMTransactionResult | null;
  /** Send native token transfer */
  sendTransfer: (request: EVMTransferRequest) => Promise<EVMTransactionResult>;
  /** Send contract call */
  sendContractCall: (request: EVMContractCallRequest) => Promise<EVMTransactionResult>;
  /** Clear error state */
  clearError: () => void;
  /** Clear last result */
  clearResult: () => void;
}

/**
 * Hook for sending EVM transactions
 *
 * @example
 * ```tsx
 * const { sendTransfer, isPending, lastResult } = useEVMTransaction();
 *
 * const handleSend = async () => {
 *   try {
 *     const result = await sendTransfer({
 *       to: '0x...',
 *       amount: '0.1',
 *     });
 *     console.log('TX Hash:', result.hash);
 *   } catch (err) {
 *     console.error(err);
 *   }
 * };
 * ```
 */
export function useEVMTransaction(): UseEVMTransactionResult {
  const { chain, isEVM } = useChain();
  const refreshBalance = useRefreshEVMBalance();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<EVMTransactionResult | null>(null);

  /**
   * Get the current EVM signer
   */
  const getEVMSigner = useCallback((): EVMSigner => {
    const signer = SignerManager.getCurrent();
    if (!signer) {
      throw new Error('No signer available');
    }
    if (signer.type !== 'evm') {
      throw new Error('Current signer is not an EVM signer');
    }
    return signer as EVMSigner;
  }, []);

  /**
   * Send native token transfer
   */
  const sendTransfer = useCallback(
    async (request: EVMTransferRequest): Promise<EVMTransactionResult> => {
      // Validate chain
      if (!isEVM || !chain.chainId) {
        const err = 'Current chain is not an EVM chain';
        setError(err);
        throw new Error(err);
      }

      // Validate recipient
      if (!isValidEVMAddress(request.to)) {
        const err = 'Invalid recipient address';
        setError(err);
        throw new Error(err);
      }

      // Validate amount
      let valueInWei: bigint;
      try {
        valueInWei = parseEther(request.amount);
        if (valueInWei <= BigInt(0)) {
          throw new Error('Amount must be positive');
        }
      } catch {
        const err = 'Invalid amount';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const signer = getEVMSigner();
        const client = getEVMClient(chain);

        // Get nonce
        const nonce = await client.getTransactionCount({
          address: signer.address as `0x${string}`,
        });

        // Estimate gas
        const gasEstimate = await client.estimateGas({
          account: signer.address as `0x${string}`,
          to: request.to as `0x${string}`,
          value: valueInWei,
        });

        // Get gas price
        const gasPrice = await client.getGasPrice();

        // Sign transaction
        const signedTx = await signer.signEVMTransaction({
          to: request.to as `0x${string}`,
          value: valueInWei,
          gas: gasEstimate,
          gasPrice,
          nonce,
        });

        // Send transaction
        const hash = await client.sendRawTransaction({
          serializedTransaction: signedTx,
        });

        // Create pending result
        const pendingResult: EVMTransactionResult = {
          hash,
          status: 'pending',
        };
        setLastResult(pendingResult);

        // Wait for confirmation
        const receipt = await client.waitForTransactionReceipt({ hash });

        // Create final result
        const result: EVMTransactionResult = {
          hash,
          status: receipt.status === 'success' ? 'success' : 'failure',
          gasUsed: receipt.gasUsed.toString(),
          blockNumber: receipt.blockNumber,
        };

        setLastResult(result);
        setIsPending(false);

        // Refresh balance
        refreshBalance();

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';
        setError(message);
        setIsPending(false);

        const failedResult: EVMTransactionResult = {
          hash: '0x' as `0x${string}`,
          status: 'failure',
          error: message,
        };
        setLastResult(failedResult);

        throw err;
      }
    },
    [isEVM, chain, getEVMSigner, refreshBalance]
  );

  /**
   * Send contract call
   */
  const sendContractCall = useCallback(
    async (request: EVMContractCallRequest): Promise<EVMTransactionResult> => {
      // Validate chain
      if (!isEVM || !chain.chainId) {
        const err = 'Current chain is not an EVM chain';
        setError(err);
        throw new Error(err);
      }

      // Validate contract address
      if (!isValidEVMAddress(request.to)) {
        const err = 'Invalid contract address';
        setError(err);
        throw new Error(err);
      }

      setIsPending(true);
      setError(null);

      try {
        const signer = getEVMSigner();
        const client = getEVMClient(chain);

        // Get nonce
        const nonce = await client.getTransactionCount({
          address: signer.address as `0x${string}`,
        });

        // Estimate gas
        const gasEstimate = await client.estimateGas({
          account: signer.address as `0x${string}`,
          to: request.to as `0x${string}`,
          data: request.data,
          value: request.value,
        });

        // Get gas price
        const gasPrice = await client.getGasPrice();

        // Sign transaction
        const signedTx = await signer.signEVMTransaction({
          to: request.to as `0x${string}`,
          data: request.data,
          value: request.value,
          gas: gasEstimate,
          gasPrice,
          nonce,
        });

        // Send transaction
        const hash = await client.sendRawTransaction({
          serializedTransaction: signedTx,
        });

        // Create pending result
        const pendingResult: EVMTransactionResult = {
          hash,
          status: 'pending',
        };
        setLastResult(pendingResult);

        // Wait for confirmation
        const receipt = await client.waitForTransactionReceipt({ hash });

        // Create final result
        const result: EVMTransactionResult = {
          hash,
          status: receipt.status === 'success' ? 'success' : 'failure',
          gasUsed: receipt.gasUsed.toString(),
          blockNumber: receipt.blockNumber,
        };

        setLastResult(result);
        setIsPending(false);

        // Refresh balance
        refreshBalance();

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';
        setError(message);
        setIsPending(false);

        const failedResult: EVMTransactionResult = {
          hash: '0x' as `0x${string}`,
          status: 'failure',
          error: message,
        };
        setLastResult(failedResult);

        throw err;
      }
    },
    [isEVM, chain, getEVMSigner, refreshBalance]
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
    sendTransfer,
    sendContractCall,
    clearError,
    clearResult,
  };
}
