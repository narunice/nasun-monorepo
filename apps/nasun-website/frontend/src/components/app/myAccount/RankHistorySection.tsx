/**
 * 🆕 Rank History: RankHistorySection Component
 *
 * @description
 * My Account 페이지에서 사용자의 랭킹 히스토리를 표시하는 섹션 컴포넌트입니다.
 * 3개의 기간 탭(Cumulative, Event1, Event2)과 날짜 범위 선택 기능을 제공합니다.
 *
 * @author Claude Code
 * @date 2025-10-26
 */

import React, { useState, useRef, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  CumulativePeriod,
  DateRangeOption,
  DATE_RANGE_LABELS,
} from "@/features/leaderboard/types/leaderboard";
import { useUserRankHistory } from "@/features/leaderboard/hooks/useUserRankHistory";
import { useLeaderboardConfig } from "@/features/leaderboard/hooks/useLeaderboardConfig";
import { useSmartDefaultPeriod } from "@/features/leaderboard/hooks/useSmartDefaultPeriod";
import { RankHistoryChart } from "@/features/leaderboard/components/RankHistoryChart";
import { RankHistoryStatsCard } from "@/features/leaderboard/components/RankHistoryStatsCard";
import { ShareRankHistoryButton } from "@/features/leaderboard/components/ShareRankHistoryButton";
import { SectionLayout } from "../../layout/SectionLayout";
import { SectionLoading } from "../../ui";
import { useAuth } from "../../../providers/auth/AuthContext";

export interface RankHistorySectionProps {
  username: string | null; // X 사용자명 (null인 경우 미연결 상태)
  embedded?: boolean; // true when used inside DashboardCard (no SectionLayout)
}

/**
 * RankHistorySection 컴포넌트
 *
 * @param username - X 사용자명 (필수)
 *
 * @example
 * <RankHistorySection username="johndoe" />
 *
 * @example
 * // 조건부 렌더링
 * {user?.twitterHandle && <RankHistorySection username={user.twitterHandle} />}
 */
