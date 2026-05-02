import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiTransactionBlockResponseOptions } from '@mysten/sui/client';
import { useWallet } from '@nasun/wallet';
import { getSuiClient } from '../lib/sui-client';
import { withStaleObjectRetry } from '../lib/sui-retry';
import { useToastStore } from '../store/useToastStore';
import { GAME_ERRORS } from '../lib/constants/errors';
import { NUSDC_UNIT_NUMBER } from '../lib/constants/assets';
import { findNusdcCoins, type FoundCoins } from '../features/shared/coin-utils';

export interface GameTxOptions {
  amount?: bigint;
  successMessage?: string;
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  skipBalanceCheck?: boolean;
  /** Sui execution options */
  executionOptions?: SuiTransactionBlockResponseOptions;
  /** Whether to wait for fullnode checkpoint. Default: true. */
  awaitFullnode?: boolean;
}

/**
 * useGameTransaction - Central engine for executing game transactions.
 * Handles coin management, retries, and notifications.
 */
export function useGameTransaction() {
  const { address, signAndExecuteTransaction } = useWallet();
  const showToast = useToastStore((s) => s.showToast);
  const [isPending, setIsPending] = useState(false);

  const executeGameTx = useCallback(
    async (
      txBuilder: (coins: FoundCoins | null) => Promise<Transaction> | Transaction,
      options: GameTxOptions = {}
    ) => {
      if (!address) {
        showToast(GAME_ERRORS.WALLET_NOT_CONNECTED, 'warning');
        return false;
      }

      if (isPending) return false;

      const client = getSuiClient();
      setIsPending(true);

      try {
        const finalResult = await withStaleObjectRetry(async () => {
          let foundCoins: FoundCoins | null = null;

          if (!options.skipBalanceCheck && options.amount !== undefined) {
            foundCoins = await findNusdcCoins(client, address, options.amount);
            if (!foundCoins) {
              const req = (options.amount / BigInt(NUSDC_UNIT_NUMBER)).toString();
              throw new Error(GAME_ERRORS.INSUFFICIENT_BALANCE(req));
            }
          }

          const tx = await txBuilder(foundCoins);
          
          // Ensure sender is set
          tx.setSender(address);

          const result = await signAndExecuteTransaction({
            transaction: tx,
            options: options.executionOptions || {
              showEffects: true,
              showEvents: true,
            },
          });

          if (!result) throw new Error(GAME_ERRORS.TX_FAILED);

          // Wait for checkpoint if requested
          if (options.awaitFullnode !== false) {
            await client.waitForTransaction({ digest: result.digest });
          }
          
          return result;
        });

        // Success (outside retry loop to only trigger once)
        if (options.successMessage) {
          showToast(options.successMessage, 'success');
        }
        options.onSuccess?.(finalResult);
        return true;
      } catch (err: any) {
        console.error('[GameTransaction] Error:', err);
        const message = err?.message || GAME_ERRORS.TX_FAILED;
        showToast(message, 'error');
        options.onError?.(err instanceof Error ? err : new Error(message));
        return false;
      } finally {
        setIsPending(false);
      }
    },
    [address, isPending, signAndExecuteTransaction, showToast]
  );

  return { executeGameTx, isPending };
}
