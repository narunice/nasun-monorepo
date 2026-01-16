/**
 * usePayment Hook
 *
 * Main payment hook integrating Move and EVM transactions
 * with intent-based payment flow and validation.
 */

import { useState, useCallback, useMemo } from 'react';
import { useSigner } from './useSigner';
import { useChain } from './useChain';
import { useTransaction } from './useTransaction';
import { useTokenTransaction } from './useTokenTransaction';
import { useEVMTransaction } from './useEVMTransaction';
import { useGaslessTransaction } from './useGaslessTransaction';
import { usePaymentIntent } from './usePaymentIntent';
import { useAddressBook } from './useAddressBook';
import { useBalance } from './useBalance';
import {
  validatePayment,
  formatValidationErrors,
  NASUN_COIN_TYPE,
} from '../core/payment';
import type {
  PaymentRequest,
  PaymentResult,
  PaymentValidation,
  PaymentIntent,
  PaymentStatus,
  MovePaymentRequest,
  EVMPaymentRequest,
  RecipientStatus,
} from '../core/payment/types';
import { getExplorerTxUrl } from '../sui/client';

// ============================================
// Types
// ============================================

/**
 * Options for usePayment hook
 */
export interface UsePaymentOptions {
  /** API key for EVM paymaster */
  paymasterApiKey?: string;
  /** Skip user confirmation for trusted recipients */
  skipConfirmForTrusted?: boolean;
  /** Auto-record transactions to address book */
  autoRecordRecipients?: boolean;
}

/**
 * Result of usePayment hook
 */
