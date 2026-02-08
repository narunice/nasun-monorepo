/**
 * BudgetDetail - Budget detail modal with stats, deposit, withdraw, deactivate
 */

import { useState } from 'react';
import type { BudgetInfo } from '@/stores/budgetStore';
import type { BudgetTxStatus } from '@/hooks/useBudgets';
import { BUDGET_CONFIG } from '@/config/network';
import { formatNusdcValue, nusdcToRaw, formatTimestamp } from '@/utils/format';
import { getBudgetStatus } from '@/utils/budget';

interface BudgetDetailProps {
  budget: BudgetInfo;
  onClose: () => void;
  onDeposit: (budgetId: string, amount: number) => Promise<boolean>;
  onWithdraw: (budgetId: string, amount: number) => Promise<boolean>;
  onDeactivate: (budgetId: string) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  txStatus: BudgetTxStatus;
  txError: string | null;
}

type ActionMode = 'none' | 'deposit' | 'withdraw' | 'deactivate-confirm';

function formatExpiry(ms: number): string {
  if (ms === 0) return 'Never';
  return formatTimestamp(ms);
}

export function BudgetDetail({
  budget,
  onClose,
  onDeposit,
  onWithdraw,
  onDeactivate,
  onRefresh,
  txStatus,
  txError,
}: BudgetDetailProps) {
  const [actionMode, setActionMode] = useState<ActionMode>('none');
  const [amount, setAmount] = useState('');
  const status = getBudgetStatus(budget);
  const isBusy = txStatus === 'signing' || txStatus === 'executing';

  const handleDeposit = async () => {
    const value = nusdcToRaw(amount);
    if (value < BUDGET_CONFIG.MIN_DEPOSIT) return;
    const success = await onDeposit(budget.id, value);
    if (success) {
      setAmount('');
      setActionMode('none');
    }
  };

  const handleWithdraw = async () => {
    const value = nusdcToRaw(amount);
    if (value <= 0 || value > budget.balance) return;
    const success = await onWithdraw(budget.id, value);
    if (success) {
      setAmount('');
      setActionMode('none');
    }
  };

  const handleDeactivate = async () => {
    const success = await onDeactivate(budget.id);
    if (success) {
      onClose();
    }
  };

  // Use nusdcToRaw for consistent validation (same path as submission)
  const depositRaw = nusdcToRaw(amount);
  const withdrawRaw = nusdcToRaw(amount);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Budget Detail</h2>
            <span className={`text-[10px] font-medium ${status.color}`}>{status.label}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Agent Info */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Agent</span>
            <p className="text-xs font-mono text-[var(--color-text-secondary)] mt-0.5 break-all">
              {budget.agent}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Balance" value={`${formatNusdcValue(budget.balance)} NUSDC`} />
            <StatCard label="Total Deposited" value={`${formatNusdcValue(budget.totalDeposited)} NUSDC`} />
            <StatCard label="Total Spent" value={`${formatNusdcValue(budget.totalSpent)} NUSDC`} />
            <StatCard label="Requests" value={String(budget.requestCount)} />
          </div>

          {/* Constraints */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Constraints</span>
            <div className="space-y-1">
              <ConstraintRow
                label="Max per request"
                value={budget.maxPerRequest > 0 ? `${formatNusdcValue(budget.maxPerRequest)} NUSDC` : 'Unlimited'}
              />
              <ConstraintRow
                label="Allowed models"
                value={budget.allowedModels.length > 0 ? budget.allowedModels.join(', ') : 'All'}
              />
              <ConstraintRow
                label="Expires"
                value={formatExpiry(budget.expiresAt)}
              />
              <ConstraintRow
                label="Created"
                value={formatTimestamp(budget.createdAt)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          {budget.isActive && (
            <div className="space-y-2">
              {actionMode === 'none' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setActionMode('deposit')}
                    disabled={isBusy}
                    className="flex-1 py-2 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setActionMode('withdraw')}
                    disabled={isBusy || budget.balance === 0}
                    className="flex-1 py-2 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                  <button
                    onClick={() => setActionMode('deactivate-confirm')}
                    disabled={isBusy}
                    className="flex-1 py-2 text-xs font-medium rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                </div>
              )}

              {/* Deposit Form */}
              {actionMode === 'deposit' && (
                <ActionForm
                  label="Deposit Amount (NUSDC)"
                  placeholder={`Min ${formatNusdcValue(BUDGET_CONFIG.MIN_DEPOSIT)}`}
                  value={amount}
                  onChange={setAmount}
                  onSubmit={handleDeposit}
                  onCancel={() => { setActionMode('none'); setAmount(''); }}
                  submitLabel="Deposit"
                  submitColor="bg-emerald-500 hover:bg-emerald-600"
                  isBusy={isBusy}
                  isValid={depositRaw >= BUDGET_CONFIG.MIN_DEPOSIT}
                />
              )}

              {/* Withdraw Form */}
              {actionMode === 'withdraw' && (
                <ActionForm
                  label={`Withdraw Amount (max ${formatNusdcValue(budget.balance)} NUSDC)`}
                  placeholder="0.00"
                  value={amount}
                  onChange={setAmount}
                  onSubmit={handleWithdraw}
                  onCancel={() => { setActionMode('none'); setAmount(''); }}
                  submitLabel="Withdraw"
                  submitColor="bg-blue-500 hover:bg-blue-600"
                  isBusy={isBusy}
                  isValid={withdrawRaw > 0 && withdrawRaw <= budget.balance}
                />
              )}

              {/* Deactivate Confirmation */}
              {actionMode === 'deactivate-confirm' && (
                <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 space-y-2">
                  <p className="text-xs text-red-400">
                    Deactivating will return the remaining balance ({formatNusdcValue(budget.balance)} NUSDC) to your wallet. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActionMode('none')}
                      disabled={isBusy}
                      className="flex-1 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeactivate}
                      disabled={isBusy}
                      className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      {isBusy ? 'Processing...' : 'Confirm Deactivate'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TX Status */}
          {txStatus === 'success' && (
            <div className="p-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400 text-center">
              Transaction successful
            </div>
          )}
          {txError && (
            <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400 text-center">
              {txError}
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="w-full py-1.5 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Refresh data
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-[var(--color-bg-tertiary)]">
      <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
      <p className="text-xs font-medium text-[var(--color-text-primary)] mt-0.5">{value}</p>
    </div>
  );
}

function ConstraintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[10px] text-[var(--color-text-secondary)] text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

interface ActionFormProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  submitColor: string;
  isBusy: boolean;
  isValid: boolean;
}

function ActionForm({
  label, placeholder, value, onChange,
  onSubmit, onCancel, submitLabel, submitColor,
  isBusy, isValid,
}: ActionFormProps) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] text-[var(--color-text-muted)]">{label}</label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={isBusy}
          className="flex-1 py-1.5 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={isBusy || !isValid}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg text-white transition-colors disabled:opacity-50 ${submitColor}`}
        >
          {isBusy ? 'Processing...' : submitLabel}
        </button>
      </div>
    </div>
  );
}
