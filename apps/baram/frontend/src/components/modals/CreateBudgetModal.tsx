/**
 * CreateBudgetModal - Modal for creating a new Budget delegation
 */

import { useState } from 'react';
import { BUDGET_CONFIG, MODEL_PRICING } from '@/config/network';
import type { BudgetTxStatus } from '@/hooks/useBudgets';
import { nusdcToRaw, formatNusdcValue } from '@/utils/format';

interface CreateBudgetModalProps {
  onClose: () => void;
  onCreate: (params: {
    agent: string;
    deposit: number;
    maxPerRequest?: number;
    allowedModels?: string[];
    expiresAt?: number;
  }) => Promise<string | null>;
  txStatus: BudgetTxStatus;
  txError: string | null;
  prefillAgent?: string;
}

const AVAILABLE_MODELS = Object.entries(MODEL_PRICING).map(([id, info]) => ({
  id,
  name: info.name,
}));

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

export function CreateBudgetModal({ onClose, onCreate, txStatus, txError, prefillAgent }: CreateBudgetModalProps) {
  const [agent, setAgent] = useState(prefillAgent ?? '');
  const [deposit, setDeposit] = useState('');
  const [maxPerRequest, setMaxPerRequest] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [expirationDate, setExpirationDate] = useState('');

  const isBusy = txStatus === 'signing' || txStatus === 'executing';
  const isSuccess = txStatus === 'success';

  const depositRaw = nusdcToRaw(deposit);
  const maxPerRequestRaw = nusdcToRaw(maxPerRequest);

  const isAgentValid = SUI_ADDRESS_RE.test(agent);
  const isDepositValid = depositRaw >= BUDGET_CONFIG.MIN_DEPOSIT;
  const isFormValid = isAgentValid && isDepositValid && !isBusy;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    const expiresAt = expirationDate
      ? new Date(expirationDate).getTime()
      : 0;

    await onCreate({
      agent,
      deposit: depositRaw,
      maxPerRequest: maxPerRequestRaw || undefined,
      allowedModels: selectedModels.length > 0 ? selectedModels : undefined,
      expiresAt: expiresAt || undefined,
    });
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(m => m !== modelId)
        : [...prev, modelId]
    );
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl p-6 text-center space-y-3">
          <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">Budget Created</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {formatNusdcValue(depositRaw)} NUSDC deposited for agent
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={isBusy ? undefined : onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Create Budget</h2>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 rounded-md hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Agent Address */}
          <div className="space-y-1">
            <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
              Agent Address *
            </label>
            <input
              type="text"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder="0x..."
              className={`w-full px-3 py-2 text-xs font-mono rounded-lg bg-[var(--color-bg-primary)] border text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors
                ${agent && !isAgentValid
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
                }`}
            />
            {agent && !isAgentValid && (
              <p className="text-2xs text-red-400">Invalid address (0x + 64 hex chars)</p>
            )}
          </div>

          {/* Initial Deposit */}
          <div className="space-y-1">
            <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
              Initial Deposit (NUSDC) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder={`Min ${formatNusdcValue(BUDGET_CONFIG.MIN_DEPOSIT)}`}
              className={`w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors
                ${deposit && !isDepositValid
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
                }`}
            />
            {deposit && !isDepositValid && (
              <p className="text-2xs text-red-400">
                Minimum deposit: {formatNusdcValue(BUDGET_CONFIG.MIN_DEPOSIT)} NUSDC
              </p>
            )}
          </div>

          {/* Max Per Request (optional) */}
          <div className="space-y-1">
            <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
              Max Per Request (NUSDC)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={maxPerRequest}
              onChange={(e) => setMaxPerRequest(e.target.value)}
              placeholder="0 = unlimited"
              className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          {/* Allowed Models (optional multi-select) */}
          <div className="space-y-1.5">
            <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
              Allowed Models
            </label>
            <p className="text-2xs text-[var(--color-text-muted)]">
              Leave empty to allow all models
            </p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_MODELS.map(({ id, name }) => (
                <button
                  key={id}
                  onClick={() => toggleModel(id)}
                  className={`px-2.5 py-1 text-2xs rounded-full border transition-colors
                    ${selectedModels.includes(id)
                      ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Expiration (optional) */}
          <div className="space-y-1">
            <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
              Expiration Date
            </label>
            <input
              type="datetime-local"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            <p className="text-2xs text-[var(--color-text-muted)]">Leave empty for no expiration</p>
          </div>

          {/* Error */}
          {txError && (
            <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400 text-center">
              {txError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            disabled={isBusy}
            className="flex-1 py-2 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1 py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isBusy ? 'Processing...' : `Create Budget (${formatNusdcValue(depositRaw)} NUSDC)`}
          </button>
        </div>
      </div>
    </div>
  );
}
