/**
 * useTransactionExecutor Hook
 * Core transaction signing and execution logic
 * Handles both local wallet and zkLogin signing
 */

import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { getSuiClient } from '../../../lib/sui-client';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { formatErrorMessage, isOwnedObjectConflict } from '../utils/errorParser';
import type { TradeResult, SuiEvent } from '../types';

/**
 * Either a prebuilt transaction (run once) or a builder that produces a fresh
 * transaction on each call. Only a builder enables owned-object conflict retry,
 * since re-submitting prebuilt bytes would just hit the same stale references.
 */
export type TxInput = Transaction | (() => Transaction | Promise<Transaction>);

interface UseTransactionExecutorResult {
  isLoading: boolean;
  error: string | null;
  walletAddress: string | undefined;
  executeTransaction: (txInput: TxInput) => Promise<TradeResult>;
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

  const executeTransaction = useCallback(async (txInput: TxInput): Promise<TradeResult> => {
    if (!walletAddress) {
      return { success: false, error: 'Wallet not connected' };
    }

    // Only retrieve keypair for local wallet signing (not needed for zkLogin or passkey)
    const keypair = !isZkLoggedIn && !isPasskeyUnlocked ? getKeypair() : null;
    if (!isZkLoggedIn && !isPasskeyUnlocked && !keypair) {
      return { success: false, error: 'No signing method available' };
    }

    const client = getSuiClient();

    // Retryable: gas-coin race from RPC indexing lag (stale coin list).
    // Network/RPC errors fall through to user-facing parser intentionally.
    // Safe only when the caller has not invoked tx.setGasPayment() upstream.
    const RETRYABLE_GAS_RE = /No valid gas coins found|InsufficientGas/i;

    const buildBytes = async (tx: Transaction): Promise<Uint8Array> => {
      const delays = [500, 1500];
      let lastErr: unknown;
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
          return await tx.build({ client });
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt < delays.length && RETRYABLE_GAS_RE.test(msg)) {
            if (import.meta.env.DEV) {
              console.warn('[gas-retry] attempt=', attempt, 'msg=', msg);
            }
            await new Promise((r) => setTimeout(r, delays[attempt]));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    };

    // Owned-object conflicts (e.g. parallel Pado + GoStop tabs touching the same
    // gas coin) reject the losing tx without committing it, so a fresh rebuild is
    // safe. Retry is enabled ONLY for a builder input: a prebuilt Transaction
    // re-runs the same stale references, so re-submitting it would be pointless.
    // Timeouts are NOT retried (isOwnedObjectConflict excludes them) to avoid
    // double-spend on a tx that may have reached the fullnode.
    const isBuilder = typeof txInput === 'function';
    const buildTx = isBuilder ? txInput : () => txInput;
    const CONFLICT_RETRY_DELAYS = [500, 1200, 2500];
    const maxConflictRetries = isBuilder ? CONFLICT_RETRY_DELAYS.length : 0;

    try {
      setIsLoading(true);
      setError(null);

      for (let attempt = 0; attempt <= maxConflictRetries; attempt++) {
        try {
          const tx = await buildTx();
          tx.setSender(walletAddress);
          const bytes = await buildBytes(tx);

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
          }

          // A populated effects with a non-success status means the tx WAS
          // sequenced and charged gas on-chain. Never retry it: a rebuild would
          // double-execute. Owned-object conflicts are rejected pre-execution and
          // surface in the catch block below, never here.
          return { success: false, error: result.effects.status.error || 'Transaction failed' };
        } catch (err) {
          // Retry ONLY owned-object conflicts (validator-rejected, uncommitted) and
          // ONLY while a builder can hand us a freshly-built tx. isOwnedObjectConflict
          // excludes timeouts/network errors, so a tx that may have reached the
          // fullnode is never resubmitted (no double-spend).
          if (attempt < maxConflictRetries && isOwnedObjectConflict(err)) {
            await new Promise((r) => setTimeout(r, CONFLICT_RETRY_DELAYS[attempt]));
            continue;
          }
          console.error('[executeTransaction] Error:', err);
          return { success: false, error: formatErrorMessage(err) };
        }
      }

      // Unreachable: the final attempt always returns from the try/catch above.
      // Present only to satisfy control-flow analysis.
      return { success: false, error: 'Transaction failed. Please try again.' };
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
