/**
 * usePaymentIntent Hook
 *
 * Intent creation and parsing for payment requests.
 * Bridges between URL params, WalletConnect requests, and internal format.
 */

import { useCallback, useMemo } from 'react';
import { useChain } from './useChain';
import {
  generateIntentId,
  parsePaymentLink,
  intentToUrlParams,
  intentToRequest,
  parsedLinkToIntent,
  DEFAULT_INTENT_TTL_MS,
  DEFAULT_TOKEN_SYMBOL,
  NASUN_COIN_TYPE,
} from '../core/payment';
import type {
  PaymentIntent,
  PaymentRequest,
  PaymentChainType,
} from '../core/payment/types';

// ============================================
// Types
// ============================================

/** WalletConnect request (simplified for payment parsing) */
export interface PaymentWCRequest {
  method: string;
  params?: unknown[];
  chainId?: string;
}

/**
 * Result of usePaymentIntent hook
 */
export interface UsePaymentIntentResult {
  /** Create a payment intent from request */
  createIntent: (request: PaymentRequest) => PaymentIntent;
  /** Parse intent from URL search params */
  parseFromUrl: (url: string) => PaymentIntent | null;
  /** Parse intent from WalletConnect request */
  parseFromWCRequest: (request: PaymentWCRequest) => PaymentIntent | null;
  /** Convert intent to payment request for execution */
  toRequest: (intent: PaymentIntent) => PaymentRequest;
  /** Serialize intent to URL params */
  toUrlParams: (intent: PaymentIntent) => URLSearchParams;
  /** Check if intent is expired */
  isExpired: (intent: PaymentIntent) => boolean;
  /** Current chain context */
  currentChainId: string;
  /** Current chain type */
  currentChainType: PaymentChainType;
}

// ============================================
// Hook Implementation
// ============================================

/**
 * Hook for managing payment intents
 *
 * @example
 * ```tsx
 * const { createIntent, parseFromUrl, toRequest } = usePaymentIntent();
 *
 * // Create from form data
 * const intent = createIntent({
 *   chainType: 'move',
 *   recipient: '0x...',
 *   amount: '10',
 *   tokenType: '0x2::sui::SUI',
 * });
 *
 * // Parse from URL
 * const urlIntent = parseFromUrl('https://pado.nasun.io/send?to=0x...&amount=10');
 * if (urlIntent) {
 *   const request = toRequest(urlIntent);
 *   // Execute payment
 * }
 * ```
 */
