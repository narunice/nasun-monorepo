import type { LeaderboardTrader } from '../types';
import { TraderRow } from './TraderRow';
import { SkeletonTable } from '@/components/common';
import { useFollowedTraders } from '../hooks/useFollowedTraders';

interface LeaderboardTableProps {
  traders: LeaderboardTrader[];
  isLoading: boolean;
  currentUserAddress?: string | null;
  followFilter?: boolean;
}

export function LeaderboardTable({ traders, isLoading, currentUserAddress, followFilter }: LeaderboardTableProps) {
  const { isFollowing } = useFollowedTraders();

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <SkeletonTable rows={10} cols={4} />
      </div>
    );
  }

  const displayTraders = followFilter
    ? traders.filter(t => isFollowing(t.address))
    : traders;

  if (displayTraders.length === 0) {
    return (
      <div className="text-center text-theme-text-muted py-12">
        {followFilter ? (
          <>
            <p className="text-sm">Not following any traders yet</p>
            <p className="text-sm mt-1 opacity-70">Star traders to track them here</p>
          </>
        ) : (
          <>
            <p className="text-sm">No traders yet</p>
            <p className="text-sm mt-1 opacity-70">Start trading to appear on the leaderboard</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-sm text-theme-text-muted border-b border-theme-border">
            <th className="py-3 px-3 text-left font-medium w-20">Rank</th>
            <th className="py-3 px-3 text-left font-medium">Trader</th>
            <th className="py-3 px-3 text-right font-medium">Volume</th>
            <th className="py-3 px-3 text-right font-medium">Trades</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border/50">
          {displayTraders.map((trader) => (
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
