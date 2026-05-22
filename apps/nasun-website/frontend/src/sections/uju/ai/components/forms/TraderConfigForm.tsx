/**
 * TraderConfigForm: define/edit an AI agent's trading preset.
 *
 * Used inside AgentDetail's "Trader" tab. One config per agent.
 * Saving stores to IndexedDB + mirrors to chat-server's
 * nasun_ai_trader_configs.config_json so the runtime can fetch it.
 */

import { useEffect, useMemo, useState } from 'react';
import type { TraderConfig, TraderPair, StrategyPresetId } from '../../types/trader';
import { useExecutors } from '../../hooks/useExecutors';
import { isValidEndpointUrl } from '../../utils/executor';

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

// Mirror of `apps/nasun-ai-runtime/src/presets/strategies.ts`. Kept
// inline so the frontend doesn't pull the runtime as a dep.
const STRATEGY_PRESETS: { value: StrategyPresetId; label: string }[] = [
  { value: 'conservative_dca',   label: 'Conservative DCA' },
  { value: 'aggressive_scalper', label: 'Aggressive Scalper' },
  { value: 'mean_reversion',     label: 'Mean Reversion' },
  { value: 'trend_follower',     label: 'Trend Follower' },
  { value: 'hold_only',          label: 'Hold Only (smoke)' },
];

const MIN_INTERVAL = 5;
const MAX_BPS = 10000; // Move contract's MAX_BPS for risk limits.
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
  agentName: string;
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
    strategyPresetId: StrategyPresetId;
    maxSlippageBps: number;
    stopLossBps: number;
    takeProfitBps: number;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const ADDR_RE = /^0x[0-9a-fA-F]{64}$/;
const URL_RE = /^https?:\/\/.+/i;

