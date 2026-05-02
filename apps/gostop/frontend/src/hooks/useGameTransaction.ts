import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiTransactionBlockResponseOptions } from '@mysten/sui/client';
import { useWallet } from '@nasun/wallet';
import { getSuiClient } from '../lib/sui-client';
import { withStaleObjectRetry } from '../lib/sui-retry';
import { useToastStore } from '../store/useToastStore';
import { useBalanceStore } from '../store/useBalanceStore';
import { useBalanceSync } from './useBalanceSync';
import { GAME_ERRORS } from '../lib/constants/errors';
import { NUSDC_UNIT_NUMBER } from '../lib/constants/assets';
import { findNusdcCoins, type FoundCoins } from '../features/shared/coin-utils';
import type { ValidationResult } from '../lib/validation/game-rules';

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
  /** Whether to optimistically deduct the amount from balance store. */
  optimistic?: boolean;
  /** Custom validation logic to run before transaction building */
  validate?: () => ValidationResult;
  /** If true, transaction expires at the end of the current epoch (~24h max). */
  expireThisEpoch?: boolean;
}

/**
 * useGameTransaction - Central engine for executing game transactions.
 * Handles coin management, retries, and notifications.
 */
export function useGameTransaction() {
  const { address, signAndExecuteTransaction } = useWallet();
  const showToast = useToastStore((s) => s.showToast);
  const { addPendingBet, removePendingBet } = useBalanceStore();
  const [isPending, setIsPending] = useState(false);
  const { refetch: refreshBalance } = useBalanceSync();

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

      // 1. Run Pre-validation
      if (options.validate) {
        const result = options.validate();
        if (!result.isValid) {
          const msg = result.message || 'Invalid transaction parameters';
          showToast(msg, 'error');
          options.onError?.(new Error(msg));
          return false;
        }
      }

      const client = getSuiClient();
      setIsPending(true);

      // Optimistic Update
      const isOptimistic = options.optimistic !== false && options.amount !== undefined;
      if (isOptimistic) {
        addPendingBet(options.amount!);
      }

      try {
        const finalResult = await withStaleObjectRetry(async () => {
          let foundCoins: FoundCoins | null = null;

          if (!options.skipBalanceCheck && options.amount !== undefined) {
            foundCoins = await findNusdcCoins(client, address, options.amount);
            if (!foundCoins) {
              const req = (Number(options.amount) / NUSDC_UNIT_NUMBER).toFixed(2);
              throw new Error(GAME_ERRORS.INSUFFICIENT_BALANCE(req));
            }
          }

          const tx = await txBuilder(foundCoins);
          
          // Ensure sender is set
          tx.setSender(address);

          if (options.expireThisEpoch) {
            const summary = await client.getLatestSuiSystemState();
            tx.setExpiration({ Epoch: Number(summary.epoch) + 1 });
          }

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
        refreshBalance(); // Update balance immediately after successful TX
        if (options.successMessage) {
          showToast(options.successMessage, 'success');
        }
        options.onSuccess?.(finalResult);
        return true;
      } catch (err: any) {
        console.error('[GameTransaction] Error:', err);
        const message = err?.message || GAME_ERRORS.TX_FAILED;
        
        let userMessage: string;
        if (message.includes('MoveAbort')) {
          userMessage = 'Transaction rejected by smart contract.';
        } else if (message.includes('GasBalanceTooLow')) {
          userMessage = 'Insufficient SUI for gas fees.';
        } else {
          userMessage = message;
        }

        showToast(userMessage, 'error');
        options.onError?.(err instanceof Error ? err : new Error(message));
        return false;
      } finally {
        if (isOptimistic) {
          removePendingBet(options.amount!);
        }
        setIsPending(false);
      }
    },
    [address, isPending, signAndExecuteTransaction, showToast, addPendingBet, removePendingBet, refreshBalance]
  );

  return { executeGameTx, isPending };
}
