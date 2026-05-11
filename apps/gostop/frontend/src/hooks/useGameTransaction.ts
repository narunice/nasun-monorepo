import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import type { SuiTransactionBlockResponseOptions } from '@mysten/sui/client';
import { useSignAndExecute } from './useSignAndExecute';
import { getSuiClient } from '../lib/sui-client';
import { withStaleObjectRetry } from '../lib/sui-retry';
import { useToastStore } from '../store/useToastStore';
import { useBalanceStore } from '../store/useBalanceStore';
import { useBalanceSync } from './useBalanceSync';
import { GAME_ERRORS } from '../lib/constants/errors';
import { NUSDC_UNIT_NUMBER } from '../lib/constants/assets';
import { findNusdcCoins, type FoundCoins } from '../features/shared/coin-utils';
import type { ValidationResult } from '../lib/validation/game-rules';
import { ensureGostopPass, isGateEnabled } from '../lib/turnstile-gate';

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
  const { walletAddress: address, signAndExecute: signAndExecuteTransaction } = useSignAndExecute();
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

      // 0. Bot-prevention gate. ensureGostopPass() resolves true silently if
      // a fresh Turnstile-issued pass is in localStorage, otherwise it
      // refreshes the App-root widget and waits for it to complete. When the
      // gate is disabled (no VITE_TURNSTILE_SITE_KEY set), it resolves true
      // immediately. Fail-open on unexpected errors so a buggy gate can't
      // lock every user out of every game.
      if (isGateEnabled()) {
        try {
          const passOk = await ensureGostopPass();
          if (!passOk) {
            showToast('Verifying you are human... please retry in a moment.', 'warning');
            return false;
          }
        } catch (err) {
          console.warn('[GameTransaction] gate check failed, failing open:', err);
        }
      }

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

          const execOpts = options.executionOptions as { showEffects?: boolean; showEvents?: boolean; showObjectChanges?: boolean } | undefined;
          const result = await signAndExecuteTransaction(tx, {
            showEffects: execOpts?.showEffects ?? true,
            showEvents: execOpts?.showEvents ?? true,
            showObjectChanges: execOpts?.showObjectChanges ?? false,
          });

          if (!result) throw new Error(GAME_ERRORS.TX_FAILED);

          // Wait for checkpoint if requested (30s timeout to avoid infinite hang on devnet lag)
          if (options.awaitFullnode !== false) {
            await client.waitForTransaction({ digest: result.digest, timeout: 30_000 });
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
        
        // Devnet is a prototype network and occasionally reboots / lags. Map
        // every common transient failure to a calm, actionable message so
        // users don't see raw RPC dumps. Keep messages short and consistent.
        const RETRY_HINT = "Devnet hiccup. Give it a moment and try again.";
        let userMessage: string;
        if (message.includes('MoveAbort')) {
          userMessage = 'Transaction rejected by smart contract.';
        } else if (/is not available for consumption|ObjectVersionUnavailable|current version:|ObjectNotFound|InputObjectDeleted|ObjectDeleted/i.test(message)) {
          userMessage = RETRY_HINT;
        } else if (message.includes('GasBalanceTooLow') || /Balance of gas object.*lower than the needed amount/i.test(message)) {
          userMessage = 'Not enough NASUN for gas. Please top up your wallet and try again.';
        } else if (
          /(?:status code|HTTP)\s*:?\s*(?:0|5\d\d)/i.test(message) ||
          /Service (?:Temporarily )?Unavailable|Bad Gateway|Gateway Timeout/i.test(message) ||
          /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN/i.test(message) ||
          /fetch failed|socket hang up|network ?error|timed? ?out/i.test(message) ||
          /TypeError:\s*Failed to fetch|Load failed|NetworkError/i.test(message) ||
          /Transaction is rejected as invalid by more than 1\/3 of validators/i.test(message)
        ) {
          userMessage = RETRY_HINT;
        } else if (/Rejected from user|User rejected|denied by user|Request rejected/i.test(message)) {
          userMessage = 'Transaction cancelled.';
        } else {
          // Last-resort: still avoid leaking long RPC payloads. Take the
          // first line, trim hex blobs, cap length.
          const firstLine = message.split('\n')[0].replace(/0x[0-9a-fA-F]{16,}/g, '0x…').trim();
          userMessage = firstLine.length > 140 ? firstLine.slice(0, 137) + '…' : firstLine;
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
