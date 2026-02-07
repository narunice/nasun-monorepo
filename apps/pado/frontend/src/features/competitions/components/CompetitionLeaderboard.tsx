import { useNavigate } from 'react-router-dom';
import { RankBadge } from '../../leaderboard/components/RankBadge';
import type { CompetitionTrader } from '../types';

interface CompetitionLeaderboardProps {
  traders: CompetitionTrader[];
  isLoading: boolean;
  currentUserAddress?: string | null;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatVolume(volumeUsd: string): string {
  const num = parseFloat(volumeUsd);
  if (isNaN(num)) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function CompetitionLeaderboard({ traders, isLoading, currentUserAddress }: CompetitionLeaderboardProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-4">
            <div className="h-4 bg-theme-bg-tertiary rounded w-8" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-32" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-20" />
            <div className="h-4 bg-theme-bg-tertiary rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (traders.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-theme-text-muted">
        No participants yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-theme-border">
            <th className="text-left py-2.5 px-3 text-xs font-medium text-theme-text-muted w-12">Rank</th>
            <th className="text-left py-2.5 px-3 text-xs font-medium text-theme-text-muted">Trader</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-theme-text-muted">Volume</th>
            <th className="text-right py-2.5 px-3 text-xs font-medium text-theme-text-muted">Trades</th>
          </tr>
        </thead>
        <tbody>
          {traders.map((trader) => {
            const isCurrentUser = currentUserAddress === trader.address;
            const displayName = trader.nickname || shortenAddress(trader.address);

            return (
              <tr
                key={trader.address}
                onClick={() => navigate(`/leaderboard/trader/${trader.address}`)}
                className={`border-b border-theme-border/50 transition-colors cursor-pointer ${
                  isCurrentUser
                    ? 'bg-pd3/5 hover:bg-pd3/10'
                    : 'hover:bg-theme-bg-tertiary/30'
                }`}
              >
                <td className="py-2.5 px-3">
                  <RankBadge rank={trader.rank} />
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex flex-col">
                    <span className={`text-sm font-medium ${isCurrentUser ? 'text-pd3' : 'text-theme-text-primary'}`}>
                      {displayName}
                    </span>
                    {trader.nickname && (
                      <span className="text-xs text-theme-text-muted font-mono">
                        {shortenAddress(trader.address)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className="text-sm font-mono text-theme-text-primary">
                    {formatVolume(trader.volumeUsd)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className="text-sm text-theme-text-secondary">
                    {trader.tradeCount.toLocaleString()}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