export function TraderConfigForm({ agentAddress, agentName, agentBudgetId, initial, onSave, onDelete }: Props) {
  const { executors, isLoading: executorsLoading } = useExecutors();
  // Pool the Auto-pick draws from. Two filters:
  //   1. reachable endpoint (skip placeholder rows with empty endpoint_url
  //      and dev-only http://localhost stubs in prod builds).
  //   2. prefer non-dormant; if every reachable executor has stale heartbeat
  //      (>DORMANT_THRESHOLD_MS since last_active_at), fall back to dormant
  //      ones so the Auto UI is not stranded behind a misleading
  //      "Pick an executor" save error. The on-chain dormant flag is a
  //      heartbeat heuristic, not a reachability check — the Lambda
  //      executor stays callable even when its last_active_at lags.
  const activeExecutors = useMemo(() => {
    const reachable = executors.filter(
      (e) => e.isActive && isValidEndpointUrl(e.endpointUrl, import.meta.env.DEV),
    );
    const live = reachable.filter((e) => !e.isDormant);
    return live.length > 0 ? live : reachable;
  }, [executors]);

  const [pair, setPair] = useState<TraderPair>('NBTC_NUSDC');
  const [perTrade, setPerTrade] = useState('2');
  const [daily, setDaily] = useState('20');
  const [interval, setInterval] = useState('30');
  const [model, setModel] = useState(MODELS[0]);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [executorAddress, setExecutorAddress] = useState('');
  const [executorEndpoint, setExecutorEndpoint] = useState('');
  const [strategyPresetId, setStrategyPresetId] = useState<StrategyPresetId>('conservative_dca');
  const [maxSlippageBps, setMaxSlippageBps] = useState('50');
  const [stopLossBps, setStopLossBps] = useState('500');
  const [takeProfitBps, setTakeProfitBps] = useState('1000');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Inference Balance is auto-resolved from the agent; user does not need to know its id.
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
    setPair(initial.pair);
    setPerTrade((Number(BigInt(initial.perTradeMaxQuoteRaw)) / RAW_PER_NUSDC).toString());
    setDaily((Number(BigInt(initial.dailyMaxQuoteRaw)) / RAW_PER_NUSDC).toString());
    setInterval(initial.intervalMinutes.toString());
    setModel(initial.model);
    setPromptTemplate(initial.promptTemplate ?? '');
    setExecutorAddress(initial.executorAddress);
    setExecutorEndpoint(initial.executorEndpoint);
    if (initial.strategyPresetId) setStrategyPresetId(initial.strategyPresetId);
    if (typeof initial.maxSlippageBps === 'number') setMaxSlippageBps(String(initial.maxSlippageBps));
    if (typeof initial.stopLossBps === 'number') setStopLossBps(String(initial.stopLossBps));
    if (typeof initial.takeProfitBps === 'number') setTakeProfitBps(String(initial.takeProfitBps));
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaved(false);

    const pt = parseFloat(perTrade);
    const dy = parseFloat(daily);
    const iv = parseInt(interval, 10);
    const slip = parseInt(maxSlippageBps, 10);
    const sl = parseInt(stopLossBps, 10);
    const tp = parseInt(takeProfitBps, 10);
    if (!Number.isFinite(pt) || pt <= 0 || pt > 100) { setErr('Per-trade size: 0 < x ≤ 100 NUSDC'); return; }
    if (!Number.isFinite(dy) || dy < pt || dy > 1000) { setErr('Daily size: per-trade ≤ x ≤ 1000'); return; }
    if (!Number.isInteger(iv) || iv < MIN_INTERVAL || iv > 1440) { setErr(`Interval must be integer between ${MIN_INTERVAL} and 1440 minutes`); return; }
    if (promptTemplate.length > 10_000) { setErr('Custom prompt must be ≤ 10000 chars'); return; }
    if (!ADDR_RE.test(executorAddress)) {
      setErr(
        executorsLoading
          ? 'Loading executors, please wait a moment and try again'
          : activeExecutors.length === 0
            ? 'No verified executors available right now. Try again shortly.'
            : 'Executor auto-selection failed. Reload the page and try again.',
      );
      return;
    }
    if (!URL_RE.test(executorEndpoint)) { setErr('Executor endpoint must start with http(s)://'); return; }
    if (!Number.isInteger(slip) || slip < 0 || slip > MAX_BPS) { setErr(`Max slippage must be 0..${MAX_BPS} bps`); return; }
    if (!Number.isInteger(sl) || sl < 0 || sl > MAX_BPS) { setErr(`Stop loss must be 0..${MAX_BPS} bps`); return; }
    if (!Number.isInteger(tp) || tp < 0 || tp > MAX_BPS) { setErr(`Take profit must be 0..${MAX_BPS} bps`); return; }

    setBusy(true);
    try {
      await onSave({
        agentAddress,
        name: agentName,
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
        strategyPresetId,
        maxSlippageBps: slip,
        stopLossBps: sl,
        takeProfitBps: tp,
      });
      setSaved(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const labelClass = 'text-xs uppercase tracking-wider text-uju-secondary/70';
  const inputClass = 'w-full px-3 py-2 text-xs rounded-lg bg-uju-bg border border-uju-border/60 text-white focus:outline-none focus:border-pado-2 transition-colors';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={labelClass}>Trading Pair</label>
          <select value={pair} onChange={(e) => setPair(e.target.value as TraderPair)} className={inputClass}>
            {PAIRS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass}>Model</label>
          <div
            className={`${inputClass} flex items-center justify-between cursor-default`}
            aria-readonly="true"
          >
            <span className="text-uju-secondary">Auto</span>
            <span className="text-sm px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
              Lambda Verified
            </span>
          </div>
        </div>
      </div>

      <p className="text-sm text-uju-secondary/70 -mt-2">
        Model and executor are auto-selected from a Lambda-verified pool for this
        prototype. In a future iteration you&apos;ll be able to pick your own
        model and executor directly.
      </p>

      <div className="space-y-1">
        <label className={labelClass}>Strategy preset</label>
        <select
          value={strategyPresetId}
          onChange={(e) => setStrategyPresetId(e.target.value as StrategyPresetId)}
          className={inputClass}
        >
          {STRATEGY_PRESETS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <p className="text-xs text-uju-secondary/70">
          Biases the AI agent's decisions when a custom prompt is not set.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-uju-secondary/70">
          Trade caps below limit how much NUSDC the agent will <em>swap on the DEX per trade</em>,
          and per day. They are separate from the Inference Balance&apos;s &quot;Max per inference call&quot; cap,
          which limits NUSDC spent paying the AI executor per request.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className={labelClass}>Per-trade swap cap (NUSDC)</label>
            <input type="number" step="0.01" min="0.01" max="100" value={perTrade} onChange={(e) => setPerTrade(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Daily swap cap (NUSDC)</label>
            <input type="number" step="0.01" min="0.01" max="1000" value={daily} onChange={(e) => setDaily(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Interval (min)</label>
            <input type="number" step="1" min={MIN_INTERVAL} value={interval} onChange={(e) => setInterval(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className={labelClass}>Max slippage (bps)</label>
            <input type="number" step="1" min="0" max={MAX_BPS} value={maxSlippageBps} onChange={(e) => setMaxSlippageBps(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Stop loss (bps)</label>
            <input type="number" step="1" min="0" max={MAX_BPS} value={stopLossBps} onChange={(e) => setStopLossBps(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className={labelClass}>Take profit (bps)</label>
            <input type="number" step="1" min="0" max={MAX_BPS} value={takeProfitBps} onChange={(e) => setTakeProfitBps(e.target.value)} className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-uju-secondary/70">
          These guide the AI agent's prompt. To enforce a hard onchain rail, edit capability risk limits in the danger zone.
        </p>
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Inference Balance (auto-linked to this agent)</label>
        {budgetId ? (
          <div className="px-3 py-2 text-xs rounded-lg bg-uju-bg/60 border border-uju-border/60 text-uju-secondary font-mono">
            {budgetId.slice(0, 16)}…{budgetId.slice(-10)}
          </div>
        ) : (
          <div className="px-3 py-2 text-xs rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            No Inference Balance linked. Open the <strong>Inference Balance</strong> section in Settings and create one for this agent first.
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Executor</label>
        <div
          className={`${inputClass} flex items-center justify-between cursor-default`}
          aria-readonly="true"
        >
          <span className="text-uju-secondary">Auto (weighted-random from Bronze+ pool)</span>
          <span className="text-sm px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
            Lambda Verified
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass}>Custom Strategy (optional; leave blank to use the selected preset)</label>
        <textarea
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
          rows={5}
          placeholder={`Describe your trading strategy in plain English. Example:

You are a cautious swing trader. Only BUY when the most recent trade was a SELL, and only SELL when the last trade was a BUY. Prefer HOLD when uncertain. Never risk more than half of the per-trade cap on a single cycle.`}
          className={`${inputClass} text-sm leading-relaxed`}
        />
        <p className="text-xs text-uju-secondary/70 leading-relaxed">
          Write in natural language. The runtime automatically appends your current holdings, per-trade cap, daily cap, recent trades, and the required JSON output format, so you only need to describe the <em>strategy</em> (how to decide BUY / SELL / HOLD).
        </p>
      </div>

      {err && <div className="p-2 rounded-lg bg-red-500/10 text-xs text-red-400">{err}</div>}
      {saved && !err && <div className="p-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400">Saved.</div>}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="px-4 py-2 text-xs font-medium rounded-lg bg-pado-2 text-white hover:opacity-90 transition-opacity disabled:opacity-50">
          {busy ? 'Saving...' : initial ? 'Update' : 'Save'}
        </button>
        {initial && onDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => { if (confirm('Delete this agent config?')) await onDelete(); }}
            className="px-4 py-2 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
