import type { LeaderboardTrader } from '../types';
import { TraderRow } from './TraderRow';
import { SkeletonTable } from '@/components/common';

interface LeaderboardTableProps {
  traders: LeaderboardTrader[];
  isLoading: boolean;
  currentUserAddress?: string | null;
}

export function LeaderboardTable({ traders, isLoading, currentUserAddress }: LeaderboardTableProps) {
  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <SkeletonTable rows={10} cols={5} />
      </div>
    );
  }

  if (traders.length === 0) {
    return (
      <div className="text-center text-theme-text-muted py-12">
        <p className="text-sm">No traders yet</p>
        <p className="text-xs mt-1">Start trading to appear on the leaderboard</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-xs text-theme-text-muted border-b border-theme-border">
            <th className="py-3 px-3 text-left font-medium w-16">Rank</th>
            <th className="py-3 px-3 text-left font-medium">Trader</th>
            <th className="py-3 px-3 text-right font-medium">Volume</th>
            <th className="py-3 px-3 text-right font-medium">Trades</th>
            <th className="py-3 px-3 text-center font-medium w-16">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border/50">
          {traders.map((trader) => (
            <TraderRow
              key={trader.address}
              trader={trader}
              isCurrentUser={currentUserAddress === trader.address}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
