/**
 * useBudgets - Hook for Budget CRUD operations
 *
 * Provides on-chain budget management: create, deposit, withdraw, deactivate.
 * Uses the same signing pattern as useCreateRequest.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSigner } from '@nasun/wallet';
import { useIsConnected } from '@/hooks/useWalletSession';
import { suiClient } from '@/config/client';
import { useBudgetStore, type BudgetInfo } from '@/stores/budgetStore';
import { getNusdcCoins } from '@/features/request/services/coinService';
import {
  buildCreateBudgetTransaction,
  buildDepositToBudgetTransaction,
  buildWithdrawFromBudgetTransaction,
  buildDeactivateBudgetTransaction,
  type BuildCreateBudgetParams,
} from '@/features/request/services/transactionBuilder';

export type BudgetTxStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';

interface UseBudgetsReturn {
  budgets: BudgetInfo[];
  isLoading: boolean;
  error: string | null;
  txStatus: BudgetTxStatus;
  txError: string | null;
  selectedBudgetId: string | null;
  setSelectedBudget: (id: string | null) => void;
  refresh: () => Promise<void>;
  createBudget: (params: {
    agent: string;
    deposit: number;
    maxPerRequest?: number;
    allowedModels?: string[];
    expiresAt?: number;
  }) => Promise<string | null>;
  depositToBudget: (budgetId: string, amount: number) => Promise<boolean>;
  withdrawFromBudget: (budgetId: string, amount: number) => Promise<boolean>;
  deactivateBudget: (budgetId: string) => Promise<boolean>;
  resetTxStatus: () => void;
}

export function useBudgets(): UseBudgetsReturn {
  const { signer, address } = useSigner();
  const isConnected = useIsConnected();

  const {
    budgets,
    isLoading,
    error,
    selectedBudgetId,
    fetchBudgets,
    setSelectedBudget,
    refreshBudget,
  } = useBudgetStore();

  const [txStatus, setTxStatus] = useState<BudgetTxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const txInFlight = useRef(false);

  // Fetch budgets on wallet connection
  useEffect(() => {
    if (isConnected && address) {
      fetchBudgets(suiClient, address);
    }
  }, [isConnected, address, fetchBudgets]);

  const refresh = useCallback(async () => {
    if (!address) return;
    await fetchBudgets(suiClient, address);
  }, [address, fetchBudgets]);

  const signAndExecute = useCallback(
    async (tx: ReturnType<typeof buildCreateBudgetTransaction>): Promise<string | null> => {
      if (txInFlight.current) return null;
      if (!signer || !address) {
        setTxError('Wallet not connected');
        setTxStatus('error');
        return null;
      }

      txInFlight.current = true;
      setTxStatus('signing');
      setTxError(null);

      try {
        tx.setSender(address);
        const txBytes = await tx.build({ client: suiClient });
        const { signature } = await signer.sign(txBytes);

        setTxStatus('executing');
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: txBytes,
          signature,
          options: { showEffects: true, showEvents: true },
        });

        if (result.effects?.status?.status !== 'success') {
          throw new Error(result.effects?.status?.error || 'Transaction failed');
        }

        setTxStatus('success');
        return result.digest;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Transaction failed';
        setTxError(msg);
        setTxStatus('error');
        return null;
      } finally {
        txInFlight.current = false;
      }
    },
    [signer, address]
  );

  const createBudget = useCallback(
    async (params: {
      agent: string;
      deposit: number;
      maxPerRequest?: number;
      allowedModels?: string[];
      expiresAt?: number;
    }): Promise<string | null> => {
      if (!address) return null;

      try {
        const coins = await getNusdcCoins(suiClient, address, params.deposit);
        const txParams: BuildCreateBudgetParams = {
          coins,
          deposit: params.deposit,
          agent: params.agent,
          maxPerRequest: params.maxPerRequest || 0,
          allowedModels: params.allowedModels || [],
          allowedExecutors: [],
          expiresAt: params.expiresAt || 0,
        };
        const tx = buildCreateBudgetTransaction(txParams);
        const digest = await signAndExecute(tx);

        if (digest) {
          // Wait for indexer to process the new BudgetReceipt before refreshing
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refresh();
        }
        return digest;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create budget';
        setTxError(msg);
        setTxStatus('error');
        return null;
      }
    },
    [address, signAndExecute, refresh]
  );

  const depositToBudget = useCallback(
    async (budgetId: string, amount: number): Promise<boolean> => {
      if (!address) return false;
      try {
        const coins = await getNusdcCoins(suiClient, address, amount);
        const tx = buildDepositToBudgetTransaction(budgetId, coins, amount);
        const digest = await signAndExecute(tx);
        if (digest) {
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refreshBudget(suiClient, budgetId);
        }
        return !!digest;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to deposit';
        setTxError(msg);
        setTxStatus('error');
        return false;
      }
    },
    [address, signAndExecute, refreshBudget]
  );

  const withdrawFromBudget = useCallback(
    async (budgetId: string, amount: number): Promise<boolean> => {
      if (!address) return false;
      try {
        const tx = buildWithdrawFromBudgetTransaction(budgetId, amount);
        const digest = await signAndExecute(tx);
        if (digest) {
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refreshBudget(suiClient, budgetId);
        }
        return !!digest;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to withdraw';
        setTxError(msg);
        setTxStatus('error');
        return false;
      }
    },
    [address, signAndExecute, refreshBudget]
  );

  const deactivateBudget = useCallback(
    async (budgetId: string): Promise<boolean> => {
      if (!address) return false;
      try {
        const tx = buildDeactivateBudgetTransaction(budgetId);
        const digest = await signAndExecute(tx);
        if (digest) {
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refresh();
        }
        return !!digest;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to deactivate';
        setTxError(msg);
        setTxStatus('error');
        return false;
      }
    },
    [address, signAndExecute, refresh]
  );

  const resetTxStatus = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
  }, []);

  return {
    budgets,
    isLoading,
    error,
    txStatus,
    txError,
    selectedBudgetId,
    setSelectedBudget,
    refresh,
    createBudget,
    depositToBudget,
    withdrawFromBudget,
    deactivateBudget,
    resetTxStatus,
  };
}
