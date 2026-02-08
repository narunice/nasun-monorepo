/**
 * ChartHeader - Price display, indicator menu, and interval selector
 */

import type { ReactNode } from 'react';
import type { TimeInterval, IndicatorState, IndicatorId } from './types';
import { INTERVAL_CONFIG } from './types';
import { IndicatorMenu } from './IndicatorMenu';

interface ChartHeaderProps {
  pairLabel: string;
  lastPrice: { value: number; change: number } | null;
  indicators: IndicatorState;
  onToggleIndicator: (id: IndicatorId) => void;
  interval: TimeInterval;
  onIntervalChange: (interval: TimeInterval) => void;
  /** Slot for PriceAlertPopover (bell icon) */
  priceAlertSlot?: ReactNode;
  /** Slot for NotificationSettings (speaker icon) */
  notificationSlot?: ReactNode;
}

export function ChartHeader({
  pairLabel,
  lastPrice,
  indicators,
  onToggleIndicator,
  interval,
  onIntervalChange,
  priceAlertSlot,
  notificationSlot,
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
        {/* Indicator Menu */}
        <IndicatorMenu
          indicators={indicators}
          onToggleIndicator={onToggleIndicator}
        />

        {/* Divider + Alert/Notification Icons */}
        {(priceAlertSlot || notificationSlot) && (
          <div className="flex items-center gap-1 border-l border-theme-border pl-2">
            {priceAlertSlot}
            {notificationSlot}
          </div>
        )}

        {/* Interval Selector */}
        <div className="flex gap-1">
          {(Object.keys(INTERVAL_CONFIG) as TimeInterval[]).map((key) => (
            <button
              key={key}
              onClick={() => onIntervalChange(key)}
              className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
                interval === key
                  ? 'bg-pd1 text-white'
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
