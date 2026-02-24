/**
 * BudgetSettingsModal - Tabbed modal for managing budget constraints, spending limits, categories
 */

import { useState, useEffect, type KeyboardEvent } from 'react';
import type { BudgetInfo } from '@/stores/budgetStore';
import type { BudgetTxStatus } from '@/hooks/useBudgets';
import { MODEL_PRICING } from '@/config/network';
import { nusdcToRaw, formatNusdcValue } from '@/utils/format';

interface BudgetSettingsModalProps {
  budget: BudgetInfo;
  onClose: () => void;
  onUpdateConstraints: (budgetId: string, params: {
    maxPerRequest: number;
    allowedModels: string[];
    allowedExecutors: string[];
    expiresAt: number;
  }) => Promise<boolean>;
  onSetSpendingLimits: (budgetId: string, params: {
    dailyLimit: number;
    weeklyLimit: number;
    monthlyLimit: number;
    minIntervalMs: number;
  }) => Promise<boolean>;
  onSetCategories: (budgetId: string, categories: string[]) => Promise<boolean>;
  txStatus: BudgetTxStatus;
  txError: string | null;
  resetTxStatus: () => void;
}

type SettingsTab = 'constraints' | 'limits' | 'categories';

const AVAILABLE_MODELS = Object.entries(MODEL_PRICING).map(([id, info]) => ({
  id,
  name: info.name,
}));

const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;
const MAX_EXECUTORS = 20;
const MAX_CATEGORIES = 20;
const MAX_CATEGORY_LENGTH = 64;

