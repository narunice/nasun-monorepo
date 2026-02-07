import { useTraderStats } from '../hooks/useTraderStats';
import { PERIOD_LABELS } from '../types';
import type { Period } from '../types';

interface MyRankCardProps {
  address: string;
}

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];

export function MyRankCard({ address }: MyRankCardProps) {
  const { data: stats, isLoading } = useTraderStats(address);

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-4 border border-theme-border animate-pulse">
        <div className="h-4 bg-theme-bg-tertiary rounded w-24 mb-3" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 bg-theme-bg-tertiary rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const hasAnyStats = PERIODS.some((p) => stats.stats[p] !== null);
  if (!hasAnyStats) return null;

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-4 border border-theme-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-theme-text-primary">My Ranking</h3>
        {stats.nickname && (
          <span className="text-xs text-theme-text-muted">{stats.nickname}</span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {PERIODS.map((period) => {
          const periodStats = stats.stats[period];
          return (
            <div key={period} className="text-center">
              <div className="text-xs text-theme-text-muted mb-1">
                {PERIOD_LABELS[period]}
              </div>
              {periodStats ? (
                <>
                  <div className="text-lg font-bold text-theme-text-primary">
                    #{periodStats.rank}
                  </div>
                  <div className="text-xs text-theme-text-muted">
                    ${parseFloat(periodStats.volume).toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </div>
                </>
              ) : (
                <div className="text-sm text-theme-text-muted">-</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
