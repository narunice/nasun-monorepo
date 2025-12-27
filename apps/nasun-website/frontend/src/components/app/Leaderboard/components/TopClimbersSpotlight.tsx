/**
 * 🆕 TopClimbersSpotlight Component
 *
 * @description
 * 지정된 기간 동안 순위가 가장 많이 상승한 상위 5명의 사용자를 표시하는 컴포넌트입니다.
 * - TimeRangeSelector로 시간 범위 선택 (Today, 7D, 4W, 3M)
 * - ClimberCard 5개 그리드 레이아웃 (반응형)
 * - 로딩/에러/빈 상태 처리
 * - 이벤트 리더보드는 4W, 3M 비활성화
 *
 * @author Claude Code
 * @date 2025-11-22
 */

import React, { useState, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useTopClimbers } from "../hooks/useTopClimbers";
import TimeRangeSelector from "./TimeRangeSelector";
import ClimberCard from "./ClimberCard";
import ClimberCardSkeleton from "./ClimberCardSkeleton";
import { CumulativePeriod, TimeRange } from "../types/leaderboard";
import { Trophy, TrendingUp } from "lucide-react";

export interface TopClimbersSpotlightProps {
  /** 현재 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2) */
  period: CumulativePeriod;
  /** 초기 시간 범위 (기본값: 'today') */
  initialTimeRange?: TimeRange;
  /** 표시할 climbers 수 (기본값: 5) */
  limit?: number;
  /** 리더보드 테이블로 점프하는 핸들러 (페이지, 사용자명) */
  onViewUserRank?: (page: number, username: string) => void;
}

const TopClimbersSpotlight: React.FC<TopClimbersSpotlightProps> = memo(
  ({ period, initialTimeRange = "today", limit = 5, onViewUserRank }) => {
    const { t } = useTranslation("leaderboard");

    // 시간 범위 상태 (내부 제어)
    const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>(initialTimeRange);

    // Top Climbers 데이터 가져오기
    const { data, isLoading, error } = useTopClimbers({
      period,
      timeRange: selectedTimeRange,
      limit,
    });

    // 시간 범위 변경 핸들러
    const handleTimeRangeChange = useCallback(
      (timeRange: TimeRange) => {
        console.log(
          `🔄 [TopClimbersSpotlight] 시간 범위 변경: ${selectedTimeRange} → ${timeRange}`
        );
        setSelectedTimeRange(timeRange);
      },
      [selectedTimeRange]
    );

    // 리더보드 테이블로 점프하는 핸들러 (ClimberCard → CumulativeLeaderboard 연결)
    const handleViewInLeaderboard = useCallback(
      (username: string, rank: number) => {
        if (!onViewUserRank) return;

        const itemsPerPage = 50; // CUMULATIVE_LEADERBOARD_CONFIG.DEFAULT_ITEMS_PER_PAGE
        const page = Math.ceil(rank / itemsPerPage);

        console.log(
          `🎯 [TopClimbersSpotlight] 리더보드로 이동: ${username} (Rank ${rank}, Page ${page})`
        );
        onViewUserRank(page, username);
      },
      [onViewUserRank]
    );

    // 로딩 상태 (스켈레톤 카드로 레이아웃 유지)
    if (isLoading) {
      return (
        <div className="mb-8 md:mb-10 xl:mb-12">
          {/* 헤더 (실제와 동일) */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              <h3 className="font-medium text-nasun-white uppercase">
                {t("topClimbers.title", "Top Climbers Spotlight")}
              </h3>
            </div>
            <TimeRangeSelector
              selectedTimeRange={selectedTimeRange}
              onTimeRangeChange={handleTimeRangeChange}
              period={period}
              loading={true}
              compact={true}
            />
          </div>

          {/* 스켈레톤 카드 그리드 (실제 카드와 동일한 레이아웃) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: limit }).map((_, index) => (
              <ClimberCardSkeleton key={`skeleton-${index}`} rank={index + 1} />
            ))}
          </div>
        </div>
      );
    }

    // 에러 상태
    if (error) {
      return (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <Trophy className="w-5 h-5" />
            <span className="font-medium">
              {t("topClimbers.errorLoading", "Failed to load Top Climbers")}
            </span>
          </div>
          <p className="text-red-600 dark:text-red-500 mt-1 ml-7">{error.message}</p>
        </div>
      );
    }

    // 빈 상태 (climbers가 없을 때)
    if (!data || data.climbers.length === 0) {
      return (
        <div className="mb-6">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              <h3 className="font-medium text-nasun-white uppercase">
                {t("topClimbers.title", "Top Climbers Spotlight")}
              </h3>
            </div>
            <TimeRangeSelector
              selectedTimeRange={selectedTimeRange}
              onTimeRangeChange={handleTimeRangeChange}
              period={period}
              loading={isLoading}
              compact={true}
            />
          </div>

          {/* 빈 상태 메시지 */}
          <div className="bg-nasun-c6/60  border border-white/20 rounded-lg p-8 text-center">
            <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {t("topClimbers.noClimbers", "No rank improvements found in this period")}
            </p>
            <p className="text-gray-400 dark:text-gray-500 mt-1">
              {t("topClimbers.tryDifferentPeriod", "Try selecting a different time range")}
            </p>
          </div>
        </div>
      );
    }

    // 메인 UI (climbers 있을 때)
    return (
      <div className="mb-8 md:mb-10 xl:mb-12 ">
        {/* 헤더 */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500 " />
            <h3 className="font-medium text-nasun-white uppercase">
              {t("topClimbers.title", "Top Climbers Spotlight")}
            </h3>
          </div>
          <TimeRangeSelector
            selectedTimeRange={selectedTimeRange}
            onTimeRangeChange={handleTimeRangeChange}
            period={period}
            loading={isLoading}
            compact={true}
          />
        </div>

        {/* Climbers 그리드 (반응형: 1 → 3 → 5 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {data.climbers.map((climber, index) => (
            <ClimberCard
              key={climber.userId}
              climber={climber}
              rank={index + 1}
              onViewInLeaderboard={handleViewInLeaderboard}
            />
          ))}
        </div>
      </div>
    );
  }
);

TopClimbersSpotlight.displayName = "TopClimbersSpotlight";

export default TopClimbersSpotlight;