export function usePaymentIntent(): UsePaymentIntentResult {
  const { chainId, isEVM } = useChain();

  const currentChainType = useMemo<PaymentChainType>(
    () => (isEVM ? 'evm' : 'move'),
    [isEVM]
  );

  /**
   * Create a payment intent from a payment request
   */
  const createIntent = useCallback(
    (request: PaymentRequest): PaymentIntent => {
      const id = generateIntentId();
      const now = Date.now();

      if (request.chainType === 'move') {
        return {
          id,
          version: 1,
          chainType: 'move',
          chainId: chainId,
          recipient: request.recipient,
          amount: request.amount,
          token: getTokenSymbolFromType(request.tokenType),
          tokenType: request.tokenType,
          message: request.message,
          createdAt: now,
          expiresAt: now + DEFAULT_INTENT_TTL_MS,
          status: 'pending',
        };
      }

      // EVM request
      return {
        id,
        version: 1,
        chainType: 'evm',
        chainId: request.chainId.toString(),
        recipient: request.recipient,
        amount: request.amount,
        token: request.tokenAddress ? 'TOKEN' : getEVMNativeToken(request.chainId),
        tokenType: request.tokenAddress,
        message: request.message,
        createdAt: now,
        expiresAt: now + DEFAULT_INTENT_TTL_MS,
        status: 'pending',
      };
    },
    [chainId]
  );

  /**
   * Parse payment intent from URL
   */
  const parseFromUrl = useCallback(
    (url: string): PaymentIntent | null => {
      const parsed = parsePaymentLink(url);
      if (!parsed.valid) {
        return null;
      }
      return parsedLinkToIntent(parsed, currentChainType);
    },
    [currentChainType]
  );

  /**
   * Parse payment intent from WalletConnect request
   * Supports eth_sendTransaction and sui_signAndExecuteTransaction
   */
  const parseFromWCRequest = useCallback(
    (request: PaymentWCRequest): PaymentIntent | null => {
      try {
        const id = generateIntentId();
        const now = Date.now();

        // Parse EVM eth_sendTransaction
        if (request.method === 'eth_sendTransaction' && request.params?.[0]) {
          const txParams = request.params[0] as {
            to?: string;
            value?: string;
            data?: string;
          };

          if (!txParams.to) {
            return null;
          }

          // Parse chain ID from WC request (eip155:1 format)
          const evmChainId = request.chainId
            ? parseInt(request.chainId.split(':')[1] || '1', 10)
            : 1;

          // Convert value from hex to decimal
          const value = txParams.value
            ? (BigInt(txParams.value) / BigInt(10 ** 18)).toString()
            : '0';

          return {
            id,
            version: 1,
            chainType: 'evm',
            chainId: evmChainId.toString(),
            recipient: txParams.to,
            amount: value,
            token: getEVMNativeToken(evmChainId),
            message: undefined,
            createdAt: now,
            expiresAt: now + DEFAULT_INTENT_TTL_MS,
            status: 'pending',
            metadata: {
              custom: { data: txParams.data },
            },
          };
        }

        // Parse Sui sui_signAndExecuteTransaction (simplified)
        if (
          request.method === 'sui_signAndExecuteTransaction' ||
          request.method === 'sui_signTransaction'
        ) {
          // Sui transactions are more complex; return a basic intent
          // Full parsing would require deserializing the transaction
          return {
            id,
            version: 1,
            chainType: 'move',
            chainId: chainId,
            recipient: '',
            amount: '0',
            token: DEFAULT_TOKEN_SYMBOL,
            message: undefined,
            createdAt: now,
            expiresAt: now + DEFAULT_INTENT_TTL_MS,
            status: 'pending',
            metadata: {
              custom: { transaction: request.params?.[0] },
            },
          };
        }

        return null;
      } catch {
        return null;
      }
    },
    [chainId]
  );

  /**
   * Convert intent to payment request
   */
  const toRequest = useCallback(
    (intent: PaymentIntent): PaymentRequest => {
      return intentToRequest(intent);
    },
    []
  );

  /**
   * Convert intent to URL params
   */
  const toUrlParams = useCallback(
    (intent: PaymentIntent): URLSearchParams => {
      return intentToUrlParams(intent);
    },
    []
  );

  /**
   * Check if intent is expired
   */
  const isExpired = useCallback((intent: PaymentIntent): boolean => {
    if (!intent.expiresAt) {
      return false;
    }
    return Date.now() > intent.expiresAt;
  }, []);

  return {
    createIntent,
    parseFromUrl,
    parseFromWCRequest,
    toRequest,
    toUrlParams,
    isExpired,
    currentChainId: chainId,
    currentChainType,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get token symbol from Move coin type
 */
function getTokenSymbolFromType(tokenType: string): string {
  if (tokenType === NASUN_COIN_TYPE) {
    return 'NASUN';
  }

  // Extract symbol from coin type (e.g., "0x...::nbtc::NBTC" -> "NBTC")
  const parts = tokenType.split('::');
  if (parts.length >= 3) {
    return parts[parts.length - 1].toUpperCase();
  }

  return 'TOKEN';
}

/**
 * Get native token symbol for EVM chain
 */
function getEVMNativeToken(chainId: number): string {
  switch (chainId) {
    case 1:
    case 11155111: // Sepolia
    case 17000: // Holesky
      return 'ETH';
    case 137:
    case 80002: // Amoy
      return 'MATIC';
    case 42161:
    case 421614: // Arbitrum Sepolia
      return 'ETH';
    case 10:
    case 11155420: // OP Sepolia
      return 'ETH';
    case 8453:
    case 84532: // Base Sepolia
      return 'ETH';
    case 59144:
    case 59141: // Linea Sepolia
      return 'ETH';
    default:
      return 'ETH';
  }
}
