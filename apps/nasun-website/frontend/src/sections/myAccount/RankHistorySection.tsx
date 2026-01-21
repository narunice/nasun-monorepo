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
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionLoading } from "@/components/ui";
import { useAuth } from "@/features/auth";

import { RankHistoryTabs } from "./components/RankHistoryTabs";
import { RankHistoryControls } from "./components/RankHistoryControls";
import { RankHistoryStatus } from "./components/RankHistoryStatus";

export interface RankHistorySectionProps {
  username: string | null; // X 사용자명 (null인 경우 미연결 상태)
  embedded?: boolean; // true when used inside OuterBox (no SectionLayout)
}

/**
 * RankHistorySection 컴포넌트
 *
 * @param username - X 사용자명 (필수)
 */
export const RankHistorySection: React.FC<RankHistorySectionProps> = ({
  username,
  embedded = false,
}) => {
  const { t, i18n } = useTranslation(["myAccount", "common"]);
  const isKorean = i18n.language === "ko";
  const { user } = useAuth();
  const { data: configData } = useLeaderboardConfig();

  // 🆕 스마트 기본값 로직
  const { defaultPeriod, availableLeaderboards } = useSmartDefaultPeriod();

  // Ref for chart capture
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  // 상태 관리 - 스마트 기본값 사용
  const [selectedPeriod, setSelectedPeriod] = useState<CumulativePeriod>(defaultPeriod);
  const [selectedDays, setSelectedDays] = useState<DateRangeOption>(DateRangeOption.DAYS_7);

  // 🆕 스마트 기본값이 로딩 후 변경되면 상태 업데이트
  useEffect(() => {
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

    if (!availableLeaderboards) return allOptions;

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
          <h5 className="font-medium uppercase text-nasun-white">{t("rankHistory.title")}</h5>
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
        <RankHistoryTabs
          options={periodOptions}
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
        />

        <RankHistoryControls
          label={t("rankHistory.dateRange")}
          selectedDays={selectedDays}
          onDaysChange={setSelectedDays}
          dateRangeOptions={dateRangeOptions}
          showShareButton={!embedded && !!data && data.history.length > 0 && !isLoading}
          chartRef={chartContainerRef}
          username={username || ""}
          selectedPeriod={selectedPeriod}
        />
      </div>

      {/* 차트 영역 */}
      <div className="mt-6">
        {isNotConnected && (
          <RankHistoryStatus type="notConnected" message={t("rankHistory.notConnected")} />
        )}

        {isNotParticipating && (
          <RankHistoryStatus
            type="notParticipating"
            message={(() => {
              const targetAccount = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
              const periodName = periodOptions.find(opt => opt.value === selectedPeriod)?.label || "";

              if (selectedPeriod === CumulativePeriod.CUMULATIVE) {
                return t("rankHistory.notParticipating", { targetAccount });
              }

              const leaderboard = configData?.data?.availableLeaderboards?.find(
                (lb) => lb.id.toLowerCase() === selectedPeriod
              );
              const eventEnded = leaderboard?.endDate ? new Date(leaderboard.endDate) < new Date() : false;

              return eventEnded
                ? t("rankHistory.notParticipatingInPeriodEnded", { periodName })
                : t("rankHistory.notParticipatingInPeriodOngoing", { periodName, targetAccount });
            })()}
          />
        )}

        {isLoading && !isNotConnected && <SectionLoading showLayout={false} />}

        {isError && !isNotConnected && (
          <RankHistoryStatus
            type="error"
            message={t("rankHistory.error")}
            description={error?.message || t("rankHistory.unknownError")}
          />
        )}

        {isEmpty && !isLoading && !isError && !isNotConnected && (
          <RankHistoryStatus
            type="empty"
            message={t("rankHistory.noData")}
            description={t("rankHistory.noDataDescription")}
          />
        )}

        {data && data.history.length > 0 && !isLoading && (
          <div ref={chartContainerRef} className="rounded-lg">
            <RankHistoryStatsCard
              bestRank={data.stats.bestRank}
              averageRank={data.stats.averageRank}
              username={username || ""}
              profileImageUrl={user?.profileImageUrl}
              displayName={data.history[0]?.displayName}
              period={selectedPeriod}
            />
            <RankHistoryChart history={data.history} />
          </div>
        )}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <SectionLayout title={t("rankHistory.title")} titleAs="h3">
      {content}
    </SectionLayout>
  );
};