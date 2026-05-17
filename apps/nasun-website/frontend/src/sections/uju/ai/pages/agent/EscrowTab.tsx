/**
 * Agent Escrow tab - Budget objects for this agent.
 *
 * Shows balance, allowance, spending limits. Owner can deposit, withdraw,
 * deactivate, and adjust constraints via BudgetSettingsModal.
 */

import { useState } from 'react';
import { useBudgets, type BudgetInfo } from '../../hooks/useBudgets';
import { CreateBudgetModal } from '../../components/modals/CreateBudgetModal';
import { BudgetSettingsModal } from '../../components/modals/BudgetSettingsModal';
import { formatNusdcValue, formatTimestamp, nusdcToRaw, truncateAddress } from '../../utils/format';
import { getBudgetStatus } from '../../utils/budget';

interface EscrowTabProps {
  walletAddress: string;
  agentAddress: string;
}

export function EscrowTab({ walletAddress, agentAddress }: EscrowTabProps) {
  const b = useBudgets(walletAddress);
  const [showCreate, setShowCreate] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<BudgetInfo | null>(null);

  const agentBudgets = b.budgets.filter(
    (x) => x.agent.toLowerCase() === agentAddress.toLowerCase(),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Inference Balance</h3>
          <p className="text-sm text-uju-secondary mt-0.5">
            NUSDC the agent uses to pay inference fees. Separate from trading funds.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            b.resetTxStatus();
            setShowCreate(true);
          }}
          className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
        >
          + New Inference Balance
        </button>
      </div>

      {b.isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-uju-card/60 animate-pulse" />
          ))}
        </div>
      ) : agentBudgets.length === 0 ? (
        <div className="py-8 text-center rounded-xl border border-uju-border/60 border-dashed">
          <p className="text-sm text-uju-secondary">No inference balance linked to this agent.</p>
          <p className="text-sm text-uju-secondary/70 mt-1">
            Create one to authorize NUSDC spending on AI fees.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {agentBudgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onDeposit={async (amt) => {
                await b.depositToBudget(budget.id, amt);
              }}
              onWithdraw={async (amt) => {
                await b.withdrawFromBudget(budget.id, amt);
              }}
              onDeactivate={async () => {
                if (confirm('Deactivate this inference balance? Pending agent calls will fail.')) {
                  await b.deactivateBudget(budget.id);
                }
              }}
              onSettings={() => {
                b.resetTxStatus();
                setSettingsTarget(budget);
              }}
            />
          ))}
        </div>
      )}

      {b.txError && (
        <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{b.txError}</div>
      )}

      {showCreate && (
        <CreateBudgetModal
          prefillAgent={agentAddress}
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

function BudgetCard({
  budget,
  onDeposit,
  onWithdraw,
  onDeactivate,
  onSettings,
}: {
  budget: BudgetInfo;
  onDeposit: (amount: number) => Promise<void>;
  onWithdraw: (amount: number) => Promise<void>;
  onDeactivate: () => Promise<void>;
  onSettings: () => void;
}) {
  const [depositInput, setDepositInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const status = getBudgetStatus(budget);
  const total = Math.max(1, budget.balance + budget.totalSpent);
  const remainingPct = Math.max(0, Math.min(100, (budget.balance / total) * 100));

  return (
    <div className="bg-uju-card rounded-xl p-4 border border-uju-border/60 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-mono text-uju-secondary truncate">{truncateAddress(budget.id)}</p>
          <p className="text-sm text-uju-secondary/70 mt-0.5">
            Created {formatTimestamp(budget.createdAt)}
            {budget.expiresAt > 0 ? ` - expires ${formatTimestamp(budget.expiresAt)}` : ''}
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

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wider text-uju-secondary/70">Per inference call</p>
          <p className="text-white">
            {budget.maxPerRequest > 0 ? `${formatNusdcValue(budget.maxPerRequest)} NUSDC` : 'Unlimited'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-uju-secondary/70">Requests</p>
          <p className="text-white">{budget.requestCount}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-uju-secondary/70">Allowed models</p>
          <p className="text-white truncate">
            {budget.allowedModels.length === 0 ? 'All' : `${budget.allowedModels.length}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-uju-border/60">
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={depositInput}
            onChange={(e) => setDepositInput(e.target.value)}
            placeholder="Deposit NUSDC"
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2"
          />
          <button
            type="button"
            disabled={!nusdcToRaw(depositInput)}
            onClick={async () => {
              const raw = nusdcToRaw(depositInput);
              if (!raw) return;
              await onDeposit(raw);
              setDepositInput('');
            }}
            className="px-3 py-2 text-sm rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50"
          >
            Deposit
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            value={withdrawInput}
            onChange={(e) => setWithdrawInput(e.target.value)}
            placeholder="Withdraw NUSDC"
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2"
          />
          <button
            type="button"
            disabled={!nusdcToRaw(withdrawInput)}
            onClick={async () => {
              const raw = nusdcToRaw(withdrawInput);
              if (!raw) return;
              await onWithdraw(raw);
              setWithdrawInput('');
            }}
            className="px-3 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onSettings}
          className="text-sm text-pado-2 hover:underline"
        >
          Settings
        </button>
        {budget.isActive && (
          <button
            type="button"
            onClick={() => void onDeactivate()}
            className="text-sm text-red-400 hover:underline"
          >
            Deactivate
          </button>
        )}
      </div>
    </div>
  );
}
