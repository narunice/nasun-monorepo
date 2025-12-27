/**
 * 🆕 Phase 3: useRankChanges Hook
 *
 * @description
 * 어제 대비 오늘의 랭킹 변동 데이터를 조회하는 React Hook입니다.
 * - React Query를 사용하여 30분 캐싱
 * - 특정 사용자의 랭킹 변동 정보를 빠르게 조회 가능
 * - 전체 랭킹 변동 통계 제공
 *
 * @author Claude Code
 * @date 2025-10-23
 */

import { useQuery } from '@tanstack/react-query';
import { getRankChanges } from '../services/userRankApi';
import {
  CumulativePeriod,
  RankChangesData,
  RankChange,
} from '../types/leaderboard';

export interface UseRankChangesOptions {
  period: CumulativePeriod;
  enabled?: boolean; // 옵션: 쿼리 활성화 여부 (기본값: true)
}

export interface UseRankChangesResult {
  /** 전체 랭킹 변동 데이터 */
  data: RankChangesData | null;
  /** 로딩 중 여부 */
  isLoading: boolean;
  /** 에러 */
  error: Error | null;
  /** 수동 새로고침 함수 */
  refetch: () => void;

  // 🎯 편의 함수들
  /** 특정 사용자의 랭킹 변동 조회 */
  getUserRankChange: (username: string) => RankChange | null;
  /** 신규 진입 사용자 목록 */
  getNewEntries: () => RankChange[];
  /** 순위 상승 사용자 목록 (상승폭 큰 순) */
  getTopRisers: (limit?: number) => RankChange[];
  /** 순위 하락 사용자 목록 (하락폭 큰 순) */
  getTopFallers: (limit?: number) => RankChange[];
}

/**
 * 랭킹 변동 조회 Hook
 *
 * @param options - 조회 옵션 (period, enabled)
 * @returns UseRankChangesResult
 *
 * @example
 * // 기본 사용법
 * const { data, isLoading, getUserRankChange } = useRankChanges({
 *   period: CumulativePeriod.CUMULATIVE,
 * });
 *
 * if (data) {
 *   console.log(`Total users: ${data.total}`);
 *   console.log(`New entries: ${data.summary.new}`);
 *   console.log(`Rank ups: ${data.summary.up}`);
 * }
 *
 * @example
 * // 특정 사용자 랭킹 변동 조회
 * const myChange = getUserRankChange('Fall2026');
 * if (myChange) {
 *   console.log(`${myChange.direction}: ${myChange.rankChange}`);
 * }
 *
 * @example
 * // 순위 상승 TOP 10
 * const topRisers = getTopRisers(10);
 * topRisers.forEach(user => {
 *   console.log(`${user.username}: +${user.rankChange}`);
 * });
 */
export function useRankChanges(options: UseRankChangesOptions): UseRankChangesResult {
  const { period, enabled = true } = options;

  // React Query
  const query = useQuery({
    queryKey: ['rankChanges', period],
    queryFn: async (): Promise<RankChangesData | null> => {
      const response = await getRankChanges(period);

      if (!response.success) {
        // 에러는 throw하여 React Query의 error 처리
        throw new Error(response.error || 'Failed to fetch rank changes');
      }

      return response.data || null;
    },
    enabled,
    staleTime: 30 * 60 * 1000, // 30분 (랭킹 변동은 자주 바뀌지 않음)
    gcTime: 60 * 60 * 1000, // 1시간
    retry: 2, // 2회 재시도
  });

  /**
   * 특정 사용자의 랭킹 변동 조회
   */
  const getUserRankChange = (username: string): RankChange | null => {
    if (!query.data) return null;

    const cleanUsername = username.toLowerCase().replace('@', '');
    const change = query.data.changes.find(
      (c) => c.username.toLowerCase() === cleanUsername
    );

    return change || null;
  };

  /**
   * 신규 진입 사용자 목록
   */
  const getNewEntries = (): RankChange[] => {
    if (!query.data) return [];
    return query.data.changes.filter((c) => c.direction === 'new');
  };

  /**
   * 순위 상승 사용자 목록 (상승폭 큰 순)
   */
  const getTopRisers = (limit: number = 10): RankChange[] => {
    if (!query.data) return [];

    return query.data.changes
      .filter((c) => c.direction === 'up')
      .sort((a, b) => b.rankChange - a.rankChange) // 상승폭 큰 순
      .slice(0, limit);
  };

  /**
   * 순위 하락 사용자 목록 (하락폭 큰 순)
   */
  const getTopFallers = (limit: number = 10): RankChange[] => {
    if (!query.data) return [];

    return query.data.changes
      .filter((c) => c.direction === 'down')
      .sort((a, b) => a.rankChange - b.rankChange) // 하락폭 큰 순 (음수이므로 오름차순)
      .slice(0, limit);
  };

  return {
    data: query.data || null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    getUserRankChange,
    getNewEntries,
    getTopRisers,
    getTopFallers,
  };
}
