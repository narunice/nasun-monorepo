import { useMemo, useEffect, useState, useRef, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useLeaderboardState } from './useLeaderboardState';
import { useLeaderboardData } from './useLeaderboardData';
import { useLeaderboardHandlers } from './useLeaderboardHandlers';
import { usePagination } from './usePagination';
import { CumulativePeriod, CumulativeLeaderboardEntry, PaginationRange, CumulativeLeaderboardMetadata } from '../types';

/**
 * 페이지네이션 정보 인터페이스
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  pageInput: string;
  paginationRange: PaginationRange;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * 리더보드 매니저 반환 타입
 */
export interface LeaderboardManager {
  // 데이터
  entries: CumulativeLeaderboardEntry[];
  metadata: CumulativeLeaderboardMetadata | null; // API metadata 추가

  // 상태
  loading: boolean;
  error: string | null;
  isSnapshotMode: boolean;
  currentPeriod: CumulativePeriod;
  selectedDate: string | null;
  displayDate: React.ReactNode;
  generationTimestamp: string | null;

  // 페이지네이션
  pagination: PaginationInfo;

  // 핸들러
  handlers: {
    handlePeriodChange: (newPeriod: CumulativePeriod) => void;
    handleDateChange: (date: string | null) => void;
    handleRetry: () => void;
    handleClearCache: () => void;
    handleRefreshData: () => void;
    handleViewLatest: () => void;
    onPageChange: (page: number) => boolean;
    onPageInputChange: (value: string) => void;
    onPageInputSubmit: (e: React.FormEvent) => void;
  };
}

/**
 * 리더보드 통합 관리 훅
 *
 * @description
 * 모든 작은 훅들(상태, 데이터, 핸들러, 페이지네이션)을 조합하여
 * 리더보드 컴포넌트가 필요한 모든 기능을 한 번에 제공하는 조합 훅입니다.
 *
 * 이 훅은 Composition Pattern을 사용하여 복잡도를 관리하며,
 * 각 작은 훅들은 단일 책임만 가지도록 설계되었습니다.
 *
 * @param itemsPerPage - 페이지당 항목 수
 * @param initialPeriod - 초기 리더보드 기간
 * @returns 리더보드 컴포넌트에 필요한 모든 데이터와 핸들러
 *
 * @example
 * ```tsx
 * const manager = useLeaderboardManager(20, CumulativePeriod.CUMULATIVE);
 *
 * // 데이터 사용
 * <Table entries={manager.entries} />
 *
 * // 핸들러 사용
 * <PeriodSelector onPeriodChange={manager.handlers.handlePeriodChange} />
 * ```
 */