export function BudgetSettingsModal({
  budget,
  onClose,
  onUpdateConstraints,
  onSetSpendingLimits,
  onSetCategories,
  txStatus,
  txError,
  resetTxStatus,
}: BudgetSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('constraints');
  const [showSuccess, setShowSuccess] = useState(false);
  const isBusy = txStatus === 'signing' || txStatus === 'executing';

  // Auto-dismiss success banner
  useEffect(() => {
    if (txStatus === 'success') {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [txStatus]);

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'constraints', label: 'Constraints' },
    { key: 'limits', label: 'Spending Limits' },
    { key: 'categories', label: 'Categories' },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={isBusy ? undefined : onClose} />

      <div className="relative w-full max-w-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Budget Settings</h2>
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

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--color-border)] px-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { resetTxStatus(); setActiveTab(tab.key); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {/* Success banner */}
          {showSuccess && (
            <div className="mb-4 p-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400 text-center">
              Settings saved successfully
            </div>
          )}

          {/* Error */}
          {txError && (
            <div className="mb-4 p-2 rounded-lg bg-red-500/10 text-xs text-red-400 text-center">
              {txError}
            </div>
          )}

          {activeTab === 'constraints' && (
            <ConstraintsTab
              budget={budget}
              onSave={onUpdateConstraints}
              isBusy={isBusy}
            />
          )}
          {activeTab === 'limits' && (
            <SpendingLimitsTab
              budget={budget}
              onSave={onSetSpendingLimits}
              isBusy={isBusy}
            />
          )}
          {activeTab === 'categories' && (
            <CategoriesTab
              budget={budget}
              onSave={onSetCategories}
              isBusy={isBusy}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ========== Constraints Tab ==========

function ConstraintsTab({ budget, onSave, isBusy }: {
  budget: BudgetInfo;
  onSave: BudgetSettingsModalProps['onUpdateConstraints'];
  isBusy: boolean;
}) {
  const [maxPerRequest, setMaxPerRequest] = useState(
    budget.maxPerRequest > 0 ? formatNusdcValue(budget.maxPerRequest) : ''
  );
  const [selectedModels, setSelectedModels] = useState<string[]>(budget.allowedModels);
  const [executorInput, setExecutorInput] = useState('');
  const [executors, setExecutors] = useState<string[]>(budget.allowedExecutors);
  const [expirationDate, setExpirationDate] = useState(
    budget.expiresAt > 0 ? new Date(budget.expiresAt).toISOString().slice(0, 16) : ''
  );

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId) ? prev.filter(m => m !== modelId) : [...prev, modelId]
    );
  };

  const addExecutor = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || executors.length >= MAX_EXECUTORS || !SUI_ADDRESS_RE.test(trimmed) || executors.includes(trimmed)) return;
    setExecutors(prev => [...prev, trimmed]);
  };

  const handleExecutorKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addExecutor(executorInput);
      setExecutorInput('');
    }
  };

  const [expirationError, setExpirationError] = useState('');

  const handleSave = async () => {
    const expiresAt = expirationDate ? new Date(expirationDate).getTime() : 0;
    if (expiresAt > 0 && expiresAt < Date.now()) {
      setExpirationError('Expiration must be in the future');
      return;
    }
    setExpirationError('');
    await onSave(budget.id, {
      maxPerRequest: nusdcToRaw(maxPerRequest),
      allowedModels: selectedModels,
      allowedExecutors: executors,
      expiresAt,
    });
  };

  return (
    <div className="space-y-4">
      {/* Max per request */}
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

      {/* Allowed models */}
      <div className="space-y-1.5">
        <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
          Allowed Models
        </label>
        <p className="text-2xs text-[var(--color-text-muted)]">Leave empty to allow all</p>
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

      {/* Allowed executors */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
            Allowed Executors
          </label>
          <span className={`text-2xs ${executors.length >= MAX_EXECUTORS ? 'text-amber-400' : 'text-[var(--color-text-muted)]'}`}>
            {executors.length} / {MAX_EXECUTORS}
          </span>
        </div>
        {executors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {executors.map((addr, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] font-mono"
                title={addr}
              >
                {addr.slice(0, 6)}...{addr.slice(-4)}
                <button
                  onClick={() => setExecutors(prev => prev.filter((_, j) => j !== i))}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          type="text"
          value={executorInput}
          onChange={(e) => setExecutorInput(e.target.value)}
          onKeyDown={handleExecutorKeyDown}
          disabled={executors.length >= MAX_EXECUTORS}
          placeholder={executors.length >= MAX_EXECUTORS ? 'Max executors reached' : 'Paste executor address and press Enter'}
          className={`w-full px-3 py-2 text-xs font-mono rounded-lg bg-[var(--color-bg-primary)] border text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none transition-colors disabled:opacity-50
            ${executorInput && !SUI_ADDRESS_RE.test(executorInput)
              ? 'border-red-400 focus:border-red-400'
              : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'
            }`}
        />
      </div>

      {/* Expiration */}
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
        {expirationError && <p className="text-2xs text-red-400">{expirationError}</p>}
      </div>

      <button
        onClick={handleSave}
        disabled={isBusy}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isBusy ? 'Saving...' : 'Save Constraints'}
      </button>
    </div>
  );
}

// ========== Spending Limits Tab ==========

function SpendingLimitsTab({ budget, onSave, isBusy }: {
  budget: BudgetInfo;
  onSave: BudgetSettingsModalProps['onSetSpendingLimits'];
  isBusy: boolean;
}) {
  const [dailyLimit, setDailyLimit] = useState('');
  const [weeklyLimit, setWeeklyLimit] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [minInterval, setMinInterval] = useState('');

  const handleSave = async () => {
    await onSave(budget.id, {
      dailyLimit: nusdcToRaw(dailyLimit),
      weeklyLimit: nusdcToRaw(weeklyLimit),
      monthlyLimit: nusdcToRaw(monthlyLimit),
      minIntervalMs: Number(minInterval) * 1000 || 0,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
          Daily Limit (NUSDC)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
          placeholder="0 = no limit"
          className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
      </div>

      <div className="space-y-1">
        <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
          Weekly Limit (NUSDC)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={weeklyLimit}
          onChange={(e) => setWeeklyLimit(e.target.value)}
          placeholder="0 = no limit"
          className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
      </div>

      <div className="space-y-1">
        <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
          Monthly Limit (NUSDC)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={monthlyLimit}
          onChange={(e) => setMonthlyLimit(e.target.value)}
          placeholder="0 = no limit"
          className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
      </div>

      <div className="space-y-1">
        <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
          Minimum Interval (seconds)
        </label>
        <input
          type="number"
          step="1"
          min="0"
          value={minInterval}
          onChange={(e) => setMinInterval(e.target.value)}
          placeholder="0 = no minimum"
          className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={isBusy}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isBusy ? 'Saving...' : 'Save Limits'}
      </button>
    </div>
  );
}

// ========== Categories Tab ==========

function CategoriesTab({ budget, onSave, isBusy }: {
  budget: BudgetInfo;
  onSave: BudgetSettingsModalProps['onSetCategories'];
  isBusy: boolean;
}) {
  const [categories, setCategories] = useState<string[]>([]);
  const [catInput, setCatInput] = useState('');

  const addCategory = (value: string) => {
    const trimmed = value.trim().slice(0, MAX_CATEGORY_LENGTH);
    if (!trimmed || categories.length >= MAX_CATEGORIES || categories.includes(trimmed)) return;
    setCategories(prev => [...prev, trimmed]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCategory(catInput);
      setCatInput('');
    }
  };

  const handleSave = async () => {
    await onSave(budget.id, categories);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-2xs uppercase tracking-wider text-[var(--color-text-muted)]">
            Allowed Categories
          </label>
          <span className={`text-2xs ${categories.length >= MAX_CATEGORIES ? 'text-amber-400' : 'text-[var(--color-text-muted)]'}`}>
            {categories.length} / {MAX_CATEGORIES}
          </span>
        </div>
        <p className="text-2xs text-[var(--color-text-muted)]">
          Leave empty to allow all categories
        </p>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
              >
                {cat}
                <button
                  onClick={() => setCategories(prev => prev.filter((_, j) => j !== i))}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          type="text"
          value={catInput}
          onChange={(e) => setCatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={categories.length >= MAX_CATEGORIES}
          placeholder={categories.length >= MAX_CATEGORIES ? 'Max categories reached' : 'Type and press Enter to add'}
          className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={isBusy}
        className="w-full py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isBusy ? 'Saving...' : 'Save Categories'}
      </button>
    </div>
  );
}
