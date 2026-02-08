/**
 * Budget Store - Zustand state management for budget delegation
 *
 * Manages owned budgets (on-chain query, not encrypted).
 */

import { create } from 'zustand';
import { SuiClient } from '@mysten/sui/client';
import { BARAM_CONFIG } from '@/config/network';

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

interface BudgetState {
  budgets: BudgetInfo[];
  isLoading: boolean;
  selectedBudgetId: string | null;
  error: string | null;
}

interface BudgetActions {
  fetchBudgets: (client: SuiClient, ownerAddress: string) => Promise<void>;
  setSelectedBudget: (id: string | null) => void;
  refreshBudget: (client: SuiClient, budgetId: string) => Promise<void>;
  reset: () => void;
}

const initialState: BudgetState = {
  budgets: [],
  isLoading: false,
  selectedBudgetId: null,
  error: null,
};

function parseBudgetFields(fields: Record<string, unknown>, id: string): BudgetInfo {
  return {
    id,
    owner: String(fields.owner ?? ''),
    agent: String(fields.agent ?? ''),
    balance: Number(fields.balance ?? 0),
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

export const useBudgetStore = create<BudgetState & BudgetActions>()((set, get) => ({
  ...initialState,

  fetchBudgets: async (client: SuiClient, ownerAddress: string) => {
    set({ isLoading: true, error: null });
    try {
      // Budget is a shared object — query BudgetReceipt (owned) to find budget IDs
      // Use budgetTypeOrigin (runtime type origin) for type filtering, not the latest packageId
      const receiptType = `${BARAM_CONFIG.budgetTypeOrigin}::budget::BudgetReceipt`;
      const result = await client.getOwnedObjects({
        owner: ownerAddress,
        filter: { StructType: receiptType },
        options: { showContent: true },
      });

      const budgets: BudgetInfo[] = [];
      for (const obj of result.data) {
        if (obj.data?.content?.dataType !== 'moveObject') continue;
        const receiptFields = obj.data.content.fields as Record<string, unknown>;
        const budgetId = receiptFields.budget_id as string;
        if (!budgetId) continue;

        try {
          const budgetObj = await client.getObject({
            id: budgetId,
            options: { showContent: true },
          });
          if (budgetObj.data?.content?.dataType !== 'moveObject') continue;
          const fields = budgetObj.data.content.fields as Record<string, unknown>;
          budgets.push(parseBudgetFields(fields, budgetId));
        } catch {
          // Budget may have been deleted or is inaccessible
        }
      }

      // Sort by creation date descending
      budgets.sort((a, b) => b.createdAt - a.createdAt);
      set({ budgets, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch budgets';
      set({ error: msg, isLoading: false });
    }
  },

  setSelectedBudget: (id: string | null) => {
    set({ selectedBudgetId: id });
  },

  refreshBudget: async (client: SuiClient, budgetId: string) => {
    try {
      const obj = await client.getObject({
        id: budgetId,
        options: { showContent: true },
      });
      if (obj.data?.content?.dataType !== 'moveObject') return;
      const fields = obj.data.content.fields as Record<string, unknown>;
      const id = (fields.id as { id: string })?.id ?? budgetId;
      const updated = parseBudgetFields(fields, id);

      set((state) => ({
        budgets: state.budgets.map((b) => (b.id === budgetId ? updated : b)),
      }));
    } catch {
      // Silently fail refresh — budget may have been deactivated
    }
  },

  reset: () => set(initialState),
}));
