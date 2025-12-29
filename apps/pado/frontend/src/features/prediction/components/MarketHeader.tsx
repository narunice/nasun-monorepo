/**
 * MarketHeader Component
 * Displays market information header with countdown timer
 */

import { useState, useEffect } from 'react';
import type { PredictionMarket, Orderbook } from '../types';
import { calculateProbabilityFromOrderbook } from '../types';

interface MarketHeaderProps {
  market: PredictionMarket;
  yesOrderbook?: Orderbook | null;
  noOrderbook?: Orderbook | null;
}

export function MarketHeader({ market, yesOrderbook, noOrderbook }: MarketHeaderProps) {
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining(market.closeTime));
  const { yesProbability, noProbability } = calculateProbabilityFromOrderbook(
    yesOrderbook ?? null,
    noOrderbook ?? null
  );

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(getTimeRemaining(market.closeTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [market.closeTime]);

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4 md:p-6">
      {/* Category & Status */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
          {market.category}
        </span>
        <StatusBadge status={market.status} outcome={market.outcome} />
      </div>

      {/* Question */}
      <h1 className="text-xl md:text-2xl font-bold text-theme-text-primary mb-4">
        {market.question}
      </h1>

      {/* Description */}
      {market.description && (
        <p className="text-sm text-theme-text-secondary mb-4">
          {market.description}
        </p>
      )}

      {/* Probability Display */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-green-100 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {yesProbability.toFixed(1)}%
          </div>
          <div className="text-sm text-green-600 dark:text-green-400">YES</div>
        </div>
        <div className="bg-red-100 dark:bg-red-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {noProbability.toFixed(1)}%
          </div>
          <div className="text-sm text-red-600 dark:text-red-400">NO</div>
        </div>
      </div>

      {/* Probability Bar */}
      <div className="mb-4">
        <div className="h-3 bg-red-500 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${yesProbability}%` }}
          />
        </div>
      </div>

      {/* Timer & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2">
          <ClockIcon />
          <span className="text-theme-text-secondary">
            {market.status === 'open' ? timeRemaining : 'Market Closed'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-theme-text-muted">
          <span>Supply: {formatNumber(market.yesSupply + market.noSupply)}</span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, outcome }: { status: string; outcome?: boolean }) {
  if (status === 'resolved') {
    const label = outcome ? 'YES Won' : 'NO Won';
    const color = outcome
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return <span className={`text-xs font-medium px-2 py-1 rounded ${color}`}>{label}</span>;
  }

  if (status === 'closed') {
    return (
      <span className="text-xs font-medium px-2 py-1 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        Awaiting Result
      </span>
    );
  }

  return (
    <span className="text-xs font-medium px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      Open
    </span>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4 text-theme-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function getTimeRemaining(closeTime: number): string {
  const now = Date.now();
  const diff = closeTime - now;

  if (diff <= 0) return 'Closed';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatNumber(value: bigint): string {
  const num = Number(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
