import type { ScoreLeaderboardTrader } from '../types';
import { ScoreTraderRow } from './ScoreTraderRow';
import { SkeletonTable } from '@/components/common';
import { useFollowedTraders } from '../hooks/useFollowedTraders';

interface ScoreLeaderboardTableProps {
  traders: ScoreLeaderboardTrader[];
  isLoading: boolean;
  currentUserAddress?: string | null;
  followFilter?: boolean;
  highlightedAddress?: string | null;
}

export function ScoreLeaderboardTable({ traders, isLoading, currentUserAddress, followFilter, highlightedAddress }: ScoreLeaderboardTableProps) {
  const { isFollowing } = useFollowedTraders();

  if (isLoading) {
    return (
      <div className="py-4 px-2">
        <SkeletonTable rows={10} cols={11} />
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
            <p className="text-sm">No score data yet</p>
            <p className="text-sm mt-1 opacity-70">Trade on any pool to start earning score</p>
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
            <th className="py-3 px-3 text-right font-medium">Score</th>
            <th className="py-3 px-2 text-center font-medium w-8" aria-label="Twitter" title="Twitter">
              <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </th>
            <th className="py-3 px-2 text-center font-medium w-8" aria-label="Google" title="Google">
              <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            </th>
            <th className="py-3 px-2 text-center font-medium w-8" aria-label="Telegram" title="Telegram">
              <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </th>
            <th className="py-3 px-3 text-right font-medium hidden md:table-cell">Volume</th>
            <th className="py-3 px-3 text-right font-medium hidden md:table-cell">Trades</th>
            <th className="py-3 px-3 text-right font-medium hidden md:table-cell" title="Prediction-market trade volume settled this week (NUSDC)">Pred. Volume</th>
            <th className="py-3 px-3 text-right font-medium hidden md:table-cell" title="Distinct prediction markets resolved this week">Pred. Markets</th>
            <th className="py-3 px-3 text-center font-medium w-16">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border/50">
          {displayTraders.map((trader) => (
            <ScoreTraderRow
              key={trader.address}
              trader={trader}
              isCurrentUser={currentUserAddress === trader.address}
              isHighlighted={highlightedAddress === trader.address}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
