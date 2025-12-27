import React, { useEffect, useCallback, useRef, useMemo } from "react";
import {
  CumulativePeriodSelector,
  VersionSwitcher,
  UserSearchBox,
  CumulativeLeaderboardHeader,
} from "./";
import PaginationControls from "./PaginationControls";
import ShareButtonsGroup from "./ShareButtonsGroup";
import TopClimbersSpotlight from "./TopClimbersSpotlight";
import SnapshotHeader from "./SnapshotHeader";
import LeaderboardTableSection from "./LeaderboardTableSection";
import { SectionLoading } from "../../../ui";
import ErrorState from "./ErrorState";
import { useLeaderboardManager, useUrlParams, useHighlight, useMyRank } from "../hooks";
import { useSmartDefaultPeriod } from "../hooks/useSmartDefaultPeriod";
import { CUMULATIVE_LEADERBOARD_CONFIG } from "../constants";
import { CumulativePeriod } from "../types";
import { MyRankCardRef } from "./MyRankCard";

interface CumulativeLeaderboardProps {
  showVersionSwitcher?: boolean;
  initialPeriod?: CumulativePeriod;
  showAdvancedFeatures?: boolean;
}

/**
 * 누적 리더보드 컴포넌트 (리팩토링 버전)
 *
 * @description
 * useLeaderboardManager 훅을 사용하여 모든 비즈니스 로직을 분리한 프레젠테이션 컴포넌트입니다.
 * 이 컴포넌트는 오직 UI 렌더링만 담당하며, 상태 관리와 데이터 처리는 훅에서 처리됩니다.
 *
 * @param showVersionSwitcher - 버전 전환기 표시 여부
 * @param initialPeriod - 초기 리더보드 기간
 * @param showAdvancedFeatures - 고급 기능(새로고침, 캐시 클리어) 표시 여부
 */
