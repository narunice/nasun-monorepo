/**
 * 🆕 Top Climbers Spotlight Hook
 *
 * @description
 * 지정된 기간 동안 순위가 가장 많이 상승한 상위 5명의 사용자를 조회하는 React Hook입니다.
 * - React Query를 사용하여 30분 캐싱
 * - 기간별 비교 (today, 7d, 4w, 3m)
 * - 이벤트 리더보드는 today, 7d만 지원
 *
 * @author Claude Code
 * @date 2025-11-22
 */

import { useQuery } from '@tanstack/react-query';
import { getTopClimbers } from '../services/userRankApi';
import {
  CumulativePeriod,
  TopClimbersData,
  TimeRange,
} from '../types/leaderboard';

export interface UseTopClimbersOptions {
  period: CumulativePeriod;
  timeRange?: TimeRange;
  limit?: number;
  enabled?: boolean; // 옵션: 쿼리 활성화 여부 (기본값: true)
}

export interface UseTopClimbersResult {
  /** Top Climbers 데이터 */
  data: TopClimbersData | null;
  /** 로딩 중 여부 */
  isLoading: boolean;
  /** 에러 */
  error: Error | null;
  /** 수동 새로고침 함수 */
  refetch: () => void;
}

/**
 * Top Climbers 조회 Hook
 *
 * @param options - 조회 옵션 (period, timeRange, limit, enabled)
 * @returns UseTopClimbersResult
 *
 * @example
 * // 기본 사용법 (오늘 대비 Top 5)
 * const { data, isLoading } = useTopClimbers({
 *   period: CumulativePeriod.CUMULATIVE,
 * });
 *
 * if (data) {
 *   console.log(`Top ${data.climbers.length} climbers:`);
 *   data.climbers.forEach(climber => {
 *     console.log(`${climber.username}: +${climber.rankImprovement} ranks`);
 *   });
 * }
 *
 * @example
 * // 7일 대비 Top 3 조회
 * const { data } = useTopClimbers({
 *   period: CumulativePeriod.CUMULATIVE,
 *   timeRange: '7d',
 *   limit: 3,
 * });
 *
 * @example
 * // 조건부 활성화 (탭 전환 시)
 * const { data } = useTopClimbers({
 *   period: CumulativePeriod.EVENT1,
 *   timeRange: 'today',
 *   enabled: isTabActive,
 * });
 */
export function useTopClimbers(options: UseTopClimbersOptions): UseTopClimbersResult {
  const {
    period,
    timeRange = 'today',
    limit = 5,
    enabled = true,
  } = options;

  // React Query
  const query = useQuery({
    queryKey: ['topClimbers', period, timeRange, limit],
    queryFn: async (): Promise<TopClimbersData | null> => {
      const response = await getTopClimbers(period, timeRange, limit);

      if (!response.success) {
        // 에러는 throw하여 React Query의 error 처리
        throw new Error(response.error || 'Failed to fetch top climbers');
      }

      return response.data || null;
    },
    enabled,
    staleTime: 30 * 60 * 1000, // 30분 (리더보드는 09:10 AM에 1회 업데이트)
    gcTime: 60 * 60 * 1000, // 1시간
    retry: 2, // 2회 재시도
  });

  return {
    data: query.data || null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
