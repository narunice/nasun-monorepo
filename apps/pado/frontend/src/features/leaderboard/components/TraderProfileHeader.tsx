import { NETWORK_CONFIG } from '../../../config/network';
import { RankBadge } from './RankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import type { TraderStatsResponse } from '../types';
import { PERIOD_LABELS } from '../types';
import type { Period } from '../types';

interface TraderProfileHeaderProps {
  address: string;
  stats: TraderStatsResponse | undefined;
  isLoading: boolean;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatVolume(volumeStr: string): string {
  const num = parseFloat(volumeStr);
  if (isNaN(num)) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];

export function TraderProfileHeader({ address, stats, isLoading }: TraderProfileHeaderProps) {
  const nickname = stats?.nickname;
  const explorerUrl = NETWORK_CONFIG.explorerUrl;

  return (
    <div className="bg-theme-bg-secondary rounded-lg border border-theme-border p-5">
      {/* Identity */}
      <div className="flex items-center justify-between mb-4">
        <div>
          {nickname ? (
            <div>
              <h2 className="text-lg font-semibold text-theme-text-primary">
                {nickname}
              </h2>
              <p className="text-sm text-theme-text-muted font-mono mt-0.5">
                {shortenAddress(address)}
              </p>
            </div>
          ) : (
            <h2 className="text-lg font-semibold text-theme-text-primary font-mono">
              {shortenAddress(address)}
            </h2>
          )}
        </div>
        {explorerUrl && (
          <a
            href={`${explorerUrl}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-pd3 hover:text-pd3/80 transition-colors"
          >
            View on Explorer
          </a>
        )}
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {PERIODS.map((p) => (
            <div key={p} className="animate-pulse">
              <div className="h-3 bg-theme-bg-tertiary rounded w-8 mb-2" />
              <div className="h-5 bg-theme-bg-tertiary rounded w-12 mb-1" />
              <div className="h-3 bg-theme-bg-tertiary rounded w-16" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {PERIODS.map((period) => {
            const periodStats = stats?.stats[period];
            return (
              <div
                key={period}
                className="bg-theme-bg-primary rounded-lg p-3 text-center"
              >
                <div className="text-xs font-medium text-theme-text-muted mb-1.5">
                  {PERIOD_LABELS[period]}
                </div>
                {periodStats ? (
                  <>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <RankBadge rank={periodStats.rank} />
                      <RankChangeIndicator change={periodStats.rankChange} />
                    </div>
                    <div className="text-sm font-mono text-theme-text-primary">
                      {formatVolume(periodStats.volume)}
                    </div>
                    <div className="text-xs text-theme-text-muted mt-0.5">
                      {periodStats.tradeCount} trades
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-theme-text-muted py-2">
                    No activity
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
