import { useCallback } from 'react';
import { LeaderboardState, LeaderboardStateActions } from './useLeaderboardState';
import { CumulativePeriod } from '../types';

/**
 * 데이터 액션 인터페이스
 */
export interface DataActions {
  refetch: () => void;
  refresh: () => void;
  clearCache: () => void;
  fetchLeaderboard: (page: number, period: CumulativePeriod, onComplete?: () => void) => void;
}

/**
 * 페이지네이션 액션 인터페이스
 */
export interface PaginationActions {
  setCurrentPage: (page: number) => void;
}

/**
 * 리더보드 핸들러 반환 타입
 */
export interface LeaderboardHandlers {
  handlePeriodChange: (newPeriod: CumulativePeriod) => void;
  handleDateChange: (date: string | null) => void;
  handleRetry: () => void;
  handleClearCache: () => void;
  handleRefreshData: () => void;
  handleViewLatest: () => void;
}

/**
 * 리더보드 이벤트 핸들러 관리 훅
 *
 * @description
 * 리더보드의 모든 사용자 인터랙션(기간 변경, 날짜 선택, 새로고침 등)을 처리하는 훅입니다.
 * 단일 책임 원칙(SRP)을 따라 이벤트 핸들링만 담당합니다.
 *
 * @param state - 리더보드 상태
 * @param actions - 상태 변경 액션들
 * @param dataActions - 데이터 관련 액션들
 * @param paginationActions - 페이지네이션 액션들
 * @returns 모든 이벤트 핸들러 함수들
 *
 * @example
 * ```tsx
 * const handlers = useLeaderboardHandlers(state, actions, dataActions, paginationActions);
 *
 * // 기간 변경
 * handlers.handlePeriodChange(CumulativePeriod.EVENT1);
 *
 * // 날짜 선택
 * handlers.handleDateChange('2025-10-01');
 * ```
 */
export const useLeaderboardHandlers = (
  state: LeaderboardState,
  actions: LeaderboardStateActions,
  dataActions: DataActions,
  paginationActions: PaginationActions
): LeaderboardHandlers => {
  /**
   * 기간 변경 핸들러
   * 기간을 변경하면 스냅샷 모드를 해제하고 최신 데이터를 로드합니다.
   */
  const handlePeriodChange = useCallback(
    (newPeriod: CumulativePeriod) => {
      // 기간 변경
      actions.setCurrentPeriod(newPeriod);

      // 스냅샷 모드 해제 및 최신으로 리셋
      actions.resetToLatest();

      // 첫 페이지로 이동
      paginationActions.setCurrentPage(1);

      // 새 기간의 데이터 로드
      dataActions.fetchLeaderboard(1, newPeriod, () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      console.log(`📊 리더보드 기간 변경: ${newPeriod} (스냅샷 모드 해제)`);
    },
    [actions, paginationActions, dataActions]
  );

  /**
   * 날짜 변경 핸들러
   * 날짜를 선택하면 스냅샷 모드로 전환하거나 최신 모드로 변경합니다.
   */
  const handleDateChange = useCallback(
    (date: string | null) => {
      const today = new Date().toISOString().split('T')[0];
      actions.setSelectedDate(date);

      // 오늘 날짜를 선택한 경우 스냅샷 모드가 아닌 현재 리더보드 표시
      if (date === today) {
        actions.setIsSnapshotMode(false);
        paginationActions.setCurrentPage(1);
        // 현재 리더보드 데이터 새로고침
        dataActions.fetchLeaderboard(1, state.currentPeriod, () => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        console.log(`📅 오늘 날짜 선택 - 현재 리더보드로 표시: ${date}`);
      } else if (date) {
        // 과거 날짜 선택 시 스냅샷 모드로 전환
        actions.setIsSnapshotMode(true);
        paginationActions.setCurrentPage(1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log(`📅 스냅샷 모드로 전환: ${date}`);
      } else {
        // 날짜 선택 해제 시 최신 리더보드 모드로 전환
        actions.setIsSnapshotMode(false);
        paginationActions.setCurrentPage(1);
        console.log('📅 최신 리더보드 모드로 전환');
      }
    },
    [actions, paginationActions, dataActions, state.currentPeriod]
  );

  /**
   * 재시도 핸들러
   * 에러 발생 시 현재 모드에 맞는 데이터를 다시 가져옵니다.
   */
  const handleRetry = useCallback(() => {
    dataActions.refetch();
    console.log('🔄 리더보드 데이터 재시도');
  }, [dataActions]);

  /**
   * 캐시 클리어 핸들러
   * 캐시된 모든 리더보드 데이터를 삭제합니다.
   */
  const handleClearCache = useCallback(() => {
    dataActions.clearCache();
    console.log('🧹 리더보드 캐시가 클리어되었습니다');
  }, [dataActions]);

  /**
   * 데이터 새로고침 핸들러
   * 현재 모드에 맞는 데이터를 강제로 새로고침합니다.
   */
  const handleRefreshData = useCallback(() => {
    dataActions.refresh();
    if (state.isSnapshotMode && state.selectedDate) {
      console.log('🔄 리더보드 스냅샷 데이터를 새로고침했습니다');
    } else {
      console.log('🔄 리더보드 데이터를 새로고침했습니다');
    }
  }, [dataActions, state.isSnapshotMode, state.selectedDate]);

  /**
   * 최신 리더보드 보기 핸들러
   * 스냅샷 모드를 해제하고 최신 리더보드를 표시합니다.
   */
  const handleViewLatest = useCallback(() => {
    actions.resetToLatest();
    paginationActions.setCurrentPage(1);

    // 최신 데이터 강제 새로고침
    dataActions.fetchLeaderboard(1, state.currentPeriod, () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    console.log('📅 최신 리더보드로 이동');
  }, [actions, paginationActions, dataActions, state.currentPeriod]);

  return {
    handlePeriodChange,
    handleDateChange,
    handleRetry,
    handleClearCache,
    handleRefreshData,
    handleViewLatest,
  };
};
