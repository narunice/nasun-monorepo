import { useMemo } from 'react';
import { useCumulativeLeaderboard } from './useCumulativeLeaderboard';
import { useLeaderboardSnapshot } from './useLeaderboardSnapshot';
import { LeaderboardState } from './useLeaderboardState';
import { CumulativeLeaderboardData, CumulativePeriod } from '../types';

/**
 * 데이터 관리자 반환 타입
 */
export interface LeaderboardDataManager {
  data: CumulativeLeaderboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  clearCache: () => void;
  refresh: () => void;
  fetchLeaderboard: (page: number, period: CumulativePeriod, onComplete?: () => void) => void;
}

/**
 * 리더보드 데이터 통합 관리 훅
 *
 * @description
 * 현재 리더보드와 스냅샷 리더보드 두 개의 데이터 소스를 관리하고,
 * 현재 상태에 따라 적절한 데이터를 선택하여 반환합니다.
 * 단일 책임 원칙(SRP)을 따라 데이터 관리만 담당합니다.
 *
 * @param state - 리더보드 상태 (selectedDate, isSnapshotMode, currentPeriod)
 * @param itemsPerPage - 페이지당 항목 수
 * @param currentPage - 현재 페이지 번호 (스냅샷 페이지네이션용)
 * @returns 통합된 데이터와 데이터 관련 액션들
 *
 * @example
 * ```tsx
 * const dataManager = useLeaderboardData(state, 20, 1);
 *
 * // 현재 활성화된 데이터
 * const entries = dataManager.data?.entries;
 *
 * // 데이터 새로고침
 * dataManager.refresh();
 * ```
 */
export const useLeaderboardData = (
  state: LeaderboardState,
  itemsPerPage: number,
  currentPage: number = 1
): LeaderboardDataManager => {
  // 현재 리더보드 데이터 훅
  const {
    leaderboardData: currentLeaderboardData,
    loading: currentLoading,
    error: currentError,
    fetchLeaderboard,
    clearCache,
    refreshLeaderboard,
  } = useCumulativeLeaderboard(itemsPerPage, state.currentPeriod);

  // 스냅샷 데이터 훅 (페이지네이션 지원)
  const {
    data: snapshotData,
    isLoading: snapshotLoading,
    error: snapshotError,
    refetch: refetchSnapshot,
  } = useLeaderboardSnapshot({
    period: state.currentPeriod,
    selectedDate: state.selectedDate || '',
    page: currentPage, // ✅ 동적 페이지 번호 사용
    limit: itemsPerPage,
    enabled: state.isSnapshotMode && !!state.selectedDate,
  });

  // 현재 사용할 데이터 결정 (메모이제이션)
  const activeData = useMemo(() => {
    if (state.isSnapshotMode) {
      return {
        data: snapshotData || null,
        loading: snapshotLoading,
        error: snapshotError?.message || null,
      };
    }
    return {
      data: currentLeaderboardData,
      loading: currentLoading,
      error: currentError,
    };
  }, [
    state.isSnapshotMode,
    snapshotData,
    snapshotLoading,
    snapshotError,
    currentLeaderboardData,
    currentLoading,
    currentError,
  ]);

  // refetch 함수 결정
  const refetch = useMemo(() => {
    if (state.isSnapshotMode && state.selectedDate) {
      return refetchSnapshot;
    }
    return () => fetchLeaderboard(1, state.currentPeriod);
  }, [state.isSnapshotMode, state.selectedDate, state.currentPeriod, refetchSnapshot, fetchLeaderboard]);

  // refresh 함수 결정
  const refresh = useMemo(() => {
    if (state.isSnapshotMode && state.selectedDate) {
      return refetchSnapshot;
    }
    return refreshLeaderboard;
  }, [state.isSnapshotMode, state.selectedDate, refetchSnapshot, refreshLeaderboard]);

  return {
    data: activeData.data,
    loading: activeData.loading,
    error: activeData.error,
    refetch,
    clearCache,
    refresh,
    fetchLeaderboard, // 노출
  };
};
