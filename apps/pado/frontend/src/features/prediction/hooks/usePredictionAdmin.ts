/**
 * Prediction Market Admin Hook
 * For market resolution and creation (Admin only)
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { buildResolveMarket, buildCreateMarket } from '../transactions';
import { PREDICTION_ADMIN_CAP } from '../constants';

interface AdminResult {
  success: boolean;
  digest?: string;
  error?: string;
}

// Resolver address from environment variable (security: avoid hardcoding)
const RESOLVER_ADDRESS = import.meta.env.VITE_PREDICTION_RESOLVER_ADDRESS;

// Warn if resolver address is not configured
if (!RESOLVER_ADDRESS) {
  console.warn('[Security] VITE_PREDICTION_RESOLVER_ADDRESS not configured');
}

function parseAdminError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Check for common errors
  if (message.includes('ENotResolver') || (message.includes('MoveAbort') && message.includes(', 3)'))) {
    return 'Only the designated resolver can resolve this market';
  }
  if (message.includes('EMarketNotClosed') || (message.includes('MoveAbort') && message.includes(', 1)'))) {
    return 'Market has not reached close time yet';
  }
  if (message.includes('EMarketAlreadyResolved') || (message.includes('MoveAbort') && message.includes(', 2)'))) {
    return 'Market has already been resolved';
  }
  if (message.includes('InsufficientGas')) {
    return 'Not enough NASUN for transaction fees';
  }

  // Return original message for unknown errors (truncated)
  if (message.length > 100) {
    return 'Transaction failed. Please try again.';
  }
  return message;
}

export function usePredictionAdmin() {
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const [isLoading, setIsLoading] = useState(false);

  // Determine active wallet (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn ? zkState?.address : (isLocalWalletActive ? account?.address : undefined);
  const isWalletConnected = isZkLoggedIn || isLocalWalletActive;

  // Check if current user is the resolver
  const isResolver = walletAddress === RESOLVER_ADDRESS;

  /**
   * Sign and execute a transaction (supports both local wallet and zkLogin)
   */
  const signAndExecute = useCallback(async (tx: Transaction) => {
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

    return result;
  }, [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction]);

  /**
   * Resolve market with outcome
   */
  const resolveMarket = useCallback(
    async (marketId: string, outcome: boolean): Promise<AdminResult> => {
      if (!isWalletConnected) {
        return { success: false, error: 'Please connect your wallet' };
      }

      if (!isResolver) {
        return { success: false, error: 'Only the designated resolver can resolve markets' };
      }

      setIsLoading(true);

      try {
        const tx = buildResolveMarket(marketId, outcome);
        const result = await signAndExecute(tx);

        return {
          success: true,
          digest: result.digest,
        };
      } catch (error) {
        return {
          success: false,
          error: parseAdminError(error),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, isResolver, signAndExecute]
  );

  /**
   * Create new market
   */
  const createMarket = useCallback(
    async (
      question: string,
      description: string,
      category: string,
      closeTime: Date,
      resolveDeadline: Date,
      resolver?: string
    ): Promise<AdminResult> => {
      if (!isWalletConnected || !walletAddress) {
        return { success: false, error: 'Please connect your wallet' };
      }

      const client = getSuiClient();

      // Check if user has AdminCap
      try {
        const adminCapObjects = await client.getOwnedObjects({
          owner: walletAddress,
          filter: {
            StructType: `${PREDICTION_ADMIN_CAP}`,
          },
        });

        if (adminCapObjects.data.length === 0) {
          return { success: false, error: 'You do not have admin privileges' };
        }

        setIsLoading(true);

        const tx = buildCreateMarket(
          PREDICTION_ADMIN_CAP,
          question,
          description,
          category,
          BigInt(closeTime.getTime()),
          BigInt(resolveDeadline.getTime()),
          resolver || walletAddress
        );

        const result = await signAndExecute(tx);

        return {
          success: true,
          digest: result.digest,
        };
      } catch (error) {
        return {
          success: false,
          error: parseAdminError(error),
        };
      } finally {
        setIsLoading(false);
      }
    },
    [isWalletConnected, walletAddress, signAndExecute]
  );

  return {
    isLoading,
    isResolver,
    resolveMarket,
    createMarket,
  };
}
