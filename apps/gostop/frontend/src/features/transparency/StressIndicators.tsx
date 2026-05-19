/**
 * StressIndicators — Tier 1.3 Risk Dashboard stress-test panel.
 *
 * Surfaces the three matview-backed indicators that answer the question
 * "how bad has it gotten?": maximum drawdown of running cumulative PnL,
 * daily PnL volatility over the trailing 30 days, and longest consecutive
 * losing streak. All three depend on `gostop.bankroll_daily_pnl`; when the
 * matview is stale the cells degrade according to the shared data_quality
 * enum on the parent risk block.
 *
 * The panel is intentionally separated from RiskMetrics so the visual
 * weight matches the operational weight — these are the numbers a careful
 * LP should read first.
 */

import type { DataQuality, RiskMetricsBlock } from '../../lib/api/types';
import { bpsToPct, fmtUsdc } from '../dashboard/format';

interface Props {
  risk: RiskMetricsBlock;
}

function qualityClass(q: DataQuality, fallback = 'text-neutral-100'): string {
  if (q === 'unreliable') return 'text-neutral-400';
  return fallback;
}

function fmtDrawdown(bps: number, q: DataQuality): string {
  if (q === 'unreliable') return '—';
  if (bps === 0) return '0.00%';
  return `−${bpsToPct(bps)}`;
}

function fmtVolatility(raw: string, q: DataQuality): string {
  if (q === 'unreliable') return '—';
  return `${fmtUsdc(raw)} NUSDC`;
}

function fmtStreak(days: number, q: DataQuality): string {
  if (q === 'unreliable') return '—';
  if (days === 0) return 'None';
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function StressIndicators({ risk }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Indicator
        label="Max drawdown"
        value={fmtDrawdown(risk.max_drawdown_pct_bps, risk.data_quality)}
        hint="Worst peak-to-trough drop of cumulative house PnL since the matview's first day. Computed at query time over the per-day series."
        valueClass={qualityClass(risk.data_quality, 'text-rose-300')}
      />
      <Indicator
        label="Daily PnL volatility (30d)"
        value={fmtVolatility(risk.daily_pnl_volatility_30d_raw, risk.data_quality)}
        hint="Standard deviation of daily net PnL over the trailing 30 days. Higher numbers mean choppier days, which translates to wider LP yield variance."
        valueClass={qualityClass(risk.data_quality, 'text-gold-200')}
      />
      <Indicator
        label="Longest losing streak"
        value={fmtStreak(risk.longest_house_losing_streak_days, risk.data_quality)}
        hint="Maximum consecutive days where the house ended net negative. Indicator of LP drawdown duration during bad runs."
        valueClass={qualityClass(risk.data_quality)}
      />
    </div>
  );
}

function Indicator({ label, value, hint, valueClass }: {
  label: string;
  value: string;
  hint: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-lg border border-gold-subtle bg-ink-900/40 p-3.5 space-y-1.5">
      <span
        className="block text-xs uppercase tracking-widest text-neutral-300"
        title={hint}
      >
        {label}
      </span>
      <span className={`block font-mono text-base ${valueClass}`}>{value}</span>
      <p className="text-xs text-neutral-300 leading-relaxed">{hint}</p>
    </div>
  );
}
