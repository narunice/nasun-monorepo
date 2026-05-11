/**
 * MobileTradeStickyBar — fixed bottom bar (lg:hidden) above MobileBottomNav (z-50).
 *
 * Tapping BUY YES/NO scrolls to the existing trade form (id="trade-form") and
 * pre-selects the outcome via parent callback. No second OutcomeOrderForm
 * instance — desktop and mobile share the same form state.
 */

import { useCallback } from 'react';
import type { MarketStatus } from '../types';

interface MobileTradeStickyBarProps {
  yesProbability: number;
  noProbability: number;
  marketStatus: MarketStatus;
  isTradingFrozen: boolean;
  onSelectOutcome: (outcome: 'yes' | 'no') => void;
}

export function MobileTradeStickyBar({
  yesProbability,
  noProbability,
  marketStatus,
  isTradingFrozen,
  onSelectOutcome,
}: MobileTradeStickyBarProps) {
  const scrollToForm = useCallback(
    (outcome: 'yes' | 'no') => {
      onSelectOutcome(outcome);
      document.getElementById('trade-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    },
    [onSelectOutcome],
  );

  const isOpen = marketStatus === 'open' && !isTradingFrozen;

  return (
    <div
      className="fixed bottom-14 left-0 right-0 z-[60] lg:hidden px-3 py-2 bg-theme-bg-primary/80 backdrop-blur-md border-t border-theme-border/30"
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      {isOpen && (
        <div className="flex gap-2">
          <button
            onClick={() => scrollToForm('yes')}
            className="relative flex-1 h-12 rounded-lg overflow-hidden bg-green-600/30 border border-green-500/60 hover:border-green-400 active:scale-[0.98] transition-all duration-150 group"
          >
            <div
              className="absolute inset-y-0 left-0 bg-green-500/50 group-hover:bg-green-500/60 transition-all duration-300"
              style={{ width: `${yesProbability}%` }}
            />
            <div className="relative flex items-center justify-center gap-2 h-full">
              <span className="text-sm font-bold text-white tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">BUY YES</span>
              <span className="text-base font-mono font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {yesProbability.toFixed(1)}%
              </span>
            </div>
          </button>

          <button
            onClick={() => scrollToForm('no')}
            className="relative flex-1 h-12 rounded-lg overflow-hidden bg-red-600/30 border border-red-500/60 hover:border-red-400 active:scale-[0.98] transition-all duration-150 group"
          >
            <div
              className="absolute inset-y-0 left-0 bg-red-500/50 group-hover:bg-red-500/60 transition-all duration-300"
              style={{ width: `${noProbability}%` }}
            />
            <div className="relative flex items-center justify-center gap-2 h-full">
              <span className="text-sm font-bold text-white tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">BUY NO</span>
              <span className="text-base font-mono font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {noProbability.toFixed(1)}%
              </span>
            </div>
          </button>
        </div>
      )}

      {marketStatus === 'open' && isTradingFrozen && (
        <div className="flex items-center justify-center gap-2 h-12 rounded-lg bg-yellow-500/25 border border-yellow-500/50">
          <svg
            className="h-3.5 w-3.5 text-yellow-500"
            style={{ animation: 'spin 8s linear infinite' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-medium text-yellow-400">Awaiting Resolution</span>
        </div>
      )}

      {(marketStatus === 'resolved' || marketStatus === 'cancelled') && (
        <div className="flex items-center justify-center h-12 rounded-lg bg-theme-bg-tertiary border border-theme-border/40">
          <span className="text-sm font-medium text-theme-text-muted">
            {marketStatus === 'resolved' ? 'Market Resolved' : 'Market Cancelled'}
          </span>
        </div>
      )}
    </div>
  );
}
