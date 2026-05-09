/**
 * TraderConfigForm — define/edit a Trader Bot's preset.
 *
 * Used inside AgentDetail's "Trader" tab. One config per agent in 2A-1.
 * Saving stores to IndexedDB; the Web Worker scheduler (2A-2) reads it.
 */

import { useEffect, useMemo, useState } from 'react';
import type { TraderConfig, TraderPair } from '../../types/trader';
import { useExecutors } from '../../features/request/hooks/useExecutors';

const PAIRS: { value: TraderPair; label: string }[] = [
  { value: 'NBTC_NUSDC', label: 'NBTC / NUSDC' },
  { value: 'NETH_NUSDC', label: 'NETH / NUSDC' },
  { value: 'NSOL_NUSDC', label: 'NSOL / NUSDC' },
  { value: 'NSN_NUSDC',  label: 'NSN / NUSDC'  },
];

const MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

const MIN_INTERVAL = 5;
const RAW_PER_NUSDC = 1_000_000;

export interface TraderConfigFormValues {
  name: string;
  pair: TraderPair;
  perTradeMaxNusdc: number;
  dailyMaxNusdc: number;
  intervalMinutes: number;
  model: string;
  promptTemplate: string;
  executorAddress: string;
  executorEndpoint: string;
  budgetId: string;
}

