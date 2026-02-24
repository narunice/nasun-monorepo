/**
 * BudgetCard - Individual budget card in sidebar list
 */

import type { BudgetInfo } from '@/stores/budgetStore';
import { truncateAddress, formatNusdcValue } from '@/utils/format';
import { getBudgetStatus } from '@/utils/budget';

interface BudgetCardProps {
  budget: BudgetInfo;
  isSelected: boolean;
  onClick: () => void;
}

export function BudgetCard({ budget, isSelected, onClick }: BudgetCardProps) {
  const status = getBudgetStatus(budget);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg transition-colors
        ${isSelected
          ? 'bg-[var(--color-bg-tertiary)]'
          : 'hover:bg-[var(--color-bg-tertiary)]'
        }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--color-text-muted)]">Agent</span>
        <span className={`text-2xs font-medium ${status.color}`}>{status.label}</span>
      </div>
      <div className="text-xs font-mono text-[var(--color-text-secondary)] mb-1.5">
        {truncateAddress(budget.agent)}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-text-muted)]">Balance</span>
        <span className="text-xs font-medium text-[var(--color-text-primary)]">
          {formatNusdcValue(budget.balance)} NUSDC
        </span>
      </div>
    </button>
  );
}
