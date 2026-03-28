/**
 * LeisureSummaryCards
 * Displays Total Spent, Total Payouts, Net P&L with win rate.
 */
import { formatNusdc } from '../../../lib/format';
import type { LeisureSummary } from '../types';

interface Props {
  summary: LeisureSummary;
  isLoading: boolean;
}

function SkeletonCard() {
  return (
    <div className="bg-theme-bg-secondary rounded-lg p-4 animate-pulse">
      <div className="h-3 w-20 bg-theme-bg-tertiary rounded mb-3" />
      <div className="h-6 w-24 bg-theme-bg-tertiary rounded" />
    </div>
  );
}

export function LeisureSummaryCards({ summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const netPnlColor =
    summary.netPnl > 0n
      ? 'text-green-600 dark:text-green-400'
      : summary.netPnl < 0n
        ? 'text-red-600 dark:text-red-400'
        : 'text-theme-text';

  const netPnlPrefix = summary.netPnl > 0n ? '+' : '';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          <div className="text-xs text-theme-text-muted mb-1">Total Spent</div>
          <div className="text-lg font-semibold text-theme-text">
            {formatNusdc(summary.totalSpent)} <span className="text-xs text-theme-text-muted">NUSDC</span>
          </div>
        </div>
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          <div className="text-xs text-theme-text-muted mb-1">Total Payouts</div>
          <div className="text-lg font-semibold text-theme-text">
            {formatNusdc(summary.totalPayouts)} <span className="text-xs text-theme-text-muted">NUSDC</span>
          </div>
        </div>
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          <div className="text-xs text-theme-text-muted mb-1">Net P&L</div>
          <div className={`text-lg font-semibold ${netPnlColor}`}>
            {netPnlPrefix}{formatNusdc(summary.netPnl)} <span className="text-xs text-theme-text-muted">NUSDC</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 text-xs text-theme-text-muted px-1">
        <span>{summary.totalGames} games</span>
        <span>{summary.winCount} wins ({summary.winRate}%)</span>
        {summary.isTruncated && (
          <span className="text-yellow-600 dark:text-yellow-400">Showing recent history only</span>
        )}
      </div>
    </div>
  );
}