export interface UsePaymentResult {
  /** Create and execute a payment */
  pay: (request: PaymentRequest) => Promise<PaymentResult>;
  /** Validate a payment before execution */
  validate: (request: PaymentRequest) => Promise<PaymentValidation>;
  /** Current payment status */
  status: PaymentStatus;
  /** Active payment intent (if in progress) */
  activeIntent: PaymentIntent | null;
  /** Last payment result */
  lastResult: PaymentResult | null;
  /** Error message */
  error: string | null;
  /** Reset state */
  reset: () => void;
  /** Whether wallet can make payments */
  canPay: boolean;
  /** Whether gasless is available (EVM AA) */
  isGaslessAvailable: boolean;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Main payment hook
 *
 * Routes payments to the appropriate transaction hook based on chain type.
 * Supports Move (Nasun) native tokens, Move custom tokens, EVM native tokens,
 * and EVM gasless transactions via smart accounts.
 *
 * @param options Hook options
 *
 * @example
 * ```tsx
 * const { pay, validate, status, error, lastResult, canPay } = usePayment();
 *
 * const handlePayment = async () => {
 *   // Validate first
 *   const validation = await validate({
 *     chainType: 'move',
 *     recipient: '0x...',
 *     amount: '10',
 *     tokenType: '0x2::sui::SUI',
 *   });
 *
 *   if (!validation.valid) {
 *     console.error(formatValidationErrors(validation.errors));
 *     return;
 *   }
 *
 *   // Execute payment
 *   try {
 *     const result = await pay({
 *       chainType: 'move',
 *       recipient: '0x...',
 *       amount: '10',
 *       tokenType: '0x2::sui::SUI',
 *     });
 *
 *     if (result.success) {
 *       console.log('TX Hash:', result.txHash);
 *     }
 *   } catch (err) {
 *     console.error(err);
 *   }
 * };
 * ```
 */
export function usePayment(options?: UsePaymentOptions): UsePaymentResult {
  const { signer, address, isConnected } = useSigner();
  const { chain } = useChain();
  const { createIntent } = usePaymentIntent();
  const { recordTransaction, isKnownAddress, isTrustedAddress, getEntry } = useAddressBook();

  // Balance for validation
  const { data: balanceData } = useBalance();

  // Move chain transactions
  const { sendTransaction: sendNativeTransaction } = useTransaction();
  const { sendTokenTransaction } = useTokenTransaction();

  // EVM transactions
  const { sendTransfer: sendEVMTransfer } = useEVMTransaction();
  const {
    sendTransaction: sendGaslessTransaction,
    isAvailable: isGaslessAvailable,
  } = useGaslessTransaction(options?.paymasterApiKey);

  // State
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [activeIntent, setActiveIntent] = useState<PaymentIntent | null>(null);
  const [lastResult, setLastResult] = useState<PaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Whether wallet can make payments
   */
  const canPay = useMemo(() => {
    return isConnected && !!signer && !!address;
  }, [isConnected, signer, address]);

  /**
   * Get recipient status from address book
   */
  const getRecipientStatus = useCallback(
    (recipientAddress: string): RecipientStatus | undefined => {
      if (!recipientAddress) return undefined;

      const entry = getEntry(recipientAddress);
      return {
        isKnown: isKnownAddress(recipientAddress),
        isTrusted: isTrustedAddress(recipientAddress),
        label: entry?.label,
        txCount: entry?.transactionCount,
      };
    },
    [getEntry, isKnownAddress, isTrustedAddress]
  );

  /**
   * Validate a payment request
   */
  const validate = useCallback(
    async (request: PaymentRequest): Promise<PaymentValidation> => {
      // Get recipient status from address book
      const recipientStatus = getRecipientStatus(request.recipient);

      // Get balance string
      const balance = balanceData?.formattedBalance || '0';

      // Validate
      return validatePayment(request, {
        balance,
        isConnected,
        hasSigner: !!signer,
        recipientStatus,
        currentChainId:
          request.chainType === 'evm'
            ? chain.chainId
            : undefined,
      });
    },
    [isConnected, signer, balanceData, chain.chainId, getRecipientStatus]
  );

  /**
   * Execute a Move native token payment
   */
  const executeMoveNativePayment = useCallback(
    async (request: MovePaymentRequest): Promise<PaymentResult> => {
      const result = await sendNativeTransaction({
        to: request.recipient,
        amount: request.amount,
      });

      return {
        success: result.status === 'success',
        txHash: result.digest,
        gasCost: result.gasUsed,
        explorerUrl: result.digest ? getExplorerTxUrl(result.digest) : undefined,
        completedAt: Date.now(),
        error: result.error,
      };
    },
    [sendNativeTransaction]
  );

  /**
   * Execute a Move token payment
   */
  const executeMoveTokenPayment = useCallback(
    async (request: MovePaymentRequest): Promise<PaymentResult> => {
      const result = await sendTokenTransaction({
        to: request.recipient,
        amount: request.amount,
        tokenType: request.tokenType,
      });

      return {
        success: result.status === 'success',
        txHash: result.digest,
        gasCost: result.gasUsed,
        explorerUrl: result.digest ? getExplorerTxUrl(result.digest) : undefined,
        completedAt: Date.now(),
        error: result.error,
      };
    },
    [sendTokenTransaction]
  );

  /**
   * Execute an EVM payment
   */
  const executeEVMPayment = useCallback(
    async (request: EVMPaymentRequest): Promise<PaymentResult> => {
      // Use gasless if available and requested
      if (request.useSmartAccount && isGaslessAvailable) {
        const result = await sendGaslessTransaction({
          to: request.recipient as `0x${string}`,
          value: BigInt(Math.floor(parseFloat(request.amount) * 1e18)),
        });

        return {
          success: true,
          txHash: result.hash,
          sponsored: result.sponsored,
          completedAt: Date.now(),
        };
      }

      // Regular EVM transfer
      const result = await sendEVMTransfer({
        to: request.recipient,
        amount: request.amount,
      });

      return {
        success: result.status === 'success',
        txHash: result.hash,
        gasCost: result.gasUsed,
        completedAt: Date.now(),
        error: result.error,
      };
    },
    [isGaslessAvailable, sendGaslessTransaction, sendEVMTransfer]
  );

  /**
   * Execute a payment
   */
  const pay = useCallback(
    async (request: PaymentRequest): Promise<PaymentResult> => {
      // Validate wallet state
      if (!canPay) {
        const err = 'Wallet not connected or signer not available';
        setError(err);
        throw new Error(err);
      }

      // Create intent
      const intent = createIntent(request);
      setActiveIntent(intent);
      setStatus('validating');
      setError(null);

      try {
        // Validate request
        const validation = await validate(request);
        if (!validation.valid) {
          const errors = formatValidationErrors(validation.errors);
          const err = errors.join('; ');
          setError(err);
          setStatus('error');
          throw new Error(err);
        }

        // Execute payment
        setStatus('executing');

        let result: PaymentResult;

        if (request.chainType === 'move') {
          // Check if native token or custom token
          if (request.tokenType === NASUN_COIN_TYPE) {
            result = await executeMoveNativePayment(request);
          } else {
            result = await executeMoveTokenPayment(request);
          }
        } else {
          // EVM payment
          result = await executeEVMPayment(request);
        }

        // Update state
        setLastResult(result);
        setStatus(result.success ? 'success' : 'error');

        // Record to address book if enabled
        if (options?.autoRecordRecipients && result.success) {
          recordTransaction(request.recipient);
        }

        // Update intent status
        setActiveIntent((prev) =>
          prev
            ? { ...prev, status: result.success ? 'completed' : 'failed' }
            : null
        );

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Payment failed';
        setError(message);
        setStatus('error');

        // Update intent status
        setActiveIntent((prev) =>
          prev ? { ...prev, status: 'failed' } : null
        );

        const failedResult: PaymentResult = {
          success: false,
          error: message,
          completedAt: Date.now(),
        };
        setLastResult(failedResult);

        throw err;
      }
    },
    [
      canPay,
      createIntent,
      validate,
      executeMoveNativePayment,
      executeMoveTokenPayment,
      executeEVMPayment,
      options?.autoRecordRecipients,
      recordTransaction,
    ]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setActiveIntent(null);
    setLastResult(null);
    setError(null);
  }, []);

  return {
    pay,
    validate,
    status,
    activeIntent,
    lastResult,
    error,
    reset,
    canPay,
    isGaslessAvailable,
  };
}

/**
 * Hook to check if payments are available
 *
 * @returns Whether the wallet can make payments
 */
export function useCanPay(): boolean {
  const { isConnected, signer } = useSigner();
  return isConnected && !!signer;
}