interface Props {
  agentAddress: string;
  /** Auto-resolved Budget shared object id for this agent (empty if not yet created) */
  agentBudgetId: string;
  initial: TraderConfig | null;
  onSave: (values: {
    name: string;
    pair: TraderPair;
    perTradeMaxQuoteRaw: string;
    dailyMaxQuoteRaw: string;
    intervalMinutes: number;
    model: string;
    promptTemplate: string | null;
    executorAddress: string;
    executorEndpoint: string;
    budgetId: string;
    enabled: boolean;
    agentAddress: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const ADDR_RE = /^0x[0-9a-fA-F]{64}$/;
const URL_RE = /^https?:\/\/.+/i;

export function TraderConfigForm({ agentAddress, agentBudgetId, initial, onSave, onDelete }: Props) {
  const { executors, isLoading: executorsLoading } = useExecutors();
  const activeExecutors = useMemo(
    () => executors.filter((e) => e.isActive && !e.isDormant),
    [executors],
  );

  const [name, setName] = useState('');
  const [pair, setPair] = useState<TraderPair>('NBTC_NUSDC');
  const [perTrade, setPerTrade] = useState('2');
  const [daily, setDaily] = useState('20');
  const [interval, setInterval] = useState('30');
  const [model, setModel] = useState(MODELS[0]);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [executorAddress, setExecutorAddress] = useState('');
  const [executorEndpoint, setExecutorEndpoint] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Budget is auto-resolved from the agent — user doesn't need to know its id.
  const budgetId = agentBudgetId;

  // Auto-pick executor: prefer existing config; else first active.
  useEffect(() => {
    if (executorAddress) return;
    if (initial?.executorAddress) return; // hydrated from initial
    if (activeExecutors.length > 0) {
      setExecutorAddress(activeExecutors[0].operator);
      setExecutorEndpoint(activeExecutors[0].endpointUrl || 'http://localhost:3000');
    }
  }, [activeExecutors, initial?.executorAddress, executorAddress]);

  // Hydrate when initial loads
  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setPair(initial.pair);
    setPerTrade((Number(BigInt(initial.perTradeMaxQuoteRaw)) / RAW_PER_NUSDC).toString());
    setDaily((Number(BigInt(initial.dailyMaxQuoteRaw)) / RAW_PER_NUSDC).toString());
    setInterval(initial.intervalMinutes.toString());
    setModel(initial.model);
    setPromptTemplate(initial.promptTemplate ?? '');
    setExecutorAddress(initial.executorAddress);
    setExecutorEndpoint(initial.executorEndpoint);
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaved(false);

    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 64) {
      setErr('Name must be 1–64 chars');
      return;
    }
    const pt = parseFloat(perTrade);
    const dy = parseFloat(daily);
    const iv = parseInt(interval, 10);
    if (!Number.isFinite(pt) || pt <= 0 || pt > 100) { setErr('Per-trade size: 0 < x ≤ 100 NUSDC'); return; }
    if (!Number.isFinite(dy) || dy < pt || dy > 1000) { setErr('Daily size: per-trade ≤ x ≤ 1000'); return; }
    if (!Number.isInteger(iv) || iv < MIN_INTERVAL || iv > 1440) { setErr(`Interval must be integer between ${MIN_INTERVAL} and 1440 minutes`); return; }
    if (promptTemplate.length > 10_000) { setErr('Custom prompt must be ≤ 10000 chars'); return; }
    if (!ADDR_RE.test(executorAddress)) { setErr('Pick an executor from the list'); return; }
    if (!ADDR_RE.test(budgetId)) { setErr('No Budget linked to this agent — create one in the Budget tab first'); return; }
    if (!URL_RE.test(executorEndpoint)) { setErr('Executor endpoint must start with http(s)://'); return; }

    setBusy(true);
    try {
      await onSave({
        agentAddress,
        name: trimmedName,
        pair,
        perTradeMaxQuoteRaw: String(BigInt(Math.round(pt * RAW_PER_NUSDC))),
        dailyMaxQuoteRaw: String(BigInt(Math.round(dy * RAW_PER_NUSDC))),
        intervalMinutes: iv,
        model,
        promptTemplate: promptTemplate.trim() || null,
        executorAddress,
        executorEndpoint,
        budgetId,
        enabled: initial?.enabled ?? false,
      });
      setSaved(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const labelClass = 'text-2xs uppercase tracking-wider text-[var(--color-text-muted)]';
  const inputClass = 'w-full px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="space-y-1">
        <label className={labelClass}>Bot Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My NBTC Trader" className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Trading Pair</label>
          <select value={pair} onChange={(e) => setPair(e.target.value as TraderPair)} className={inputClass}>
            {PAIRS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Per-trade (NUSDC)</label>
          <input type="number" step="0.01" min="0.01" max="100" value={perTrade} onChange={(e) => setPerTrade(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Daily cap (NUSDC)</label>
          <input type="number" step="0.01" min="0.01" max="1000" value={daily} onChange={(e) => setDaily(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Interval (min)</label>
          <input type="number" step="1" min={MIN_INTERVAL} value={interval} onChange={(e) => setInterval(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Budget (auto-linked to this agent)</label>
        {budgetId ? (
          <div className="px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] font-mono">
            {budgetId.slice(0, 16)}…{budgetId.slice(-10)}
          </div>
        ) : (
          <div className="px-3 py-2 text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            No Budget linked. Open the <strong>Budget</strong> tab and create one for this agent first.
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Executor</label>
        {executorsLoading && activeExecutors.length === 0 ? (
          <div className="px-3 py-2 text-xs rounded-lg bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">Loading executors…</div>
        ) : activeExecutors.length === 0 ? (
          <div className="px-3 py-2 text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            No active executors registered on the network.
          </div>
        ) : (
          <select
            value={executorAddress}
            onChange={(e) => {
              const op = e.target.value;
              setExecutorAddress(op);
              const found = activeExecutors.find((x) => x.operator === op);
              setExecutorEndpoint(found?.endpointUrl || executorEndpoint);
            }}
            className={inputClass}
          >
            <option value="">— select an executor —</option>
            {activeExecutors.map((ex) => (
              <option key={ex.operator} value={ex.operator}>
                {ex.name} · {ex.tierName} · rep {ex.reputation} · {ex.operator.slice(0, 8)}…
              </option>
            ))}
          </select>
        )}
        {executorAddress && executorEndpoint && (
          <p className="text-2xs text-[var(--color-text-muted)] font-mono">endpoint: {executorEndpoint}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Custom Prompt (optional — leave blank for built-in trader prompt)</label>
        <textarea
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          rows={4}
          placeholder="Use placeholders: {{nbtc}}, {{nusdc}}, {{perTradeCap}}, {{dailyCap}}, {{recent}}"
          className={`${inputClass} font-mono`}
        />
      </div>

      {err && <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400">{err}</div>}
      {saved && !err && <div className="p-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400">Saved.</div>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
          {busy ? 'Saving...' : initial ? 'Update' : 'Save'}
        </button>
        {initial && onDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => { if (confirm('Delete this trader bot config?')) await onDelete(); }}
            className="px-4 py-2 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
