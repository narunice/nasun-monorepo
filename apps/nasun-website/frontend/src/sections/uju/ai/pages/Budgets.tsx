/**
 * Budgets - cross-agent budget management. Lists all budgets owned by the
 * connected wallet and lets the user create new ones or open settings.
 * For per-agent management, EscrowTab inside AgentDetail provides the same
 * controls scoped to one agent.
 */

import { useState } from 'react';
import { useBudgets, type BudgetInfo } from '../hooks/useBudgets';
import { CreateBudgetModal } from '../components/modals/CreateBudgetModal';
import { BudgetSettingsModal } from '../components/modals/BudgetSettingsModal';
import { formatNusdcValue, formatTimestamp, truncateAddress } from '../utils/format';
import { getBudgetStatus } from '../utils/budget';

interface BudgetsProps {
  walletAddress: string;
  onBack: () => void;
}

export function Budgets({ walletAddress, onBack }: BudgetsProps) {
  const b = useBudgets(walletAddress);
  const [showCreate, setShowCreate] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<BudgetInfo | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-pado-2 hover:underline mb-1"
          >
            ← Back to agents
          </button>
          <h2 className="text-base font-semibold text-white">Budgets</h2>
          <p className="text-sm text-uju-secondary mt-0.5">
            NUSDC escrows that authorize AI agents to spend on your behalf.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            b.resetTxStatus();
            setShowCreate(true);
          }}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
        >
          + New Budget
        </button>
      </div>

      {b.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-uju-card/60 animate-pulse" />
          ))}
        </div>
      ) : b.budgets.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-uju-border/60 border-dashed">
          <p className="text-sm text-uju-secondary">No budgets yet.</p>
          <p className="text-sm text-uju-secondary/70 mt-1">
            Create one to authorize an agent to spend NUSDC.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {b.budgets.map((budget) => {
            const status = getBudgetStatus(budget);
            const total = Math.max(1, budget.balance + budget.totalSpent);
            const remainingPct = Math.max(0, Math.min(100, (budget.balance / total) * 100));
            return (
              <div
                key={budget.id}
                className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-white truncate">{truncateAddress(budget.id)}</p>
                    <p className="text-sm text-uju-secondary/70 mt-0.5">
                      Agent {truncateAddress(budget.agent)} - created {formatTimestamp(budget.createdAt)}
                    </p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${status.color}`}>{status.label}</span>
                </div>

                <div>
                  <div className="flex justify-between text-sm text-uju-secondary">
                    <span>Balance</span>
                    <span className="text-white">
                      {formatNusdcValue(budget.balance)} / {formatNusdcValue(budget.balance + budget.totalSpent)} NUSDC
                    </span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-uju-bg overflow-hidden">
                    <div
                      className="h-full rounded-full bg-pado-2 transition-all"
                      style={{ width: `${remainingPct}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      b.resetTxStatus();
                      setSettingsTarget(budget);
                    }}
                    className="text-sm text-pado-2 hover:underline"
                  >
                    Settings
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {b.txError && (
        <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{b.txError}</div>
      )}

      {showCreate && (
        <CreateBudgetModal
          onClose={() => setShowCreate(false)}
          onCreate={(params) => b.createBudget(params)}
          txStatus={b.txStatus}
          txError={b.txError}
        />
      )}

      {settingsTarget && (
        <BudgetSettingsModal
          budget={settingsTarget}
          onClose={() => setSettingsTarget(null)}
          onUpdateConstraints={b.updateConstraints}
          onSetSpendingLimits={b.setSpendingLimits}
          onSetCategories={b.setCategories}
          txStatus={b.txStatus}
          txError={b.txError}
          resetTxStatus={b.resetTxStatus}
        />
      )}
    </div>
  );
}
