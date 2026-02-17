import { Card } from '../ui/Card';
import { formatCompactNumber } from '../../lib/analytics/analytics-aggregator';
import type { AnalyticsSummary } from '../../lib/analytics/types';

interface SummaryCardsProps {
  summary: AnalyticsSummary | undefined;
  last24hTrades: number;
  isLoading: boolean;
}

export function SummaryCards({ summary, last24hTrades, isLoading }: SummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} variant="default" className="p-4 animate-pulse">
            <div className="h-3 w-20 bg-muted/40 rounded mb-3" />
            <div className="h-7 w-24 bg-muted/40 rounded" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Total Transactions"
        value={summary ? formatCompactNumber(summary.totalTx) : '-'}
      />
      <MetricCard
        title="24h Transactions"
        value={summary ? formatCompactNumber(summary.last24hTx) : '-'}
        trend={summary?.trends.tx24h}
      />
      <MetricCard
        title="Avg TPS (24h)"
        value={summary ? `${summary.avgTps} tx/s` : '-'}
      />
      <MetricCard
        title="24h Trades"
        value={last24hTrades > 0 ? formatCompactNumber(last24hTrades) : '-'}
      />
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  trend?: number;
}

function MetricCard({ title, value, trend }: MetricCardProps) {
  const hasTrend = trend !== undefined && !isNaN(trend);
  const isPositive = hasTrend && trend > 0;
  const isNegative = hasTrend && trend < 0;

  return (
    <Card variant="default" className="p-4">
      <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2">{title}</div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {hasTrend && (
        <div
          className={`text-sm mt-1 ${
            isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground'
          }`}
        >
          {isPositive ? '+' : ''}
          {trend.toFixed(1)}%{' '}
          {isPositive ? '\u2191' : isNegative ? '\u2193' : ''}
        </div>
      )}
    </Card>
  );
}
