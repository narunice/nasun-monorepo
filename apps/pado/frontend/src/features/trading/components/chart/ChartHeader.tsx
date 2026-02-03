/**
 * ChartHeader - Price display, indicator toggles, and interval selector
 */

import type { TimeInterval, IndicatorState } from './types';
import { INTERVAL_CONFIG } from './types';

interface ChartHeaderProps {
  pairLabel: string;
  lastPrice: { value: number; change: number } | null;
  indicators: IndicatorState;
  onToggleIndicator: (key: keyof IndicatorState) => void;
  interval: TimeInterval;
  onIntervalChange: (interval: TimeInterval) => void;
}

export function ChartHeader({
  pairLabel,
  lastPrice,
  indicators,
  onToggleIndicator,
  interval,
  onIntervalChange,
}: ChartHeaderProps) {
  return (
    <div className="flex items-center justify-between p-3 border-b border-theme-border">
      <div className="flex items-center gap-4">
        <span className="font-semibold">{pairLabel}</span>
        {lastPrice && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg xl:text-xl">
              ${lastPrice.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`text-sm xl:text-base ${lastPrice.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {lastPrice.change >= 0 ? '+' : ''}{lastPrice.change.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Indicator Toggles */}
        <div className="flex gap-1">
          <button
            onClick={() => onToggleIndicator('ma')}
            className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
              indicators.ma
                ? 'bg-yellow-600 text-white'
                : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
            }`}
            title="Toggle Moving Averages"
          >
            MA
          </button>
          <button
            onClick={() => onToggleIndicator('rsi')}
            className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
              indicators.rsi
                ? 'bg-purple-600 text-white'
                : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
            }`}
            title="Toggle RSI (Relative Strength Index)"
          >
            RSI
          </button>
          <button
            onClick={() => onToggleIndicator('macd')}
            className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
              indicators.macd
                ? 'bg-cyan-600 text-white'
                : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
            }`}
            title="Toggle MACD"
          >
            MACD
          </button>
        </div>

        {/* Interval Selector */}
        <div className="flex gap-1">
          {(Object.keys(INTERVAL_CONFIG) as TimeInterval[]).map((key) => (
            <button
              key={key}
              onClick={() => onIntervalChange(key)}
              className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
                interval === key
                  ? 'bg-blue-600 text-white'
                  : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
