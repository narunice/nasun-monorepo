/**
 * MarketCard Component
 * Displays a prediction market in card format
 */

import { Link } from 'react-router-dom';
import type { PredictionMarket, Orderbook } from '../types';
import { calculateProbabilityFromOrderbook } from '../types';
import { NUSDC_DECIMALS } from '../constants';

interface MarketCardProps {
  market: PredictionMarket;
  yesOrderbook?: Orderbook | null;
}

export function MarketCard({ market, yesOrderbook }: MarketCardProps) {
  const { yesProbability, noProbability } = calculateProbabilityFromOrderbook(
    yesOrderbook ?? null,
    null
  );

  const timeRemaining = getTimeRemaining(market.closeTime);
  const volume = formatVolume(market.totalVolume);

  const statusBadge = getStatusBadge(market.status, market.outcome);

  return (
    <Link
      to={`/predict/${market.id}`}
      className="block bg-gray-100 dark:bg-zinc-800 rounded-xl p-4 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
    >
      {/* Header: Category & Status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded">
          {market.category}
        </span>
        {statusBadge}
      </div>

      {/* Question */}
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 line-clamp-2">
        {market.question}
      </h3>

      {/* Probability Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-green-600 dark:text-green-400 font-medium">
            YES {yesProbability.toFixed(0)}%
          </span>
          <span className="text-red-600 dark:text-red-400 font-medium">
            NO {noProbability.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 bg-gray-300 dark:bg-zinc-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${yesProbability}%` }}
          />
        </div>
      </div>

      {/* Footer: Volume & Time */}
      <div className="flex justify-between text-xs text-gray-500 dark:text-zinc-400">
        <span>Volume: {volume}</span>
        <span>{timeRemaining}</span>
      </div>
    </Link>
  );
}

function getTimeRemaining(closeTime: number): string {
  const now = Date.now();
  const diff = closeTime - now;

  if (diff <= 0) return 'Closed';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m left`;
}

function formatVolume(volume: bigint): string {
  const value = Number(volume) / Math.pow(10, NUSDC_DECIMALS);
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function getStatusBadge(
  status: string,
  outcome?: boolean
): React.ReactNode {
  if (status === 'resolved') {
    const label = outcome ? 'YES Won' : 'NO Won';
    const color = outcome
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return (
      <span className={`text-xs font-medium px-2 py-1 rounded ${color}`}>
        {label}
      </span>
    );
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
