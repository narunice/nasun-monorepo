import { useQuery } from '@tanstack/react-query';
import {
  fetchLotteryRounds,
  fetchLotteryRegistry,
} from '../lib/lottery-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { LotteryRound, LotteryRegistry } from '../types';
import { ROUND_STATUS } from '../constants';

export interface UseLotteriesResult {
  rounds: LotteryRound[];
  registry: LotteryRegistry | null;
  currentRound: LotteryRound | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLotteries(): UseLotteriesResult {
  const adaptiveInterval = useAdaptiveInterval(60_000);

  const {
    data: rounds = [],
    isLoading: roundsLoading,
    error: roundsError,
    refetch: refetchRounds,
  } = useQuery({
    queryKey: ['lottery-rounds'],
    queryFn: fetchLotteryRounds,
    staleTime: 30_000, // 30 seconds
    refetchInterval: adaptiveInterval,
  });

  const {
    data: registry = null,
    isLoading: registryLoading,
    error: registryError,
    refetch: refetchRegistry,
  } = useQuery({
    queryKey: ['lottery-registry'],
    queryFn: fetchLotteryRegistry,
    staleTime: 30_000,
    refetchInterval: adaptiveInterval,
  });

  // Find the current active round (OPEN status and not expired)
  const now = Date.now();
  const currentRound =
    rounds.find(
      (round) => round.status === ROUND_STATUS.OPEN && round.closeTime > now
    ) || null;

  const refetch = () => {
    refetchRounds();
    refetchRegistry();
  };

  return {
    rounds,
    registry,
    currentRound,
    isLoading: roundsLoading || registryLoading,
    error: (roundsError || registryError) as Error | null,
    refetch,
  };
}
