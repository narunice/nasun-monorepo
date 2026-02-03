/**
 * OhlcvOverlay - Displays OHLCV data on crosshair hover
 */

import type { OhlcvData, IndicatorState, TimeInterval } from './types';

interface OhlcvOverlayProps {
  data: OhlcvData | null;
  baseSymbol: string;
  interval: TimeInterval;
  isRealData: boolean;
  indicators: IndicatorState;
}

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

      {/* Indicator Legends */}
      {(indicators.ma || indicators.rsi || indicators.macd) && (
        <div className="flex items-center gap-4 px-3 py-1 text-xs xl:text-sm border-b border-theme-border/50">
          {indicators.ma && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-yellow-400"></span>
                <span className="text-theme-text-muted">MA5</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-blue-400"></span>
                <span className="text-theme-text-muted">MA20</span>
              </span>
            </>
          )}
          {indicators.rsi && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-purple-400"></span>
              <span className="text-theme-text-muted">RSI(14)</span>
            </span>
          )}
          {indicators.macd && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-cyan-400"></span>
                <span className="text-theme-text-muted">MACD</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-orange-400"></span>
                <span className="text-theme-text-muted">Signal</span>
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
