import type { BudgetInfo } from '../hooks/useBudgets';

export function getBudgetStatus(budget: BudgetInfo): { label: string; color: string } {
  if (!budget.isActive) return { label: 'Inactive', color: 'text-uju-secondary/60' };
  if (budget.expiresAt > 0 && Date.now() > budget.expiresAt) {
    return { label: 'Expired', color: 'text-red-400' };
  }
  return { label: 'Active', color: 'text-emerald-400' };
}