const CumulativeLeaderboard: React.FC<CumulativeLeaderboardProps> = ({
  showVersionSwitcher = false,
  initialPeriod,
}) => {
  const itemsPerPage = CUMULATIVE_LEADERBOARD_CONFIG.DEFAULT_ITEMS_PER_PAGE;

  // 🎯 MyRankCard ref (버튼 핸들러 접근용)
  const myRankCardRef = useRef<MyRankCardRef>(null);

  // 🆕 테이블 스크롤 타겟 ref (페이지네이션 시 테이블 상단으로 스크롤)
  const tableRef = useRef<HTMLDivElement>(null);

  // 🆕 스마트 기본값 로직: CUMULATIVE가 숨겨진 경우 자동으로 적절한 기간 선택
  // 우선순위: 1. 진행 중인 이벤트 → 2. 가장 최근 종료된 이벤트 → 3. 첫 번째 visible → 4. cumulative
  const { defaultPeriod, isLoading: isDefaultPeriodLoading, availableLeaderboards } = useSmartDefaultPeriod();

  // 🆕 Phase 2: URL 파라미터 & 하이라이트 (effectivePeriod 계산보다 먼저 선언)
  const { params, updateParams, removeParams } = useUrlParams();

  // 🎯 실제 사용할 기간 결정
  // 우선순위: 1. URL 파라미터 → 2. initialPeriod → 3. 스마트 기본값
  const effectivePeriod = useMemo(() => {
    // 1. URL 파라미터 최우선 (페이지 새로고침/URL 공유 시)
    if (params.period) {
      // ✅ 소문자로 변환 (CumulativePeriod enum 값이 소문자이므로)
      const urlPeriod = params.period.toLowerCase() as CumulativePeriod;
      // URL의 기간이 유효한지 확인
      const validPeriods = ['cumulative', 'event1', 'event2', 'event3'];
      if (validPeriods.includes(urlPeriod)) {
        // 해당 기간이 visible인지 확인
        const isVisible = availableLeaderboards?.some(
          lb => lb.id.toLowerCase() === urlPeriod && lb.visible
        ) ?? true;
        if (isVisible) {
          console.log(`🔗 [effectivePeriod] URL 파라미터에서 기간 복원: ${urlPeriod}`);
          return urlPeriod;
        }
      }
    }

    // 2. initialPeriod가 명시적으로 전달된 경우
    if (initialPeriod) {
      const isVisible = availableLeaderboards?.some(
        lb => lb.id.toLowerCase() === initialPeriod && lb.visible
      ) ?? true;
      if (isVisible) {
        return initialPeriod;
      }
    }

    // 3. 스마트 기본값 사용
    return defaultPeriod;
  }, [params.period, initialPeriod, defaultPeriod, availableLeaderboards]);

  // 🎯 모든 로직을 단 한 줄로 가져오기
  // 🆕 스마트 기본값 로딩 중이고 URL 파라미터가 없으면 초기 fetch 건너뛰기
  const shouldSkipFetch = isDefaultPeriodLoading && !params.period;
  const manager = useLeaderboardManager(itemsPerPage, effectivePeriod, tableRef, shouldSkipFetch);

  // 🎯 MyRank 데이터 (버튼 표시 조건 확인용)
  const { data: myRankData } = useMyRank({
    period: manager.currentPeriod,
    date: manager.selectedDate || undefined,
  });

  // 하이라이트 Hook (useUrlParams는 이미 위에서 선언됨)
  const { isHighlighted, startHighlight } = useHighlight();

  // 🆕 탭 변경 시 URL 업데이트하는 래퍼 함수
  const handlePeriodChangeWithUrl = useCallback(
    (newPeriod: CumulativePeriod) => {
      // URL에 기간 파라미터 업데이트
      updateParams({ period: newPeriod.toLowerCase() }, true);
      console.log(`🔗 [handlePeriodChangeWithUrl] URL 업데이트: period=${newPeriod.toLowerCase()}`);

      // 기존 핸들러 호출
      manager.handlers.handlePeriodChange(newPeriod);
    },
    [updateParams, manager.handlers]
  );

  // 🔗 페이지 로드 시 URL 파라미터 처리 (한 번만 실행)
  useEffect(() => {
    if (params.user && params.highlight) {
      console.log("🔗 [CumulativeLeaderboard] URL 파라미터 감지 - 사용자 검색:", params.user);

      // 1. 하이라이트 시작
      startHighlight(params.user);

      // 2. 6초 후 highlight 파라미터 제거 (하이라이트 지속 시간과 동일)
      // 즉시 제거하면 URL 변경으로 스크롤이 초기화되는 문제 방지
      const timer = setTimeout(() => {
        console.log("🔗 [CumulativeLeaderboard] highlight 파라미터 제거 (6초 경과)");
        removeParams("highlight");
      }, 6000);

      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.user, params.highlight]); // startHighlight 의존성 제거로 한 번만 실행

  // 🎯 사용자 랭킹 보기 핸들러 (Phase 2)
  const handleViewUserRank = useCallback(
    (page: number, username: string) => {
      console.log(`🎯 [CumulativeLeaderboard] 사용자 랭킹 보기: ${username}, Page ${page}`);

      // 현재 페이지 확인
      const currentPage = manager.pagination.page;
      const isSamePage = currentPage === page;

      // 1. 페이지 이동 (다른 페이지인 경우만)
      if (!isSamePage) {
        manager.handlers.onPageChange(page);
      }

      // 2. 하이라이트 시작 (소문자로 정규화)
      const normalizedUsername = username.toLowerCase();
      startHighlight(normalizedUsername);

      // 3. URL 업데이트 (공유 가능하도록)
      updateParams({ user: normalizedUsername, highlight: true }, true);

      // 4. 스크롤 최적화 - 하이라이트된 행으로 부드럽게 이동
      const scrollToUser = (retries = 0, maxRetries = 200) => {
        const targetRow = document.querySelector(`[data-username="${normalizedUsername}"]`);
        if (targetRow) {
          console.log(`✅ [CumulativeLeaderboard] 스크롤: ${normalizedUsername} 행으로 이동 (${retries}회 시도)`);
          targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (retries < maxRetries) {
          requestAnimationFrame(() => scrollToUser(retries + 1, maxRetries));
        } else {
          console.warn(`⚠️ [CumulativeLeaderboard] ${normalizedUsername} 행을 찾을 수 없음 (${maxRetries}회 시도 후 포기)`);
        }
      };

      // 같은 페이지면 즉시 스크롤 (API 대기 불필요)
      // 다른 페이지면 API 응답 대기 (재귀적 폴링)
      if (isSamePage) {
        console.log(`📍 [CumulativeLeaderboard] 현재 페이지(${currentPage}) = 목표 페이지(${page}) → 즉시 스크롤`);
        requestAnimationFrame(() => scrollToUser());
      } else {
        console.log(`📍 [CumulativeLeaderboard] 페이지 이동: ${currentPage} → ${page} (API 응답 대기)`);
        requestAnimationFrame(() => scrollToUser());
      }
    },
    [manager.handlers, manager.pagination.page, startHighlight, updateParams]
  );

  // 🆕 사용자 검색 선택 핸들러 (UserSearchBox용)
  const handleUserSelect = useCallback(
    (username: string, rank: number) => {
      const page = Math.ceil(rank / itemsPerPage);
      handleViewUserRank(page, username);
    },
    [itemsPerPage, handleViewUserRank]
  );

  // 🆕 스마트 기본값 로딩 중일 때 대기 (Race Condition 해결)
  // URL 파라미터가 없고 API에서 기본 기간을 가져오는 중이면 로딩 표시
  // 이렇게 하면 cumulative 데이터가 백그라운드에서 로드되더라도 사용자에게 보이지 않음
  if (isDefaultPeriodLoading && !params.period) {
    return (
      <div className="space-y-6">
        {showVersionSwitcher && (
          <div>
            <VersionSwitcher />
          </div>
        )}
        <SectionLoading />
      </div>
    );
  }

  // 로딩 상태 - 데이터가 없고 로딩 중일 때
  if (manager.loading && manager.entries.length === 0) {
    return (
      <div className="space-y-6">
        {showVersionSwitcher && (
          <div>
            <VersionSwitcher />
          </div>
        )}
        <SectionLoading />
      </div>
    );
  }

  // 에러 상태
  if (manager.error) {
    return (
      <div className="space-y-6">
        {showVersionSwitcher && (
          <div>
            <VersionSwitcher />
          </div>
        )}
        <ErrorState
          error={manager.error}
          onRetry={manager.handlers.handleRetry}
          onViewLatest={manager.handlers.handleViewLatest}
        />
      </div>
    );
  }

  // 메인 UI
  return (
    <div className="">
      {manager.metadata && (
        <CumulativeLeaderboardHeader
          data={{
            entries: manager.entries,
            metadata: manager.metadata,
            pagination: manager.pagination,
          }}
        />
      )}
      <div className="mb-4">
        <CumulativePeriodSelector
          currentPeriod={manager.currentPeriod}
          onPeriodChange={handlePeriodChangeWithUrl}
          loading={manager.loading}
          compact={false}
        />
      </div>

      {/* 나의 랭킹 카드 + 공유 버튼 그룹 */}
      <ShareButtonsGroup
        period={manager.currentPeriod}
        date={manager.selectedDate}
        onViewRank={handleViewUserRank}
        onBackToLatest={manager.handlers.handleViewLatest}
        myRankCardRef={myRankCardRef}
        myRankData={myRankData}
      />

      {/* 🆕 Top Climbers Spotlight */}
      <TopClimbersSpotlight
        period={manager.currentPeriod}
        onViewUserRank={handleViewUserRank}
      />

      {/* 스냅샷 뷰어 및 업데이트 시간 */}
      <SnapshotHeader
        selectedDate={manager.selectedDate}
        onDateChange={manager.handlers.handleDateChange}
        displayDate={manager.displayDate}
        generationTimestamp={manager.generationTimestamp}
        isSnapshotMode={manager.isSnapshotMode}
        loading={manager.loading}
      />

      {/* 리더보드 테이블 */}
      <div ref={tableRef} className="scroll-mt-20">
        <LeaderboardTableSection
          entries={manager.entries}
          loading={manager.loading}
          highlightedUsername={params.user ? params.user.toLowerCase() : null}
          isHighlighted={isHighlighted}
          showXUrl={true}
        />
      </div>

      {/* 페이지네이션 */}
      <div className="">
        <PaginationControls
          currentPage={manager.pagination.page}
          totalPages={manager.pagination.totalPages}
          totalEntries={manager.pagination.total}
          hasNext={manager.pagination.hasNext}
          hasPrev={manager.pagination.hasPrev}
          pageInput={manager.pagination.pageInput}
          paginationRange={manager.pagination.paginationRange}
          onPageChange={manager.handlers.onPageChange}
          onPageInputChange={manager.handlers.onPageInputChange}
          onPageInputSubmit={manager.handlers.onPageInputSubmit}
        />
      </div>

      {/* 🆕 Phase 1: 사용자 검색 박스 */}
      {/* 🆕 Phase 2: handleViewUserRank 핸들러로 변경 */}
      <div className="mt-8">
        <UserSearchBox
          period={manager.currentPeriod}
          date={manager.selectedDate || undefined}
          onUserSelect={handleUserSelect}
        />
      </div>
    </div>
  );
};

export default CumulativeLeaderboard;
