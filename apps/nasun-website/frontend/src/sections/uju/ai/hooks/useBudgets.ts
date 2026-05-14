/**
 * useBudgets — full Budget CRUD + query. Replaces the lightweight
 * useAgentBudgets shape from S3 (which is now a thin alias re-export).
 *
 * Provides:
 *   - TanStack Query fetch of owned Budgets via BudgetReceipt
 *   - Mutations: createBudget / depositToBudget / withdrawFromBudget /
 *     deactivateBudget / updateConstraints / setSpendingLimits / setCategories
 */

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@nasun/wallet';
import { BARAM } from '@nasun/devnet-config';
import { suiClient } from '@/lib/sui-client';
import { getNusdcCoins } from '../services/coinService';
import {
  buildCreateBudgetTransaction,
  buildDepositToBudgetTransaction,
  buildWithdrawFromBudgetTransaction,
  buildDeactivateBudgetTransaction,
  buildUpdateConstraintsTransaction,
  buildSetSpendingLimitsTransaction,
  buildSetCategoriesTransaction,
  type BuildCreateBudgetParams,
} from '../services/transactionBuilder';

export interface BudgetInfo {
  id: string;
  owner: string;
  agent: string;
  balance: number;
  totalDeposited: number;
  totalSpent: number;
  maxPerRequest: number;
  allowedModels: string[];
  allowedExecutors: string[];
  createdAt: number;
  expiresAt: number;
  requestCount: number;
  isActive: boolean;
}

export type BudgetTxStatus = 'idle' | 'signing' | 'executing' | 'success' | 'error';

function parseBudgetFields(fields: Record<string, unknown>, fallbackId: string): BudgetInfo {
  const rawBalance = fields.balance;
  const balanceValue =
    typeof rawBalance === 'object' && rawBalance !== null
      ? Number((rawBalance as Record<string, string>).value ?? 0)
      : Number(rawBalance ?? 0);

  return {
    id: ((fields.id as Record<string, string>)?.id) ?? fallbackId,
    owner: String(fields.owner ?? ''),
    agent: String(fields.agent ?? ''),
    balance: balanceValue,
    totalDeposited: Number(fields.total_deposited ?? 0),
    totalSpent: Number(fields.total_spent ?? 0),
    maxPerRequest: Number(fields.max_per_request ?? 0),
    allowedModels: Array.isArray(fields.allowed_models) ? fields.allowed_models.map(String) : [],
    allowedExecutors: Array.isArray(fields.allowed_executors) ? fields.allowed_executors.map(String) : [],
    createdAt: Number(fields.created_at ?? 0),
    expiresAt: Number(fields.expires_at ?? 0),
    requestCount: Number(fields.request_count ?? 0),
    isActive: fields.is_active === true,
  };
}

async function fetchBudgetsForOwner(ownerAddress: string): Promise<BudgetInfo[]> {
  const receiptType = `${BARAM.budgetTypeOrigin}::budget::BudgetReceipt`;
  const budgetIds: string[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const result = await suiClient.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: receiptType },
      options: { showContent: true },
      cursor,
    });
    for (const item of result.data) {
      if (item.data?.content?.dataType === 'moveObject') {
        const fields = item.data.content.fields as Record<string, unknown>;
        const id = fields.budget_id as string;
        if (id) budgetIds.push(id);
      }
    }
    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  if (budgetIds.length === 0) return [];

  const objects = await suiClient.multiGetObjects({
    ids: budgetIds,
    options: { showContent: true },
  });

  const budgets: BudgetInfo[] = [];
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (obj.data?.content?.dataType === 'moveObject') {
      budgets.push(parseBudgetFields(obj.data.content.fields as Record<string, unknown>, budgetIds[i]));
    }
  }
  budgets.sort((a, b) => b.createdAt - a.createdAt);
  return budgets;
}

export interface SpendingLimits {
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  dailySpent: number;
  weeklySpent: number;
  monthlySpent: number;
  dailyResetAt: number;
  weeklyResetAt: number;
  monthlyResetAt: number;
  minIntervalMs: number;
  lastRequestAt: number;
}

