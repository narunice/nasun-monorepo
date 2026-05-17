import { useCallback, useEffect, useState } from 'react';
import { BUDGET_CONFIG, MODEL_PRICING } from '../../services/network';
import type { BudgetTxStatus } from '../../hooks/useBudgets';
import { nusdcToRaw, formatNusdcValue } from '../../utils/format';

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

const AVAILABLE_MODELS = Object.entries(MODEL_PRICING).map(([id, info]) => ({ id, name: info.name }));
const SUI_ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

export function CreateBudgetModal({
  onClose,
  onCreate,
  txStatus,
  txError,
  prefillAgent,
}: CreateBudgetModalProps) {
  const [agent, setAgent] = useState(prefillAgent ?? '');
  const [deposit, setDeposit] = useState('');
  const [maxPerRequest, setMaxPerRequest] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [expirationDate, setExpirationDate] = useState('');

  const isBusy = txStatus === 'signing' || txStatus === 'executing';
  const isSuccess = txStatus === 'success';

  const depositRaw = nusdcToRaw(deposit);
  const maxPerRequestRaw = nusdcToRaw(maxPerRequest);
  const isAgentValid = SUI_ADDRESS_RE.test(prefillAgent ?? agent);
  const isDepositValid = depositRaw >= BUDGET_CONFIG.MIN_DEPOSIT;
  const isFormValid = isAgentValid && isDepositValid && !isBusy;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    },
    [onClose, isBusy],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSubmit = async () => {
    if (!isFormValid) return;
    const expiresAt = expirationDate ? new Date(expirationDate).getTime() : 0;
    await onCreate({
      agent: prefillAgent ?? agent,
      deposit: depositRaw,
      maxPerRequest: maxPerRequestRaw || undefined,
      allowedModels: selectedModels.length > 0 ? selectedModels : undefined,
      expiresAt: expiresAt || undefined,
    });
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelId) ? prev.filter((m) => m !== modelId) : [...prev, modelId],
    );
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-uju-card border border-uju-border/60 rounded-xl shadow-2xl p-6 text-center space-y-3">
          <p className="text-sm font-medium text-white">Inference Balance Created</p>
          <p className="text-sm text-uju-secondary">
            {formatNusdcValue(depositRaw)} NUSDC deposited for agent
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-budget-title">
      <div className="absolute inset-0 bg-black/60" onClick={isBusy ? undefined : onClose} />
      <div className="relative w-full max-w-md bg-uju-card border border-uju-border/60 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-uju-border/60">
          <h2 id="create-budget-title" className="text-sm font-semibold text-white">
            Create Inference Balance
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
            className="p-1.5 rounded-md hover:bg-uju-bg/60 transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 text-uju-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-uju-secondary">Agent Address *</label>
            {prefillAgent ? (
              <div className="w-full px-3 py-2 text-sm font-mono rounded-lg bg-uju-bg/60 border border-uju-border/40 text-white/80 truncate select-all">
                {prefillAgent}
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  placeholder="0x..."
                  className={`w-full px-3 py-2 text-sm font-mono rounded-lg bg-uju-bg border text-white placeholder:text-uju-secondary/60 focus:outline-none transition-colors ${
                    agent && !isAgentValid
                      ? 'border-red-400 focus:border-red-400'
                      : 'border-uju-border/60 focus:border-pado-2'
                  }`}
                />
                {agent && !isAgentValid && (
                  <p className="text-xs text-red-400">Invalid address (0x + 64 hex chars)</p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-uju-secondary">Initial Deposit (NUSDC) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder={`Min ${formatNusdcValue(BUDGET_CONFIG.MIN_DEPOSIT)}`}
              className={`w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border text-white placeholder:text-uju-secondary/60 focus:outline-none transition-colors ${
                deposit && !isDepositValid
                  ? 'border-red-400 focus:border-red-400'
                  : 'border-uju-border/60 focus:border-pado-2'
              }`}
            />
            {deposit && !isDepositValid && (
              <p className="text-xs text-red-400">
                Minimum deposit: {formatNusdcValue(BUDGET_CONFIG.MIN_DEPOSIT)} NUSDC
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-uju-secondary">
              Max per inference call (NUSDC)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={maxPerRequest}
              onChange={(e) => setMaxPerRequest(e.target.value)}
              placeholder="0 = unlimited"
              className="w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2 transition-colors"
            />
            <p className="text-xs text-uju-secondary/70">
              Hard cap on NUSDC the agent can spend paying the AI executor for one inference
              request. Separate from the trader policy&apos;s per-trade swap cap (how much the agent
              can buy/sell on the DEX in a single trade).
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-uju-secondary">Allowed Models</label>
            <p className="text-xs text-uju-secondary/70">Leave empty to allow all models</p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_MODELS.map(({ id, name }) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => toggleModel(id)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    selectedModels.includes(id)
                      ? 'bg-pado-2/10 border-pado-2 text-pado-2'
                      : 'border-uju-border/60 text-uju-secondary hover:text-white'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider text-uju-secondary">Expiration Date</label>
            <input
              type="datetime-local"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              style={{ colorScheme: 'dark' }}
              className="w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white focus:outline-none focus:border-pado-2 transition-colors"
            />
            <p className="text-xs text-uju-secondary/70">Leave empty for no expiration</p>
          </div>

          {txError && (
            <div className="p-2 rounded-lg bg-red-500/10 text-sm text-red-400 text-center">{txError}</div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-uju-border/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="flex-1 py-2 text-sm rounded-lg border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="flex-1 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50"
          >
            {isBusy ? 'Processing...' : `Create Inference Balance (${formatNusdcValue(depositRaw)} NUSDC)`}
          </button>
        </div>
      </div>
    </div>
  );
}
