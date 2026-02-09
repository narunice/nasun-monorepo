import { useMemo } from 'react';
import type { TraderStatsResponse, TraderFill } from '../types';
import type { TraderClassification } from '../hooks/useTraderClassification';

interface PerformanceSummaryProps {
  stats: TraderStatsResponse | undefined;
  fills: TraderFill[];
  classification: TraderClassification;
  isLoading: boolean;
}

function formatUsd(num: number): string {
  if (isNaN(num) || num === 0) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

const STYLE_COLORS: Record<string, string> = {
  'scalper': 'text-red-400',
  'day-trader': 'text-orange-400',
  'swing-trader': 'text-blue-400',
  'holder': 'text-emerald-400',
};

function computeMetrics(stats: TraderStatsResponse | undefined, fills: TraderFill[]) {
  const allStats = stats?.stats['all'];
  const totalVolume = allStats ? parseFloat(allStats.volume) : 0;
  const totalTrades = allStats?.tradeCount ?? 0;
  const avgTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;

  // Best rank across all periods
  let bestRank = Infinity;
  if (stats) {
    for (const periodStats of Object.values(stats.stats)) {
      if (periodStats && periodStats.rank < bestRank) {
        bestRank = periodStats.rank;
      }
    }
  }
  if (!isFinite(bestRank)) bestRank = 0;

  // Largest single trade from fills
  let largestTrade = 0;
  for (const fill of fills) {
    const q = parseFloat(fill.quoteQuantity);
    if (q > largestTrade) largestTrade = q;
  }

  // Unique pools from all-time stats
  const uniquePools = allStats?.uniquePools ?? 0;

  return { totalVolume, totalTrades, avgTradeSize, bestRank, largestTrade, uniquePools };
}

export function PerformanceSummary({ stats, fills, classification, isLoading }: PerformanceSummaryProps) {
  const metrics = useMemo(() => computeMetrics(stats, fills), [stats, fills]);

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg border border-theme-border p-5">
        <div className="h-4 bg-theme-bg-tertiary rounded w-40 mb-4 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-theme-bg-tertiary rounded w-20 mb-2" />
              <div className="h-5 bg-theme-bg-tertiary rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg border border-theme-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-theme-text-primary">Performance Summary</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-theme-bg-tertiary ${STYLE_COLORS[classification.style] ?? 'text-theme-text-muted'}`}>
          {classification.label}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <MetricCard label="Total Volume" value={formatUsd(metrics.totalVolume)} />
        <MetricCard label="Total Trades" value={metrics.totalTrades.toLocaleString()} />
        <MetricCard label="Avg Trade Size" value={formatUsd(metrics.avgTradeSize)} />
        <MetricCard label="Largest Trade" value={formatUsd(metrics.largestTrade)} />
        <MetricCard
          label="Best Rank"
          value={metrics.bestRank > 0 ? `#${metrics.bestRank}` : '--'}
        />
        <MetricCard label="Markets Traded" value={metrics.uniquePools.toString()} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-theme-text-muted mb-1">{label}</div>
      <div className="text-sm font-mono font-medium text-theme-text-primary">{value}</div>
    </div>
  );
}
