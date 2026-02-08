/**
 * OhlcvOverlay - Displays OHLCV data on crosshair hover + dynamic indicator legends
 */

import type { OhlcvData, IndicatorState, IndicatorId, TimeInterval } from './types';

interface OhlcvOverlayProps {
  data: OhlcvData | null;
  baseSymbol: string;
  interval: TimeInterval;
  isRealData: boolean;
  indicators: IndicatorState;
}

interface LegendEntry {
  label: string;
  color: string;
}

const INDICATOR_LEGENDS: Record<IndicatorId, LegendEntry[]> = {
  sma:   [{ label: 'SMA5', color: '#fbbf24' }, { label: 'SMA20', color: '#3b82f6' }],
  ema:   [{ label: 'EMA9', color: '#f97316' }, { label: 'EMA21', color: '#8b5cf6' }],
  bb:    [{ label: 'BB', color: '#6366f1' }],
  rsi:   [{ label: 'RSI(14)', color: '#a855f7' }],
  macd:  [{ label: 'MACD', color: '#22d3ee' }, { label: 'Signal', color: '#fb923c' }],
  stoch: [{ label: '%K', color: '#22d3ee' }, { label: '%D', color: '#f97316' }],
  atr:   [{ label: 'ATR(14)', color: '#f59e0b' }],
};

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toFixed(2);
}

export function OhlcvOverlay({ data, baseSymbol, interval, isRealData, indicators }: OhlcvOverlayProps) {
  if (!data) return null;

  const isUp = data.close >= data.open;
  const colorClass = isUp ? 'text-green-400' : 'text-red-400';

  const activeIds = (Object.keys(indicators) as IndicatorId[]).filter(
    (id) => indicators[id].enabled
  );

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-1 text-xs xl:text-sm font-mono border-b border-theme-border/50">
        <span className="text-theme-text-muted">{baseSymbol} · {interval} · {isRealData ? 'Lighter' : 'Sim'}</span>
        <span className="text-theme-text-muted">O<span className={colorClass}>{fmt(data.open)}</span></span>
        <span className="text-theme-text-muted">H<span className={colorClass}>{fmt(data.high)}</span></span>
        <span className="text-theme-text-muted">L<span className={colorClass}>{fmt(data.low)}</span></span>
        <span className="text-theme-text-muted">C<span className={colorClass}>{fmt(data.close)}</span></span>
        <span className="text-theme-text-muted">Volume <span className="text-theme-text-secondary">{fmtVol(data.volume)}</span></span>
      </div>

      {/* Dynamic Indicator Legends */}
      {activeIds.length > 0 && (
        <div className="flex items-center gap-4 px-3 py-1 text-xs xl:text-sm border-b border-theme-border/50">
          {activeIds.map((id) =>
            INDICATOR_LEGENDS[id].map((entry) => (
              <span key={`${id}-${entry.label}`} className="flex items-center gap-1">
                <span className="w-3 h-0.5" style={{ backgroundColor: entry.color }} />
                <span className="text-theme-text-muted">{entry.label}</span>
              </span>
            ))
          )}
        </div>
      )}
    </>
  );
}
