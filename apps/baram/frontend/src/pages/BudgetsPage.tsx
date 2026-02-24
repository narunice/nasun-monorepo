/**
 * BudgetsPage - Budget management page with stats, filtering, and CRUD modals
 */

import { useState } from 'react';
import { useWalletSession } from '../hooks/useWalletSession';
import { useBudgets } from '../hooks/useBudgets';
import type { BudgetInfo } from '../stores/budgetStore';
import { CreateBudgetModal } from '../components/modals/CreateBudgetModal';
import { BudgetDetail } from '../components/sidebar/BudgetDetail';
import { BudgetSettingsModal } from '../components/modals/BudgetSettingsModal';
import { getBudgetStatus } from '../utils/budget';
import { formatNusdcValue as formatNUSDC, truncateAddress as formatAddress, formatDate } from '../utils/format';

type Filter = 'all' | 'active' | 'inactive' | 'expired';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4 border border-[var(--color-border)]">
      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">{label}</p>
      <p className="text-2xl lg:text-3xl font-semibold text-[var(--color-text-primary)] mt-1">{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function BudgetPageCard({ budget, onClick }: { budget: BudgetInfo; onClick: () => void }) {
  const status = getBudgetStatus(budget);
  const total = Math.max(1, budget.balance + budget.totalSpent);
  const remainPercent = Math.max(0, Math.min(100, (budget.balance / total) * 100));
  const isLow = budget.balance > 0 && budget.balance / total < 0.2;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[var(--color-bg-secondary)] rounded-lg p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)]/30 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm lg:text-base font-semibold text-[var(--color-text-primary)]">
            Agent Budget
          </p>
          <p className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5">
            {formatAddress(budget.agent)}
          </p>
        </div>
        <span className={`text-2xs px-1.5 py-0.5 rounded ${
          status.label === 'Active'
            ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
            : status.label === 'Expired'
            ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
            : 'bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]'
        }`}>
          {status.label}
        </span>
      </div>

      {/* Balance gauge */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
          <span>Balance</span>
          <span className={isLow ? 'text-[var(--color-warning)]' : ''}>
            {formatNUSDC(budget.balance)} / {formatNUSDC(budget.balance + budget.totalSpent)} NUSDC
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isLow ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-accent)]'
            }`}
            style={{ width: `${remainPercent}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--color-border)]">
        <span className="text-2xs text-[var(--color-text-muted)]">
          {budget.requestCount} requests
        </span>
        <span className="text-2xs text-[var(--color-text-muted)]">
          {formatNUSDC(budget.totalSpent)} spent
        </span>
        <span className="text-2xs text-[var(--color-text-muted)]">
          Created {formatDate(budget.createdAt)}
        </span>
      </div>
    </button>
  );
}

export function BudgetsPage() {
  const { isConnected } = useWalletSession();
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
    updateConstraints,
    setSpendingLimits,
    setCategories,
    resetTxStatus,
  } = useBudgets();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [settingsBudgetId, setSettingsBudgetId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-[var(--color-text-muted)]">
          Connect your wallet to manage budgets.
        </p>
      </div>
    );
  }

  // Filter budgets
  const filteredBudgets = budgets.filter(b => {
    const status = getBudgetStatus(b);
    if (filter === 'active') return status.label === 'Active';
    if (filter === 'inactive') return status.label === 'Inactive';
    if (filter === 'expired') return status.label === 'Expired';
    return true;
  });

  // Compute stats
  const activeBudgets = budgets.filter(b => getBudgetStatus(b).label === 'Active');
  let totalBalance = 0;
  let totalSpent = 0;
  let totalRequests = 0;
  for (const b of budgets) {
    totalBalance += b.balance;
    totalSpent += b.totalSpent;
    totalRequests += b.requestCount;
  }

  const selectedBudget = budgets.find(b => b.id === selectedBudgetId) || null;

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'expired', label: 'Expired' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg lg:text-xl font-semibold text-[var(--color-text-primary)]">Budgets</h2>
        <button
          onClick={() => { resetTxStatus(); setShowCreateModal(true); }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Create Budget
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Balance"
          value={`${formatNUSDC(totalBalance)} NUSDC`}
          sub={`${activeBudgets.length} active`}
        />
        <StatCard
          label="Total Spent"
          value={`${formatNUSDC(totalSpent)} NUSDC`}
        />
        <StatCard
          label="Active Budgets"
          value={String(activeBudgets.length)}
          sub={`${budgets.length} total`}
        />
        <StatCard
          label="Total Requests"
          value={String(totalRequests)}
          sub={`across ${budgets.length} budgets`}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              filter === f.key
                ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-5 h-5 border-2 border-[var(--color-text-muted)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
          <p className="text-xs text-red-400">{error}</p>
          <button
            onClick={refresh}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            Retry
          </button>
        </div>
      ) : filteredBudgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <svg className="w-10 h-10 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <p className="text-sm text-[var(--color-text-muted)]">
            {filter === 'all'
              ? 'No budgets yet. Create your first budget to delegate spending to AI agents.'
              : `No ${filter} budgets found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBudgets.map(budget => (
            <BudgetPageCard
              key={budget.id}
              budget={budget}
              onClick={() => { resetTxStatus(); setSelectedBudget(budget.id); }}
            />
          ))}
        </div>
      )}

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
      {selectedBudget && !settingsBudgetId && (
        <BudgetDetail
          budget={selectedBudget}
          onClose={() => setSelectedBudget(null)}
          onDeposit={depositToBudget}
          onWithdraw={withdrawFromBudget}
          onDeactivate={deactivateBudget}
          onRefresh={refresh}
          onOpenSettings={(id) => { setSelectedBudget(null); setSettingsBudgetId(id); }}
          txStatus={txStatus}
          txError={txError}
        />
      )}

      {/* Budget Settings Modal */}
      {settingsBudgetId && budgets.find(b => b.id === settingsBudgetId) && (
        <BudgetSettingsModal
          budget={budgets.find(b => b.id === settingsBudgetId)!}
          onClose={() => setSettingsBudgetId(null)}
          onUpdateConstraints={updateConstraints}
          onSetSpendingLimits={setSpendingLimits}
          onSetCategories={setCategories}
          txStatus={txStatus}
          txError={txError}
          resetTxStatus={resetTxStatus}
        />
      )}
    </div>
  );
}
