/**
 * Prediction Market Admin Hook
 * For market resolution and creation (Admin only)
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useWallet } from '@nasun/wallet';
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
  const [isLoading, setIsLoading] = useState(false);

  // Check if current user is the resolver
  const isResolver = account?.address === RESOLVER_ADDRESS;

  /**
   * Sign and execute a transaction
   */
  const signAndExecute = useCallback(async (tx: Transaction) => {
    const keypair = getKeypair();
    if (!keypair) {
      throw new Error('Keypair not available');
    }

    const client = getSuiClient();
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error(result.effects?.status?.error || 'Transaction failed');
    }

    return result;
  }, [getKeypair]);

  /**
   * Resolve market with outcome
   */
  const resolveMarket = useCallback(
    async (marketId: string, outcome: boolean): Promise<AdminResult> => {
      if (status !== 'unlocked' || !account) {
        return { success: false, error: 'Please unlock your wallet' };
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
    [status, account, isResolver, signAndExecute]
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
      if (status !== 'unlocked' || !account) {
        return { success: false, error: 'Please unlock your wallet' };
      }

      const client = getSuiClient();

      // Check if user has AdminCap
      try {
        const adminCapObjects = await client.getOwnedObjects({
          owner: account.address,
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
          resolver || account.address
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
    [status, account, signAndExecute]
  );

  return {
    isLoading,
    isResolver,
    resolveMarket,
    createMarket,
  };
}
