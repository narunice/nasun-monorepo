/**
 * Query Budget objects for an owner via owned BudgetReceipt -> shared Budget.
 * Ported from baram features/agents/hooks/useAgentBudgets.ts.
 */

import { useQuery } from '@tanstack/react-query';
import { BARAM } from '@nasun/devnet-config';
import { suiClient } from '@/lib/sui-client';

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

function parseBudgetFields(fields: Record<string, unknown>): BudgetInfo | null {
  try {
    const rawBalance = fields.balance;
    const balanceValue =
      typeof rawBalance === 'object' && rawBalance !== null
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
      isActive: (fields.is_active as boolean) ?? true,
      createdAt: Number(fields.created_at ?? 0),
      expiresAt: Number(fields.expires_at ?? 0),
    };
  } catch {
    return null;
  }
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
  for (const obj of objects) {
    if (obj.data?.content?.dataType === 'moveObject') {
      const parsed = parseBudgetFields(obj.data.content.fields as Record<string, unknown>);
      if (parsed) budgets.push(parsed);
    }
  }
  return budgets;
}

export function useAgentBudgets(ownerAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['nasun-ai', 'agentBudgets', ownerAddress],
    queryFn: () => fetchBudgetsForOwner(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
