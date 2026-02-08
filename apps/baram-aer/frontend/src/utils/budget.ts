/**
 * Shared budget utilities
 */

import type { BudgetInfo } from '@/stores/budgetStore';

export function getBudgetStatus(budget: BudgetInfo): { label: string; color: string } {
  if (!budget.isActive) return { label: 'Inactive', color: 'text-[var(--color-text-muted)]' };
  if (budget.expiresAt > 0 && Date.now() > budget.expiresAt) {
    return { label: 'Expired', color: 'text-red-400' };
  }
  return { label: 'Active', color: 'text-emerald-400' };
}
