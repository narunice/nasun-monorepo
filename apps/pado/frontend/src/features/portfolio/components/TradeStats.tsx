/**
 * TradeStats Component
 * Display trading statistics summary
 */

import { useWallet } from '@nasun/wallet';
import { useTradeHistory } from '../hooks/useTradeHistory';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'default' | 'green' | 'red';
}

function StatCard({ label, value, subValue, color = 'default' }: StatCardProps) {
  const valueColor =
    color === 'green'
      ? 'text-green-600 dark:text-green-400'
      : color === 'red'
      ? 'text-red-600 dark:text-red-400'
      : 'text-theme-text-primary';

  return (
    <div className="bg-theme-bg-tertiary rounded-lg p-4">
      <div className="text-xs text-theme-text-secondary mb-1">{label}</div>
      <div className={`text-lg font-semibold ${valueColor}`}>{value}</div>
      {subValue && (
        <div className="text-xs text-theme-text-muted mt-1">{subValue}</div>
      )}
    </div>
  );
}

export function TradeStats() {
  const { status } = useWallet();
  const { stats, isLoading } = useTradeHistory();

  const isConnected = status === 'unlocked';

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-4">Trading Statistics</h2>
        <div className="text-center text-theme-text-muted py-4">
          Connect wallet to view your trading statistics
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-4">Trading Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-theme-bg-tertiary rounded-lg p-4 animate-pulse">
              <div className="h-3 bg-theme-bg-secondary rounded w-16 mb-2" />
              <div className="h-5 bg-theme-bg-secondary rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-6">
      <h2 className="font-semibold mb-4">Trading Statistics</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Trades"
          value={stats.totalTrades}
          subValue={`${stats.buyTrades} buys / ${stats.sellTrades} sells`}
        />
        <StatCard
          label="Total Volume"
          value={formatVolume(stats.totalVolume)}
          subValue={`Avg ${formatVolume(stats.avgTradeSize)}`}
        />
        <StatCard
          label="Buy Volume"
          value={formatVolume(stats.buyVolume)}
          color="green"
        />
        <StatCard
          label="Sell Volume"
          value={formatVolume(stats.sellVolume)}
          color="red"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-theme-border text-sm text-theme-text-secondary">
        Last trade: {formatTime(stats.lastTradeTime)}
      </div>
    </div>
  );
}