export const RankHistorySection: React.FC<RankHistorySectionProps> = ({ username, embedded = false }) => {
  const { t, i18n } = useTranslation(["myAccount", "common"]);
  const isKorean = i18n.language === "ko";
  const { user } = useAuth();
  const { data: configData } = useLeaderboardConfig();

  // 🆕 스마트 기본값 로직
  const { defaultPeriod, availableLeaderboards } = useSmartDefaultPeriod();

  // Ref for chart capture
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // 상태 관리 - 스마트 기본값 사용
  const [selectedPeriod, setSelectedPeriod] = useState<CumulativePeriod>(defaultPeriod);
  const [selectedDays, setSelectedDays] = useState<DateRangeOption>(DateRangeOption.DAYS_7);

  // 🆕 스마트 기본값이 로딩 후 변경되면 상태 업데이트
  useEffect(() => {
    // 설정이 로드되면 스마트 기본값으로 업데이트
    // 단, 현재 선택된 기간이 visible이면 그대로 유지
    const isCurrentPeriodVisible =
      availableLeaderboards?.some((lb) => lb.id.toLowerCase() === selectedPeriod && lb.visible) ??
      true;

    if (!isCurrentPeriodVisible) {
      setSelectedPeriod(defaultPeriod);
    }
  }, [defaultPeriod, availableLeaderboards, selectedPeriod]);

  // X 계정 미연결 여부
  const isNotConnected = !username;

  // 랭킹 히스토리 조회
  const { data, isLoading, isError, isEmpty, error } = useUserRankHistory({
    username: username || "",
    period: selectedPeriod,
    days: selectedDays,
    enabled: !!username,
  });

  // USER_NOT_FOUND 케이스 (리더보드 미참여)
  const isNotParticipating = !isNotConnected && !isLoading && data === null && !isError;

  // 🆕 기간 옵션 (탭) - visible한 리더보드만 표시
  const periodOptions = useMemo(() => {
    const allOptions = [
      { value: CumulativePeriod.CUMULATIVE, label: t("rankHistory.periods.cumulative") },
      { value: CumulativePeriod.EVENT1, label: t("rankHistory.periods.event1") },
      { value: CumulativePeriod.EVENT2, label: t("rankHistory.periods.event2") },
      { value: CumulativePeriod.EVENT3, label: t("rankHistory.periods.event3") },
    ];

    // 설정이 없으면 모든 옵션 표시
    if (!availableLeaderboards) {
      return allOptions;
    }

    // visible한 리더보드만 필터링
    return allOptions.filter((option) => {
      const leaderboard = availableLeaderboards.find((lb) => lb.id.toLowerCase() === option.value);
      return leaderboard?.visible ?? false;
    });
  }, [availableLeaderboards, t]);

  // 날짜 범위 옵션
  const dateRangeOptions = [
    {
      value: DateRangeOption.DAYS_7,
      label: DATE_RANGE_LABELS[DateRangeOption.DAYS_7][isKorean ? "ko" : "en"],
    },
    {
      value: DateRangeOption.DAYS_14,
      label: DATE_RANGE_LABELS[DateRangeOption.DAYS_14][isKorean ? "ko" : "en"],
    },
    {
      value: DateRangeOption.DAYS_30,
      label: DATE_RANGE_LABELS[DateRangeOption.DAYS_30][isKorean ? "ko" : "en"],
    },
    {
      value: DateRangeOption.DAYS_90,
      label: DATE_RANGE_LABELS[DateRangeOption.DAYS_90][isKorean ? "ko" : "en"],
    },
    {
      value: DateRangeOption.DAYS_365,
      label: DATE_RANGE_LABELS[DateRangeOption.DAYS_365][isKorean ? "ko" : "en"],
    },
  ];

  const content = (
    <>
      {/* Section Title with Share Button (only when embedded) */}
      {embedded && (
        <div className="flex items-center justify-between mb-4">
          <h5 className="uppercase text-nasun-white">
            {t("rankHistory.title")}
          </h5>
          {/* 공유 버튼 (데이터 있을 때만 표시) */}
          {data && data.history.length > 0 && !isLoading && (
            <ShareRankHistoryButton
              chartRef={chartContainerRef}
              username={username || ""}
              period={selectedPeriod}
              days={selectedDays}
            />
          )}
        </div>
      )}

      {/* 컨트롤 영역 (탭 + 날짜 범위) */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        {/* 기간 탭 */}
        <div className="border-b border-gray-700">
          <div className="flex items-center space-x-4">
            {periodOptions.map((option) => {
              const isActive = selectedPeriod === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setSelectedPeriod(option.value)}
                  className={`
                    relative px-1 py-3 font-medium outline-none
                    ${isActive ? "text-white" : "text-gray-400 hover:text-white"}
                  `}
                >
                  {option.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-white rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 날짜 범위 선택 */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2">
            <label htmlFor="date-range" className="font-medium text-white">
              {t("rankHistory.dateRange")}:
            </label>
            <select
              id="date-range"
              value={selectedDays}
              onChange={(e) => setSelectedDays(Number(e.target.value) as DateRangeOption)}
              className="px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {dateRangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 공유 버튼 (embedded가 아닐 때만 여기 표시) */}
          {!embedded && data && data.history.length > 0 && !isLoading && (
            <ShareRankHistoryButton
              chartRef={chartContainerRef}
              username={username || ""}
              period={selectedPeriod}
              days={selectedDays}
            />
          )}
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="mt-6">
        {/* X 계정 미연결 */}
        {isNotConnected && (
          <div className="flex items-center justify-center min-h-[200px] bg-blue-900/20 rounded-lg border border-blue-800">
            <div className="text-center p-6">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-blue-300 font-medium">{t("rankHistory.notConnected")}</p>
            </div>
          </div>
        )}

        {/* 리더보드 미참여 (USER_NOT_FOUND) */}
        {isNotParticipating && (
          <div className="flex items-center justify-center min-h-[230px] bg-yellow-900/20 rounded-lg border border-yellow-800">
            <div className="text-center p-6">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-yellow-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-yellow-300 font-medium">
                {(() => {
                  const targetAccount = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
                  const periodName =
                    selectedPeriod === CumulativePeriod.CUMULATIVE
                      ? t("rankHistory.periods.cumulative")
                      : selectedPeriod === CumulativePeriod.EVENT1
                      ? t("rankHistory.periods.event1")
                      : selectedPeriod === CumulativePeriod.EVENT2
                      ? t("rankHistory.periods.event2")
                      : t("rankHistory.periods.event3");

                  if (selectedPeriod === CumulativePeriod.CUMULATIVE) {
                    return t("rankHistory.notParticipating", { targetAccount });
                  }

                  // API 데이터에서 현재 기간의 종료일 확인
                  const leaderboard = configData?.data?.availableLeaderboards?.find(
                    (lb) => lb.id.toLowerCase() === selectedPeriod
                  );
                  const eventEnded = leaderboard?.endDate
                    ? new Date(leaderboard.endDate) < new Date()
                    : false;

                  if (eventEnded) {
                    return t("rankHistory.notParticipatingInPeriodEnded", { periodName });
                  } else {
                    return t("rankHistory.notParticipatingInPeriodOngoing", {
                      periodName,
                      targetAccount,
                    });
                  }
                })()}
              </p>
            </div>
          </div>
        )}

        {/* 로딩 중 */}
        {isLoading && !isNotConnected && <SectionLoading showLayout={false} />}

        {/* 에러 */}
        {isError && !isNotConnected && (
          <div className="flex items-center justify-center min-h-[210px] bg-red-900/20 rounded-lg border border-red-800">
            <div className="text-center p-6">
              <p className="text-red-400 font-medium mb-2">{t("rankHistory.error")}</p>
              <p className="text-red-300">{error?.message || t("rankHistory.unknownError")}</p>
            </div>
          </div>
        )}

        {/* 히스토리 데이터 없음 (NO_HISTORY) */}
        {isEmpty && !isLoading && !isError && !isNotConnected && (
          <div className="flex items-center justify-center min-h-[210px] bg-gray-900 rounded-lg border border-gray-700">
            <div className="text-center p-6">
              <p className="text-gray-400 mb-2">{t("rankHistory.noData")}</p>
              <p className="text-gray-500">{t("rankHistory.noDataDescription")}</p>
            </div>
          </div>
        )}

        {data && data.history.length > 0 && !isLoading && (
          <>
            {/* 스크린샷 캡처 영역: 통계 카드 + 차트만 */}
            <div ref={chartContainerRef} className="rounded-lg">
              {/* 통합 통계 카드 */}
              <RankHistoryStatsCard
                bestRank={data.stats.bestRank}
                averageRank={data.stats.averageRank}
                username={username || ""}
                profileImageUrl={user?.profileImageUrl}
                displayName={data.history[0]?.displayName}
                period={selectedPeriod}
              />

              {/* 차트 */}
              <RankHistoryChart history={data.history} />
            </div>
          </>
        )}
      </div>
    </>
  );

  // When embedded, render without SectionLayout wrapper
  if (embedded) {
    return content;
  }

  return (
    <SectionLayout title={t("rankHistory.title")} titleAs="h3">
      {content}
    </SectionLayout>
  );
};
