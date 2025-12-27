/**
 * 🆕 Phase 1: useMyRank Hook
 * 🔄 Phase 3: 랭크 변동 정보 통합 (useRankChanges 활용)
 *
 * @description
 * 로그인한 사용자의 현재 랭킹을 조회하는 React Hook입니다.
 * React Query를 사용하여 캐싱 및 자동 갱신을 지원합니다.
 * Phase 3에서 useRankChanges를 통합하여 어제 대비 랭킹 변동 자동 표시.
 *
 * @author Claude Code
 * @date 2025-10-23
 */

import { useQuery } from '@tanstack/react-query';
import { getUserRank } from '../services/userRankApi';
import {
  CumulativePeriod,
  MyRankCardData,
  MyRankStatus,
  UserRankData,
} from '../types/leaderboard';
import { useAuth } from '../../../../providers/auth/AuthContext';
import { useRankChanges } from './useRankChanges';

export interface UseMyRankOptions {
  period: CumulativePeriod;
  date?: string;  // 옵션: 스냅샷 날짜 (YYYY-MM-DD)
  enabled?: boolean; // 옵션: 쿼리 활성화 여부
}

export interface UseMyRankResult {
  data: MyRankCardData;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * 나의 랭킹 조회 Hook
 *
 * @param options - 조회 옵션 (period, date, enabled)
 * @returns UseMyRankResult
 *
 * @example
 * const { data, isLoading, refetch } = useMyRank({
 *   period: CumulativePeriod.CUMULATIVE,
 * });
 *
 * @example
 * // 스냅샷 모드
 * const { data } = useMyRank({
 *   period: CumulativePeriod.EVENT1,
 *   date: '2025-10-21',
 * });
 */
export function useMyRank(options: UseMyRankOptions): UseMyRankResult {
  const { period, date, enabled = true } = options;
  const { user, isAuthenticated } = useAuth();

  // Twitter 핸들 추출
  const twitterHandle = user?.twitterHandle;

  // 🔍 Debug: 사용자 정보 로그
  console.log('🔍 [useMyRank] Debug:', {
    isAuthenticated,
    user,
    twitterHandle,
    period,
    date,
  });

  // 🆕 Phase 3: Rank Changes Hook (스냅샷 모드가 아닐 때만 활성화)
  const rankChangesQuery = useRankChanges({
    period,
    enabled: enabled && isAuthenticated && !date, // 스냅샷 모드가 아닐 때만
  });

  // React Query
  const query = useQuery({
    queryKey: ['myRank', period, twitterHandle, date],
    queryFn: async (): Promise<UserRankData | null> => {
      if (!twitterHandle) {
        return null;
      }

      const response = await getUserRank(period, twitterHandle, date);

      if (!response.success) {
        // USER_NOT_FOUND는 정상 상황 (랭크 없음)
        if (response.code === 'USER_NOT_FOUND') {
          return null;
        }
        throw new Error(response.error || 'Failed to fetch rank');
      }

      return response.data || null;
    },
    enabled: enabled && isAuthenticated,
    /**
     * React Query 캐싱 설정 (Stage 5 최적화)
     *
     * staleTime: 30분
     * - 리더보드는 매일 09:10 AM에 1회 업데이트됨
     * - 30분 캐싱으로 불필요한 API 재요청 방지
     * - 사용자가 탭 전환 후 재접속해도 캐시에서 즉시 로드
     *
     * gcTime: 1시간
     * - 컴포넌트 언마운트 후 1시간 동안 메모리에 캐시 보관
     * - 사용자가 다시 방문 시 즉시 데이터 표시 가능
     *
     * @see https://tanstack.com/query/latest/docs/framework/react/guides/caching
     */
    staleTime: 30 * 60 * 1000, // 30분 (캐시 유지 시간)
    gcTime: 60 * 60 * 1000, // 1시간 (가비지 컬렉션)
    retry: 1, // 1회 재시도
  });

  // 🆕 Phase 3: Rank Change 정보를 외부에서 병합 (queryFn 외부)
  let userRankData = query.data;
  if (userRankData && !date && rankChangesQuery.data) {
    const rankChange = rankChangesQuery.getUserRankChange(userRankData.username);
    if (rankChange) {
      console.log('🎯 [useMyRank] Rank Change 발견:', rankChange);
      userRankData = {
        ...userRankData,
        rankChange: {
          direction: rankChange.direction,
          amount: Math.abs(rankChange.rankChange),
          scoreChange: rankChange.scoreChange,
        },
      };
    } else {
      console.log('⚠️ [useMyRank] Rank Change 없음:', userRankData.username);
    }
  }

  // 상태 결정
  let status: MyRankStatus;
  if (query.isLoading) {
    status = 'loading';
  } else if (query.error) {
    status = 'error';
  } else if (!isAuthenticated) {
    status = 'no_twitter'; // 인증 안됨
  } else if (!twitterHandle) {
    status = 'no_twitter'; // Twitter 연동 안됨
  } else if (!userRankData) {
    status = 'not_ranked'; // 랭크 없음
  } else {
    status = 'ranked'; // 정상 랭크됨
  }

  const result: MyRankCardData = {
    status,
    userRank: userRankData || undefined,
    error: query.error?.message,
    isSnapshotMode: !!date,
  };

  return {
    data: result,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
