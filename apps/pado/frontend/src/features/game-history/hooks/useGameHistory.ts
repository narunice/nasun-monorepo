/**
 * useGameHistory Hook
 * Fetches and merges game history from 3 games (lottery, scratchcard, numbermatch)
 * using 3 parallel MoveEventType queries.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useActiveAddress } from './useActiveAddress';
import {
  fetchScratchHistory,
  fetchNumberMatchHistory,
  fetchLotteryHistory,
} from '../lib/game-client';
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

  const scratchQuery = useQuery({
    queryKey: ['game-history', 'scratch', address],
    queryFn: () => fetchScratchHistory(address!),
    enabled: !!address,
    staleTime: 30_000,
  });

  const numberMatchQuery = useQuery({
    queryKey: ['game-history', 'numbermatch', address],
    queryFn: () => fetchNumberMatchHistory(address!),
    enabled: !!address,
    staleTime: 30_000,
  });

  const lotteryQuery = useQuery({
    queryKey: ['game-history', 'lottery', address],
    queryFn: () => fetchLotteryHistory(address!),
    enabled: !!address,
    staleTime: 30_000,
  });

  const isLoading = scratchQuery.isLoading || numberMatchQuery.isLoading || lotteryQuery.isLoading;
  const error = scratchQuery.error ?? numberMatchQuery.error ?? lotteryQuery.error;

  // Merge all activities and sort by timestamp descending
  const allActivities = useMemo(() => {
    const items: GameActivity[] = [
      ...(scratchQuery.data?.items ?? []),
      ...(numberMatchQuery.data?.items ?? []),
      ...(lotteryQuery.data?.activities ?? []),
    ];
    return items.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [scratchQuery.data, numberMatchQuery.data, lotteryQuery.data]);

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
    const isTruncated =
      (scratchQuery.data?.isTruncated ?? false) ||
      (numberMatchQuery.data?.isTruncated ?? false) ||
      (lotteryQuery.data?.isTruncated ?? false);

    return {
      totalSpent,
      totalPayouts,
      netPnl: totalPayouts - totalSpent,
      totalGames: allActivities.length,
      winCount,
      winRate: totalResolved > 0 ? Math.round((winCount / totalResolved) * 10000) / 100 : 0,
      isTruncated,
    };
  }, [allActivities, scratchQuery.data, numberMatchQuery.data, lotteryQuery.data]);

  return {
    activities: filtered,
    summary,
    isLoading,
    error: error?.message ?? null,
  };
}
