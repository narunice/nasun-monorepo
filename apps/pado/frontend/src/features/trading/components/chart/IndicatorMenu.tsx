/**
 * IndicatorMenu - Dropdown menu for toggling chart indicators
 *
 * Replaces the 3 fixed toggle buttons (MA/RSI/MACD) with a single
 * dropdown that supports 7 indicators organized by category.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { IndicatorState, IndicatorId } from './types';

interface IndicatorDef {
  id: IndicatorId;
  label: string;
  paramsLabel: string;
}

const OVERLAYS: IndicatorDef[] = [
  { id: 'sma', label: 'SMA', paramsLabel: '5, 20' },
  { id: 'ema', label: 'EMA', paramsLabel: '9, 21' },
  { id: 'bb', label: 'Bollinger', paramsLabel: '20, 2.0' },
  { id: 'vwap', label: 'VWAP', paramsLabel: 'session' },
  { id: 'ichimoku', label: 'Ichimoku', paramsLabel: '9, 26, 52' },
];

const OSCILLATORS: IndicatorDef[] = [
  { id: 'rsi', label: 'RSI', paramsLabel: '14' },
  { id: 'macd', label: 'MACD', paramsLabel: '12, 26, 9' },
  { id: 'stoch', label: 'Stochastic', paramsLabel: '14, 3, 3' },
  { id: 'atr', label: 'ATR', paramsLabel: '14' },
];

interface IndicatorMenuProps {
  indicators: IndicatorState;
  onToggleIndicator: (id: IndicatorId) => void;
}

export function IndicatorMenu({ indicators, onToggleIndicator }: IndicatorMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeCount = Object.values(indicators).filter((c) => c.enabled).length;

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  const renderRow = (def: IndicatorDef) => {
    const enabled = indicators[def.id].enabled;
    return (
      <button
        key={def.id}
        onClick={() => onToggleIndicator(def.id)}
        className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-theme-bg-tertiary transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
            enabled
              ? 'bg-orange-600 border-orange-600'
              : 'border-theme-border'
          }`}>
            {enabled && (
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
                <path d="M2 6l3 3 5-5" />
              </svg>
            )}
          </div>
          <span className="text-xs text-theme-text-primary">{def.label}</span>
        </div>
        <span className="text-[10px] text-theme-text-muted font-mono">{def.paramsLabel}</span>
      </button>
    );
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors flex items-center gap-1 ${
          isOpen
            ? 'bg-orange-600 text-white'
            : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
        }`}
        title="Chart Indicators"
        aria-label="Chart Indicators"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span>Indicators</span>
        {activeCount > 0 && (
          <span className={`ml-0.5 min-w-[16px] h-4 rounded-full text-[10px] flex items-center justify-center leading-none ${
            isOpen ? 'bg-white/20 text-white' : 'bg-orange-500/20 text-orange-400'
          }`}>
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 py-1">
          {/* Overlays */}
          <div className="px-2 pt-1 pb-0.5">
            <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-wider">Overlays</span>
          </div>
          {OVERLAYS.map(renderRow)}

          {/* Divider */}
          <div className="my-1 border-t border-theme-border" />

          {/* Oscillators */}
          <div className="px-2 pt-0.5 pb-0.5">
            <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-wider">Oscillators</span>
          </div>
          {OSCILLATORS.map(renderRow)}
        </div>
      )}
    </div>
  );
}
