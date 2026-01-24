/**
 * 🆕 Rank History: useUserRankHistory Hook
 *
 * @description
 * 사용자의 랭킹 히스토리를 조회하는 React Hook입니다.
 * React Query를 사용하여 캐싱 및 자동 갱신을 지원합니다.
 *
 * @author Claude Code
 * @date 2025-10-26
 */

import { useQuery } from '@tanstack/react-query';
import { getUserRankHistory } from '../services/userRankApi';
import {
  CumulativePeriod,
  RankHistoryData,
  DateRangeOption,
} from '../types/leaderboard';

export interface UseUserRankHistoryOptions {
  username: string;
  period: CumulativePeriod;
  days?: DateRangeOption | number; // 조회 기간 (기본값: 7일)
  enabled?: boolean; // 옵션: 쿼리 활성화 여부
}

export interface UseUserRankHistoryResult {
  data: RankHistoryData | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isEmpty: boolean; // 히스토리 데이터가 없는 경우
  refetch: () => void;
}

/**
 * 사용자 랭킹 히스토리 조회 Hook
 *
 * @param options - 조회 옵션 (username, period, days, enabled)
 * @returns UseUserRankHistoryResult
 *
 * @example
 * // 최근 7일 히스토리
 * const { data, isLoading } = useUserRankHistory({
 *   username: 'johndoe',
 *   period: CumulativePeriod.CUMULATIVE,
 * });
 *
 * @example
 * // 최근 30일 히스토리
 * const { data, isEmpty } = useUserRankHistory({
 *   username: '@alice',
 *   period: CumulativePeriod.EVENT1,
 *   days: DateRangeOption.DAYS_30,
 * });
 *
 * @example
 * // 조건부 활성화
 * const { data } = useUserRankHistory({
 *   username: twitterHandle,
 *   period: selectedPeriod,
 *   enabled: !!twitterHandle && isAuthenticated,
 * });
 */
export function useUserRankHistory(
  options: UseUserRankHistoryOptions
): UseUserRankHistoryResult {
  const { username, period, days = DateRangeOption.DAYS_7, enabled = true } = options;

  // React Query
  const query = useQuery({
    queryKey: ['userRankHistory', username, period, days],
    queryFn: async (): Promise<RankHistoryData | null> => {
      if (!username) {
        return null;
      }

      const response = await getUserRankHistory(period, username, days);

      // 사용자를 찾을 수 없는 경우 (정상 상황)
      if (response.code === 'USER_NOT_FOUND') {
        return null;
      }

      // 히스토리 데이터가 없는 경우 (정상 상황)
      if (response.code === 'NO_HISTORY') {
        return {
          history: [],
          stats: {
            bestRank: 0,
            worstRank: 0,
            averageRank: 0,
            currentRank: 0,
            totalDays: 0,
            scoreIncrease: 0,
            rankImprovement: 0,
          },
        };
      }

      // 에러 처리
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch rank history');
      }

      return response.data || null;
    },
    enabled: enabled && !!username,
    staleTime: 5 * 60 * 1000, // 5분 (캐시 유지 시간)
    gcTime: 15 * 60 * 1000, // 15분 (가비지 컬렉션)
    retry: 1, // 1회 재시도
  });

  const isEmpty = query.data?.history.length === 0;

  return {
    data: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    isEmpty,
    refetch: query.refetch,
  };
}
