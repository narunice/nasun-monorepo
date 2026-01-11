/**
 * useGaslessTransaction Hook
 *
 * Provides a simple interface for sending gasless transactions
 * via ERC-4337 smart accounts with automatic paymaster handling.
 */

import { useState, useCallback } from 'react';
import type { Hex, Address } from 'viem';
import { useSmartAccount } from './useSmartAccount';
import type { SmartAccountTxRequest, GasCostEstimate, PaymasterContext } from '../core/aa/types';

/**
 * Transaction status
 */
export type TransactionStatus =
  | 'idle'
  | 'estimating'
  | 'confirming'
  | 'pending'
  | 'success'
  | 'error';

/**
 * Transaction result
 */
export interface TransactionResult {
  /** Transaction hash */
  hash: Hex;
  /** Whether gas was sponsored */
  sponsored: boolean;
  /** Gas cost (if not sponsored) */
  gasCost?: GasCostEstimate;
}

/**
 * useGaslessTransaction hook result
 */
export interface UseGaslessTransactionResult {
  /** Send a gasless transaction */
  sendTransaction: (tx: SmartAccountTxRequest) => Promise<TransactionResult>;
  /** Send batch transactions */
  sendBatchTransactions: (txs: SmartAccountTxRequest[]) => Promise<TransactionResult>;
  /** Estimate gas cost for a transaction */
  estimateGas: (tx: SmartAccountTxRequest) => Promise<GasCostEstimate>;
  /** Get paymaster context (sponsorship status) */
  getPaymasterContext: (tx: SmartAccountTxRequest) => Promise<PaymasterContext>;
  /** Current transaction status */
  status: TransactionStatus;
  /** Last transaction result */
  result: TransactionResult | null;
  /** Error message if any */
  error: string | null;
  /** Whether smart account is available */
  isAvailable: boolean;
  /** Whether transactions are sponsored by default */
  isSponsored: boolean;
  /** Smart account address */
  smartAccountAddress: Address | null;
  /** Reset status and error */
  reset: () => void;
}

/**
 * Hook for sending gasless transactions
 *
 * Provides a high-level interface for ERC-4337 transactions with
 * automatic paymaster handling and fallback support.
 *
 * @param paymasterApiKey - Pimlico API key for gas sponsorship
 * @param enableFallback - Whether to fallback to user-paid if sponsorship fails (default: true)
 *
 * @example
 * ```tsx
 * function SendButton() {
 *   const {
 *     sendTransaction,
 *     status,
 *     isSponsored,
 *     error
 *   } = useGaslessTransaction('pk_...');
 *
 *   const handleSend = async () => {
 *     const result = await sendTransaction({
 *       to: '0x...',
 *       value: parseEther('0.1'),
 *     });
 *
 *     if (result.sponsored) {
 *       console.log('Transaction was sponsored!');
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleSend} disabled={status === 'pending'}>
 *       {isSponsored ? 'Send (Free)' : 'Send'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useGaslessTransaction(
  paymasterApiKey?: string,
  enableFallback = true
): UseGaslessTransactionResult {
  const {
    state,
    signer,
    isSponsored,
    sendTransaction: smartSend,
    sendBatchTransactions: smartSendBatch,
  } = useSmartAccount(paymasterApiKey);

  const [status, setStatus] = useState<TransactionStatus>('idle');
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Send a single transaction
   */
  const sendTransaction = useCallback(
    async (tx: SmartAccountTxRequest): Promise<TransactionResult> => {
      if (!signer) {
        throw new Error('Smart account not available');
      }

      setStatus('pending');
      setError(null);
      setResult(null);

      try {
        let hash: Hex;
        let sponsored = isSponsored;

        if (enableFallback && isSponsored) {
          // Use fallback-enabled method
          const fallbackResult = await signer.sendTransactionWithFallback(tx);
          hash = fallbackResult.hash;
          sponsored = fallbackResult.sponsored;
        } else {
          // Direct send without fallback
          hash = await smartSend(tx);
        }

        const txResult: TransactionResult = {
          hash,
          sponsored,
        };

        setResult(txResult);
        setStatus('success');

        return txResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';
        setError(message);
        setStatus('error');
        throw err;
      }
    },
    [signer, isSponsored, enableFallback, smartSend]
  );

  /**
   * Send batch transactions
   */
  const sendBatchTransactions = useCallback(
    async (txs: SmartAccountTxRequest[]): Promise<TransactionResult> => {
      if (!signer) {
        throw new Error('Smart account not available');
      }

      setStatus('pending');
      setError(null);
      setResult(null);

      try {
        const hash = await smartSendBatch(txs);

        const txResult: TransactionResult = {
          hash,
          sponsored: isSponsored,
        };

        setResult(txResult);
        setStatus('success');

        return txResult;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Batch transaction failed';
        setError(message);
        setStatus('error');
        throw err;
      }
    },
    [signer, isSponsored, smartSendBatch]
  );

  /**
   * Estimate gas cost
   */
  const estimateGas = useCallback(
    async (tx: SmartAccountTxRequest): Promise<GasCostEstimate> => {
      if (!signer) {
        throw new Error('Smart account not available');
      }

      setStatus('estimating');

      try {
        const estimate = await signer.estimateGas(tx);
        setStatus('idle');
        return estimate;
      } catch (err) {
        setStatus('idle');
        throw err;
      }
    },
    [signer]
  );

  /**
   * Get paymaster context
   */
  const getPaymasterContext = useCallback(
    async (tx: SmartAccountTxRequest): Promise<PaymasterContext> => {
      if (!signer) {
        throw new Error('Smart account not available');
      }

      return signer.getPaymasterContext(tx);
    },
    [signer]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return {
    sendTransaction,
    sendBatchTransactions,
    estimateGas,
    getPaymasterContext,
    status,
    result,
    error,
    isAvailable: !!signer,
    isSponsored,
    smartAccountAddress: state?.address ?? null,
    reset,
  };
}

/**
 * Hook to check if gasless transactions are available
 *
 * @returns Whether the current chain and signer support gasless transactions
 */
export function useIsGaslessAvailable(): boolean {
  const { state } = useSmartAccount();
  return !!state;
}
