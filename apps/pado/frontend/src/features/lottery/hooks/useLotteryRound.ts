import { useQuery } from '@tanstack/react-query';
import { fetchLotteryRound } from '../lib/lottery-client';
import type { LotteryRound } from '../types';

export interface UseLotteryRoundResult {
  round: LotteryRound | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLotteryRound(roundId: string | undefined): UseLotteryRoundResult {
  const {
    data: round = null,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['lottery-round', roundId],
    queryFn: () => (roundId ? fetchLotteryRound(roundId) : null),
    enabled: !!roundId,
    staleTime: 10_000, // 10 seconds
    refetchInterval: 30_000, // 30 seconds
  });

  return {
    round,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
