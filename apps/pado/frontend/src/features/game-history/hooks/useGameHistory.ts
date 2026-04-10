/**
 * useGameHistory Hook
 * Fetches all game history in a single Sender-based query,
 * then splits and merges results by game type.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActiveAddress } from './useActiveAddress';
import { fetchAllGameHistory } from '../lib/game-client';
import type { GameType, GameActivity, GameSummary } from '../types';

export interface UseGameHistoryResult {
  activities: GameActivity[];
  summary: GameSummary;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_SUMMARY: GameSummary = {
  totalSpent: 0n,
  totalPayouts: 0n,
  netPnl: 0n,
  totalGames: 0,
  winCount: 0,
  winRate: 0,
  isTruncated: false,
};

export function useGameHistory(filter: GameType | 'all' = 'all'): UseGameHistoryResult {
  const address = useActiveAddress();

  const { data, isLoading, error } = useQuery({
    queryKey: ['game-history', address],
    queryFn: () => fetchAllGameHistory(address!),
    enabled: !!address,
    staleTime: 30_000,
  });

  // Merge all activities and sort by timestamp descending
  const allActivities = useMemo(() => {
    if (!data) return [];
    const items: GameActivity[] = [
      ...data.scratch.items,
      ...data.numbermatch.items,
      ...data.lottery.activities,
    ];
    return items.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [data]);

  // Apply game type filter
  const filtered = useMemo(
    () => (filter === 'all' ? allActivities : allActivities.filter((a) => a.gameType === filter)),
    [allActivities, filter],
  );

  // Compute summary from all (unfiltered) activities
  const summary = useMemo<GameSummary>(() => {
    if (allActivities.length === 0) return EMPTY_SUMMARY;

    const nonPending = allActivities.filter((a) => a.result !== 'pending');
    const totalSpent = allActivities.reduce((sum, a) => sum + a.spent, 0n);
    const totalPayouts = allActivities.reduce((sum, a) => sum + a.payout, 0n);
    const winCount = nonPending.filter((a) => a.result === 'win').length;
    const totalResolved = nonPending.length;
    const isTruncated = data?.scratch.isTruncated || data?.numbermatch.isTruncated || data?.lottery.isTruncated || false;

    return {
      totalSpent,
      totalPayouts,
      netPnl: totalPayouts - totalSpent,
      totalGames: allActivities.length,
      winCount,
      winRate: totalResolved > 0 ? Math.round((winCount / totalResolved) * 10000) / 100 : 0,
      isTruncated,
    };
  }, [allActivities, data]);

  return {
    activities: filtered,
    summary,
    isLoading,
    error: error?.message ?? null,
  };
}
