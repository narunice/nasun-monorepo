/**
 * BudgetSection - Budget tab content in sidebar (list + create button)
 */

import { useState } from 'react';
import { useIsConnected } from '@/hooks/useWalletSession';
import { useBudgets } from '@/hooks/useBudgets';
import { BudgetCard } from './BudgetCard';
import { BudgetDetail } from './BudgetDetail';
import { CreateBudgetModal } from '@/components/modals/CreateBudgetModal';

export function BudgetSection() {
  const isConnected = useIsConnected();
  const {
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
  } = useBudgets();

  const [showCreateModal, setShowCreateModal] = useState(false);

  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId) || null;

  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-xs text-[var(--color-text-muted)] text-center">
          Connect wallet to manage budgets
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Create Budget Button */}
      <div className="p-3">
        <button
          onClick={() => { resetTxStatus(); setShowCreateModal(true); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
                     border border-[var(--color-border)] border-dashed
                     text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                     hover:bg-[var(--color-bg-tertiary)] hover:border-solid
                     transition-all text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Create Budget</span>
        </button>
      </div>

      {/* Budget List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-[var(--color-text-muted)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && error && (
          <div className="p-3 text-xs text-red-400 text-center">{error}</div>
        )}

        {!isLoading && !error && budgets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <svg className="w-8 h-8 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-xs text-[var(--color-text-muted)]">No budgets yet</p>
          </div>
        )}

        {budgets.map((budget) => (
          <BudgetCard
            key={budget.id}
            budget={budget}
            isSelected={selectedBudgetId === budget.id}
            onClick={() => { resetTxStatus(); setSelectedBudget(budget.id); }}
          />
        ))}
      </div>

      {/* Create Budget Modal */}
      {showCreateModal && (
        <CreateBudgetModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createBudget}
          txStatus={txStatus}
          txError={txError}
        />
      )}

      {/* Budget Detail Modal */}
      {selectedBudget && (
        <BudgetDetail
          budget={selectedBudget}
          onClose={() => setSelectedBudget(null)}
          onDeposit={depositToBudget}
          onWithdraw={withdrawFromBudget}
          onDeactivate={deactivateBudget}
          onRefresh={refresh}
          txStatus={txStatus}
          txError={txError}
        />
      )}
    </>
  );
}
