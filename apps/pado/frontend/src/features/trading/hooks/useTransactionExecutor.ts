/**
 * useTransactionExecutor Hook
 * Core transaction signing and execution logic
 * Handles both local wallet and zkLogin signing
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { formatErrorMessage } from '../utils/errorParser';
import type { TradeResult, SuiEvent } from '../types';

interface UseTransactionExecutorResult {
  isLoading: boolean;
  error: string | null;
  walletAddress: string | undefined;
  executeTransaction: (tx: Transaction) => Promise<TradeResult>;
}

export function useTransactionExecutor(): UseTransactionExecutorResult {
  const { account, getKeypair, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState, signTransaction: zkSignTransaction } = useZkLogin();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const isLocalWalletActive = status === 'unlocked' && account?.address;
  const walletAddress = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeTransaction = useCallback(async (tx: Transaction): Promise<TradeResult> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Only retrieve keypair for local wallet signing (not needed for zkLogin or passkey)
    const keypair = !isZkLoggedIn && !isPasskeyUnlocked ? getKeypair() : null;
    if (!isZkLoggedIn && !isPasskeyUnlocked && !keypair) {
      return { success: false, error: 'No signing method available' };
    }

    const client = getSuiClient();

    const attemptBuild = async (): Promise<Uint8Array> => {
      try {
        return await tx.build({ client });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // RPC lag: previous tx effects not yet indexed — retry once after brief delay
        if (/No valid gas coins found|InsufficientGas/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 2000));
          return tx.build({ client });
        }
        throw err;
      }
    };

    try {
      setIsLoading(true);
      setError(null);

      tx.setSender(walletAddress);
      const bytes = await attemptBuild();

      // Sign with appropriate method (priority: zkLogin > local > passkey)
      let signature: string;
      if (isZkLoggedIn && zkState) {
        signature = await zkSignTransaction(bytes);
      } else if (keypair) {
        const signResult = await keypair.signTransaction(bytes);
        signature = signResult.signature;
      } else if (isPasskeyUnlocked && passkeyKeypair) {
        const signResult = await passkeyKeypair.signTransaction(bytes);
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

      if (!result.effects) {
        return { success: false, error: 'Transaction submitted but status unknown. Check explorer.' };
      }

      if (result.effects.status.status === 'success') {
        // Block until fullnode has applied effects, so any subsequent tx in the
        // same flow sees fresh owned-object versions (avoids LockConflict races).
        await client.waitForTransaction({ digest: result.digest });
        return {
          success: true,
          digest: result.digest,
          objectChanges: result.objectChanges ?? undefined,
          events: (result.events ?? undefined) as SuiEvent[] | undefined,
        };
      } else {
        return {
          success: false,
          error: result.effects.status.error || 'Transaction failed',
        };
      }
    } catch (err) {
      console.error('[executeTransaction] Error:', err);
      const message = formatErrorMessage(err);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, getKeypair, isZkLoggedIn, zkState, zkSignTransaction, isPasskeyUnlocked, passkeyKeypair]);

  return {
    isLoading,
    error,
    walletAddress,
    executeTransaction,
  };
}
