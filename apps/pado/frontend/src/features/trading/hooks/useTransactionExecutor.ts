/**
 * useTransactionExecutor Hook
 * Core transaction signing and execution logic
 * Handles both local wallet and zkLogin signing
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { formatErrorMessage } from '../utils/errorParser';
import type { TradeResult } from '../types';

interface UseTransactionExecutorResult {
  isLoading: boolean;
  error: string | null;
  walletAddress: string | undefined;
  executeTransaction: (tx: Transaction) => Promise<TradeResult>;
}

export function useTransactionExecutor(): UseTransactionExecutorResult {
  const { account, getKeypair, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();

  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn ? zkState?.address : (isLocalWalletActive ? account?.address : undefined);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeTransaction = useCallback(async (tx: Transaction): Promise<TradeResult> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Only retrieve keypair for local wallet signing (not needed for zkLogin)
    const keypair = !isZkLoggedIn ? getKeypair() : null;
    if (!isZkLoggedIn && !keypair) {
      return { success: false, error: 'No signing method available' };
    }

    const client = getSuiClient();

    try {
      setIsLoading(true);
      setError(null);

      tx.setSender(walletAddress);
      const bytes = await tx.build({ client });

      // Sign with appropriate method
      let signature: string;
      if (isZkLoggedIn && zkState) {
        signature = await zkSignTransaction(bytes);
      } else if (keypair) {
        const signResult = await keypair.signTransaction(bytes);
        signature = signResult.signature;
      } else {
        return { success: false, error: 'No signing method available' };
      }

      const result = await client.executeTransactionBlock({
        transactionBlock: bytes,
        signature: signature,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      if (result.effects?.status.status === 'success') {
        return {
          success: true,
          digest: result.digest,
          objectChanges: result.objectChanges ?? undefined,
          events: result.events ?? undefined,
        };
      } else {
        return {
          success: false,
          error: result.effects?.status.error || 'Transaction failed',
        };
      }
    } catch (err) {
      console.error('[executeTransaction] Error:', err);
      const message = formatErrorMessage(err);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction]);

  return {
    isLoading,
    error,
    walletAddress,
    executeTransaction,
  };
}
