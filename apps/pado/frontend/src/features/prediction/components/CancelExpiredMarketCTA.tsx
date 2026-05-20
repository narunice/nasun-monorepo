/**
 * CancelExpiredMarketCTA — handles two adjacent timeline states:
 *  - [closeTime, resolveDeadline)  → "Awaiting Resolution" amber banner with progress bar
 *  - [resolveDeadline, ∞)          → permissionless cancel button (round-6 plan §2.11)
 *
 * `now` is passed in from the page so we don't double-subscribe to useNow.
 */

import { useState } from 'react';
import type { PredictionMarket } from '../types';
import { usePredictionTrade } from '../hooks/usePredictionTrade';

interface Props {
  market: PredictionMarket;
  now: number;
  onSuccess?: () => void;
}

export function CancelExpiredMarketCTA({ market, now, onSuccess }: Props) {
  const { isLoading, cancelExpiredMarket } = usePredictionTrade();
  const [error, setError] = useState<string | null>(null);

  if (market.status !== 'open') return null;

  const isAwaiting = now >= market.closeTime && now < market.resolveDeadline;
  const isExpired = now >= market.resolveDeadline;

  if (!isAwaiting && !isExpired) return null;

  if (isAwaiting) {
    const windowMs = Math.max(1, market.resolveDeadline - market.closeTime);
    const progressPct = Math.min(100, Math.max(0, ((now - market.closeTime) / windowMs) * 100));
    const deadlineLabel = new Date(market.resolveDeadline).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    });

    return (
      <div className="rounded-xl border border-notice-border bg-notice-bg p-4">
        <div className="flex items-start gap-3">
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-notice-text"
            style={{ animation: 'spin 8s linear infinite' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" strokeLinecap="round" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-notice-text">
              Market Closed — Awaiting Resolution
            </p>
            <p className="mt-0.5 text-xs text-notice-text-muted leading-relaxed">
              The keeper bot will auto-resolve by{' '}
              <span className="font-mono text-notice-text">{deadlineLabel}</span>.
              If missed, anyone can cancel to recover collateral.
            </p>
            <div className="mt-2.5 space-y-1">
              <div className="h-1 w-full rounded-full bg-notice-track overflow-hidden">
                <div
                  className="h-full rounded-full bg-notice-bg-strong transition-all duration-1000"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-notice-text-muted">
                <span>Closed</span>
                <span>Resolution deadline</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleClick = async () => {
    setError(null);
    const result = await cancelExpiredMarket(market.id);
    if (result.success) onSuccess?.();
    else setError(result.error || 'Failed to cancel market');
  };

  return (
    <div className="bg-notice-bg border border-notice-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-notice-text mb-2">
        Resolution deadline passed
      </h3>
      <p className="text-sm text-theme-text-secondary mb-3">
        The resolver did not settle this market in time. Anyone can cancel it now,
        which lets every Position holder claim back half their collateral and lets
        every resting order owner reclaim their locked NUSDC.
      </p>
      {error && <div className="text-theme-error text-sm bg-predict-no-bg-soft rounded-lg p-2 mb-3">{error}</div>}
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="px-4 py-2 bg-theme-warning hover:opacity-90 text-white font-medium rounded-lg transition-opacity disabled:opacity-50"
      >
        {isLoading ? 'Cancelling...' : 'Cancel expired market'}
      </button>
    </div>
  );
}