export const useLeaderboardManager = (
  itemsPerPage: number,
  initialPeriod: CumulativePeriod,
  tableRef?: RefObject<HTMLDivElement>,
  skipFetch: boolean = false  // 🆕 스마트 기본값 로딩 중일 때 초기 fetch 건너뛰기
): LeaderboardManager => {
  const { t, i18n } = useTranslation('leaderboard');
  // 1. 상태 관리
  const { state, actions } = useLeaderboardState(initialPeriod);

  // 2. 페이지네이션 상태 (먼저 초기화)
  // ✅ [BUGFIX] 하드코딩된 500 대신 실제 데이터의 total 사용
  // 초기에는 0으로 시작하고, 데이터 로드 후 actualTotal로 업데이트됨
  const [currentPageState, setCurrentPageState] = useState(1);

  // 3. 데이터 관리 (currentPageState 전달)
  const dataManager = useLeaderboardData(state, itemsPerPage, currentPageState);

  // 4. 페이지네이션 (실제 total 사용)
  const actualTotal = dataManager.data?.pagination.total || 0;
  const pagination = usePagination(actualTotal, itemsPerPage);

  // 5. 페이지 상태 동기화
  useEffect(() => {
    setCurrentPageState(pagination.currentPage);
  }, [pagination.currentPage]);

  // 6. 이벤트 핸들러
  const handlers = useLeaderboardHandlers(
    state,
    actions,
    {
      refetch: dataManager.refetch,
      refresh: dataManager.refresh,
      clearCache: dataManager.clearCache,
      fetchLeaderboard: dataManager.fetchLeaderboard,
    },
    {
      setCurrentPage: pagination.setCurrentPage,
    }
  );

  // 7. 초기 데이터 로딩 + currentPeriod 변경 시 재로딩
  // 🆕 스마트 기본값으로 인해 currentPeriod가 변경될 때도 데이터를 다시 로드
  // 🆕 skipFetch가 true이면 초기 fetch를 건너뜀 (스마트 기본값 로딩 중)
  useEffect(() => {
    // skipFetch가 true이면 fetch 건너뛰기 (Race Condition 방지)
    if (skipFetch) {
      console.log('⏸️ [useLeaderboardManager] skipFetch=true, 데이터 fetch 건너뜀');
      return;
    }
    // 초기 로드 및 기간 변경 시 첫 페이지 데이터를 가져옴
    if (!state.isSnapshotMode) {
      dataManager.fetchLeaderboard(1, state.currentPeriod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentPeriod]); // ⚠️ skipFetch는 dependency에서 제외! (Race Condition 방지: skipFetch→false 시점에 currentPeriod가 아직 cumulative일 수 있음)

  // 7-1. 🆕 skipFetch가 true→false로 변경될 때 데이터 가져오기
  // 한국어 등 비동기 번역 로드 후 컴포넌트 재마운트 시 발생하는 버그 수정
  const prevSkipFetchRef = useRef(skipFetch);
  useEffect(() => {
    // skipFetch가 true→false로 변경되었고, 스냅샷 모드가 아닐 때
    if (prevSkipFetchRef.current === true && skipFetch === false && !state.isSnapshotMode) {
      console.log('🔄 [useLeaderboardManager] skipFetch 해제됨, 데이터 fetch 시작');
      dataManager.fetchLeaderboard(1, state.currentPeriod);
    }
    prevSkipFetchRef.current = skipFetch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipFetch]);

  // 8. 페이지 변경 시 스크롤 처리
  // ✅ [BUGFIX] 페이지 변경 시 데이터 로딩 완료 후 스크롤
  // entries 배열 자체를 dependency로 사용하여 내용이 바뀔 때마다 스크롤
  useEffect(() => {
    if (!dataManager.loading && dataManager.data?.entries && dataManager.data.entries.length > 0) {
      // 페이지가 1보다 크거나, 스냅샷 모드일 때만 스크롤
      // (초기 로드 시에는 스크롤하지 않음)
      if (currentPageState > 1 || state.isSnapshotMode) {
        // 🆕 URL 파라미터에 user가 있으면 스크롤하지 않음 (Search Handles 기능)
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.has('user')) {
          // 🆕 테이블 ref가 있으면 테이블 상단으로, 없으면 페이지 상단으로 스크롤
          if (tableRef?.current) {
            console.log('📄 [useLeaderboardManager] 페이지 변경 스크롤 실행 (테이블 상단)');
            tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            console.log('📄 [useLeaderboardManager] 페이지 변경 스크롤 실행 (페이지 상단 - fallback)');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } else {
          console.log('🔍 [useLeaderboardManager] user 파라미터 감지 - 스크롤 건너뜀 (사용자 위치 유지)');
        }
      }
    }
  }, [dataManager.data?.entries, dataManager.loading, currentPageState, state.isSnapshotMode, tableRef]);

  // 9. UI 표시용 파생 데이터 (displayDate)
  const displayDate = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const metadata = dataManager.data?.metadata;

    // 🆕 Final Ranking 감지 (이벤트 종료 후 자동 최종 순위)
    if (metadata?.isFinalRanking && metadata?.finalRankingDate) {
      const date = new Date(metadata.finalRankingDate);
      const formattedDate = new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(date);

      return (
        <strong className="font-bold">
          {t('displayDate.finalRanking')} - {formattedDate}
        </strong>
      );
    }

    if (state.selectedDate) {
      const dateStr = t('displayDate.format', {
        year: state.selectedDate.split('-')[0],
        month: state.selectedDate.split('-')[1],
        day: state.selectedDate.split('-')[2],
      });

      // 오늘 날짜를 선택한 경우 현재 리더보드임을 표시
      if (state.selectedDate === today) {
        return `${dateStr} ${t('displayDate.latestSuffix')}`;
      } else if (state.isSnapshotMode) {
        return `${dateStr} ${t('displayDate.snapshotSuffix')}`;
      } else {
        return dateStr;
      }
    }
    return t('displayDate.latest');
  }, [state.selectedDate, state.isSnapshotMode, dataManager.data?.metadata, t, i18n.language]);

  const generationTimestamp = useMemo(() => {
    const metadata = dataManager.data?.metadata;
    const timestamp = metadata?.lastUpdated;
    const hasEntries = dataManager.data?.entries && dataManager.data.entries.length > 0;

    // 🆕 Final Ranking일 때는 타임스탬프 숨기기 (종료된 이벤트는 업데이트되지 않음)
    if (metadata?.isFinalRanking) {
      return null;
    }

    if (timestamp && hasEntries) {
      return new Date(timestamp).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
    }
    return null;
  }, [dataManager.data]);

  const onPageChange = (page: number) => {
    const pageChanged = pagination.handlePageChange(page);
    if (pageChanged) {
      // ✅ 스냅샷 모드: 페이지 상태 변경만으로 React Query가 자동 재요청
      // ✅ 일반 모드: 수동으로 fetchLeaderboard 호출
      // 스크롤은 두 모드 모두 useEffect에서 데이터 로딩 완료 후 처리 (line 129-140)
      if (!state.isSnapshotMode) {
        dataManager.fetchLeaderboard(page, state.currentPeriod);
      }
      // 스냅샷 모드: React Query가 queryKey 변경 감지해서 자동 요청
    }
    return pageChanged;
  };

  // 7. 최종 반환값 구성
  return {
    // 데이터
    entries: dataManager.data?.entries || [],
    metadata: dataManager.data?.metadata || null,

    // 상태
    loading: dataManager.loading,
    error: dataManager.error,
    isSnapshotMode: state.isSnapshotMode,
    currentPeriod: state.currentPeriod,
    selectedDate: state.selectedDate,
    displayDate,
    generationTimestamp,

    // 페이지네이션
    pagination: {
      page: pagination.currentPage,
      limit: itemsPerPage,
      total: dataManager.data?.pagination.total || 0,
      totalPages: pagination.totalPages,
      pageInput: pagination.pageInput,
      paginationRange: pagination.paginationRange,
      hasNext: pagination.hasNextPage,
      hasPrev: pagination.hasPrevPage,
    },

    // 핸들러
    handlers: {
      ...handlers,
      onPageChange: onPageChange,
      onPageInputChange: pagination.handlePageInputChange,
      onPageInputSubmit: pagination.handlePageInputSubmit,
    },
  };
};