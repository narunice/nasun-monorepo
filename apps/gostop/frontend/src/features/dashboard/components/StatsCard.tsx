import { useState } from 'react';
import { useMeStats } from '../../../lib/api/queries';
import type { StatsPeriod } from '../../../lib/api/types';
import { bpsToPct, fmtUsdc, fmtUsdcSigned, gameLabel } from '../format';

const PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

export function StatsCard() {
  const [period, setPeriod] = useState<StatsPeriod>('7d');
  const { data, isLoading, isError, error, refetch } = useMeStats(period);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="font-display text-xl text-gold">Stats</h2>
        <div className="inline-flex rounded-full bg-ink-800/80 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors min-h-[28px] ${
                period === p.value
                  ? 'bg-gold-400/20 text-gold-200'
                  : 'text-neutral-300 hover:text-neutral-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="animate-pulse space-y-2">
          <div className="h-12 bg-ink-800 rounded" />
          <div className="h-20 bg-ink-800 rounded" />
        </div>
      )}
      {isError && (
        <div>
          <p className="text-sm text-rose-300">Failed to load stats: {error.message}</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-gold-200 hover:text-gold-100">
            Retry
          </button>
        </div>
      )}

      {data && data.rounds === 0 && (
        <p className="text-sm text-neutral-200">No activity in this window.</p>
      )}

      {data && data.rounds > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Cell label="Rounds" value={data.rounds.toLocaleString('en-US')} />
            <Cell label="Win Rate" value={bpsToPct(data.win_rate_bps)} />
            <Cell label="Biggest Win" value={fmtUsdc(data.biggest_win)} suffix="NUSDC" />
            <Cell
              label="Net PnL"
              value={fmtUsdcSigned(data.net_pnl)}
              suffix="NUSDC"
              tone={(() => {
                try { return BigInt(data.net_pnl) >= 0n ? 'positive' : 'negative'; }
                catch { return undefined; }
              })()}
            />
          </div>

          {data.by_game.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-neutral-300 mb-2">By Game</h3>
              <ByGameBars rows={data.by_game} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface CellProps {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'positive' | 'negative';
}
function Cell({ label, value, suffix, tone }: CellProps) {
  const toneClass =
    tone === 'positive' ? 'text-emerald-300'
    : tone === 'negative' ? 'text-rose-300'
    : 'text-gold-200';
  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-neutral-300 block">{label}</span>
      <span className={`font-mono text-base ${toneClass}`}>{value}</span>
      {suffix && <span className="ml-1 text-xs text-neutral-300">{suffix}</span>}
    </div>
  );
}

function ByGameBars({ rows }: { rows: { game_id: number; key: string; rounds: number; net_pnl: string }[] }) {
  // Bar magnitude is proportional to |net_pnl| relative to the largest |net_pnl|
  // in the window. Color is sign-aware. Rounds count shown alongside.
  const magnitudes = rows.map((r) => {
    try { return BigInt(r.net_pnl) < 0n ? -BigInt(r.net_pnl) : BigInt(r.net_pnl); }
    catch { return 0n; }
  });
  const max = magnitudes.reduce((a, b) => (b > a ? b : a), 0n);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        let pct = 0;
        let positive = true;
        try {
          const v = BigInt(r.net_pnl);
          positive = v >= 0n;
          if (max > 0n) {
            const abs = positive ? v : -v;
            // Convert ratio via Number (max safe ~9e15; for casino raw units
            // this is OK at devnet scale, and we only need approximate bar size).
            pct = Number((abs * 1000n) / max) / 10;
          }
        } catch { /* ignore */ }
        return (
          <div key={r.game_id} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-neutral-200">{gameLabel(r.key)}</span>
            <div className="flex-1 h-5 rounded bg-ink-800 overflow-hidden">
              <div
                className={`h-full ${positive ? 'bg-emerald-500/50' : 'bg-rose-500/50'}`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <span className={`w-24 text-right font-mono ${positive ? 'text-emerald-300' : 'text-rose-300'}`}>
              {fmtUsdcSigned(magnitudes[i] * (positive ? 1n : -1n))}
            </span>
            <span className="w-14 text-right text-xs text-neutral-300">
              {r.rounds}r
            </span>
          </div>
        );
      })}
    </div>
  );
}
