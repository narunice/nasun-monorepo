import type { ScoreLeaderboardTrader } from '../types';
import { ScoreTraderRow } from './ScoreTraderRow';
import { SkeletonTable } from '@/components/common';
import { useFollowedTraders } from '../hooks/useFollowedTraders';

interface ScoreLeaderboardTableProps {
  traders: ScoreLeaderboardTrader[];
  isLoading: boolean;
  currentUserAddress?: string | null;
  followFilter?: boolean;
}

export function ScoreLeaderboardTable({ traders, isLoading, currentUserAddress, followFilter }: ScoreLeaderboardTableProps) {
  const { isFollowing } = useFollowedTraders();

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <SkeletonTable rows={10} cols={6} />
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
            <p className="text-xs mt-1">Star traders to track them here</p>
          </>
        ) : (
          <>
            <p className="text-sm">No score data yet</p>
            <p className="text-xs mt-1">Trade on any pool to start earning score</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-xs text-theme-text-muted border-b border-theme-border">
            <th className="py-3 px-3 text-left font-medium w-20">Rank</th>
            <th className="py-3 px-3 text-left font-medium">Trader</th>
            <th className="py-3 px-3 text-right font-medium">Score</th>
            <th className="py-3 px-3 text-right font-medium">Volume</th>
            <th className="py-3 px-3 text-right font-medium">Trades</th>
            <th className="py-3 px-3 text-center font-medium w-16">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border/50">
          {displayTraders.map((trader) => (
            <ScoreTraderRow
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
