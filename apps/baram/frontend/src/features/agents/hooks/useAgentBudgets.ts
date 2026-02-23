/**
 * useAgentBudgets - Query Budget objects associated with agents
 *
 * Budgets are shared objects, so we find them via BudgetReceipt
 * objects owned by the wallet owner.
 */

import { useQuery } from '@tanstack/react-query';
import { suiClient } from '../../../config/client';
import { BARAM_CONFIG } from '../../../config/network';

export interface BudgetInfo {
  id: string;
  owner: string;
  agent: string;
  balance: number;
  totalSpent: number;
  maxPerRequest: number;
  requestCount: number;
  isActive: boolean;
  createdAt: number;
  expiresAt: number;
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

function parseBudgetFields(fields: Record<string, unknown>): BudgetInfo | null {
  try {
    // Balance<T> is serialized as a plain string by Sui JSON-RPC, not { value: "..." }
    const rawBalance = fields.balance;
    const balanceValue = typeof rawBalance === 'object' && rawBalance !== null
      ? Number((rawBalance as Record<string, string>).value ?? 0)
      : Number(rawBalance ?? 0);

    return {
      id: (fields.id as Record<string, string>)?.id ?? '',
      owner: fields.owner as string,
      agent: fields.agent as string,
      balance: balanceValue,
      totalSpent: Number(fields.total_spent ?? 0),
      maxPerRequest: Number(fields.max_per_request ?? 0),
      requestCount: Number(fields.request_count ?? 0),
      isActive: fields.is_active as boolean ?? true,
      createdAt: Number(fields.created_at ?? 0),
      expiresAt: Number(fields.expires_at ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchBudgetsForOwner(ownerAddress: string): Promise<BudgetInfo[]> {
  // First find BudgetReceipt objects to get Budget IDs
  const receiptType = `${BARAM_CONFIG.budgetTypeOrigin}::budget::BudgetReceipt`;
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
        const budgetId = fields.budget_id as string;
        if (budgetId) budgetIds.push(budgetId);
      }
    }

    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  if (budgetIds.length === 0) return [];

  // Fetch actual Budget shared objects
  const budgets: BudgetInfo[] = [];
  const objects = await suiClient.multiGetObjects({
    ids: budgetIds,
    options: { showContent: true },
  });

  for (const obj of objects) {
    if (obj.data?.content?.dataType === 'moveObject') {
      const parsed = parseBudgetFields(obj.data.content.fields as Record<string, unknown>);
      if (parsed) budgets.push(parsed);
    }
  }

  return budgets;
}

export async function fetchSpendingLimits(budgetId: string): Promise<SpendingLimits | null> {
  try {
    const result = await suiClient.getDynamicFieldObject({
      parentId: budgetId,
      name: {
        type: `${BARAM_CONFIG.budgetV2TypeOrigin}::budget::SpendingLimitsKey`,
        value: { dummy_field: false },
      },
    });

    if (result.data?.content?.dataType === 'moveObject') {
      const wrapper = result.data.content.fields as Record<string, unknown>;
      // Dynamic field: fields.value is { type, fields: { ...actual data } }
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

export function useAgentBudgets(ownerAddress: string | null) {
  return useQuery({
    queryKey: ['agentBudgets', ownerAddress],
    queryFn: () => fetchBudgetsForOwner(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}

export function useSpendingLimits(budgetId: string | null) {
  return useQuery({
    queryKey: ['spendingLimits', budgetId],
    queryFn: () => fetchSpendingLimits(budgetId!),
    enabled: !!budgetId,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