export async function fetchSpendingLimits(budgetId: string): Promise<SpendingLimits | null> {
  try {
    const result = await suiClient.getDynamicFieldObject({
      parentId: budgetId,
      name: {
        type: `${BARAM.budgetV2TypeOrigin}::budget::SpendingLimitsKey`,
        value: { dummy_field: false },
      },
    });
    if (result.data?.content?.dataType === 'moveObject') {
      const wrapper = result.data.content.fields as Record<string, unknown>;
      const valueWrapper = wrapper.value as Record<string, unknown>;
      const fields = (valueWrapper?.fields ?? valueWrapper ?? wrapper) as Record<string, unknown>;
      return {
        dailyLimit: Number(fields.daily_limit ?? 0),
        weeklyLimit: Number(fields.weekly_limit ?? 0),
        monthlyLimit: Number(fields.monthly_limit ?? 0),
        dailySpent: Number(fields.daily_spent ?? 0),
        weeklySpent: Number(fields.weekly_spent ?? 0),
        monthlySpent: Number(fields.monthly_spent ?? 0),
        dailyResetAt: Number(fields.daily_reset_at ?? 0),
        weeklyResetAt: Number(fields.weekly_reset_at ?? 0),
        monthlyResetAt: Number(fields.monthly_reset_at ?? 0),
        minIntervalMs: Number(fields.min_interval_ms ?? 0),
        lastRequestAt: Number(fields.last_request_at ?? 0),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function useSpendingLimits(budgetId: string | null) {
  return useQuery({
    queryKey: ['nasun-ai', 'spendingLimits', budgetId],
    queryFn: () => fetchSpendingLimits(budgetId!),
    enabled: !!budgetId,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

export function useBudgetsQuery(ownerAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['nasun-ai', 'budgets', ownerAddress],
    queryFn: () => fetchBudgetsForOwner(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

export function useBudgets(ownerAddress: string | null | undefined) {
  const { signer, address } = useSigner();
  const queryClient = useQueryClient();
  const query = useBudgetsQuery(ownerAddress);

  const [txStatus, setTxStatus] = useState<BudgetTxStatus>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudget] = useState<string | null>(null);
  const txInFlight = useRef(false);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['nasun-ai', 'budgets', ownerAddress] });
  }, [queryClient, ownerAddress]);

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
        setTxError(err instanceof Error ? err.message : 'Transaction failed');
        setTxStatus('error');
        return null;
      } finally {
        txInFlight.current = false;
      }
    },
    [signer, address],
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
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refresh();
        }
        return digest;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Failed to create budget');
        setTxStatus('error');
        return null;
      }
    },
    [address, signAndExecute, refresh],
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
          await refresh();
        }
        return !!digest;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Failed to deposit');
        setTxStatus('error');
        return false;
      }
    },
    [address, signAndExecute, refresh],
  );

  const withdrawFromBudget = useCallback(
    async (budgetId: string, amount: number): Promise<boolean> => {
      if (!address) return false;
      try {
        const tx = buildWithdrawFromBudgetTransaction(budgetId, amount);
        const digest = await signAndExecute(tx);
        if (digest) {
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refresh();
        }
        return !!digest;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Failed to withdraw');
        setTxStatus('error');
        return false;
      }
    },
    [address, signAndExecute, refresh],
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
        setTxError(err instanceof Error ? err.message : 'Failed to deactivate');
        setTxStatus('error');
        return false;
      }
    },
    [address, signAndExecute, refresh],
  );

  const updateConstraints = useCallback(
    async (
      budgetId: string,
      params: { maxPerRequest: number; allowedModels: string[]; allowedExecutors: string[]; expiresAt: number },
    ): Promise<boolean> => {
      try {
        const tx = buildUpdateConstraintsTransaction({ budgetId, ...params });
        const digest = await signAndExecute(tx);
        if (digest) {
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refresh();
        }
        return !!digest;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Failed to update constraints');
        setTxStatus('error');
        return false;
      }
    },
    [signAndExecute, refresh],
  );

  const setSpendingLimits = useCallback(
    async (
      budgetId: string,
      params: { dailyLimit: number; weeklyLimit: number; monthlyLimit: number; minIntervalMs: number },
    ): Promise<boolean> => {
      try {
        const tx = buildSetSpendingLimitsTransaction({ budgetId, ...params });
        const digest = await signAndExecute(tx);
        if (digest) {
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refresh();
        }
        return !!digest;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Failed to set spending limits');
        setTxStatus('error');
        return false;
      }
    },
    [signAndExecute, refresh],
  );

  const setCategories = useCallback(
    async (budgetId: string, categories: string[]): Promise<boolean> => {
      try {
        const tx = buildSetCategoriesTransaction({ budgetId, allowedCategories: categories });
        const digest = await signAndExecute(tx);
        if (digest) {
          await suiClient.waitForTransaction({ digest, options: { showEffects: true } });
          await refresh();
        }
        return !!digest;
      } catch (err) {
        setTxError(err instanceof Error ? err.message : 'Failed to set categories');
        setTxStatus('error');
        return false;
      }
    },
    [signAndExecute, refresh],
  );

  const resetTxStatus = useCallback(() => {
    setTxStatus('idle');
    setTxError(null);
  }, []);

  return {
    budgets: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    txStatus,
    txError,
    selectedBudgetId,
    setSelectedBudget,
    refresh,
    createBudget,
    depositToBudget,
    withdrawFromBudget,
    deactivateBudget,
    updateConstraints,
    setSpendingLimits,
    setCategories,
    resetTxStatus,
  };
}
