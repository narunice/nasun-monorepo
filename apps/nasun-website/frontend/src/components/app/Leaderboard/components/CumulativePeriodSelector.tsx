import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CumulativePeriod } from "../types";
import { useLeaderboardConfig } from "../hooks/useLeaderboardConfig";

interface CumulativePeriodSelectorProps {
  currentPeriod: CumulativePeriod;
  onPeriodChange: (period: CumulativePeriod) => void;
  loading?: boolean;
  compact?: boolean;
}

// 언어 독립적인 날짜 포맷 함수 (M/D 형식) - 컴포넌트 외부로 이동
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const month = date.getMonth() + 1; // 0-based to 1-based
  const day = date.getDate();
  return `${month}/${day}`;
}

// getPeriodIcon 함수 - 컴포넌트 외부로 이동
function getPeriodIcon(period: CumulativePeriod): string {
  switch (period) {
    case CumulativePeriod.CUMULATIVE:
      return "";
    case CumulativePeriod.EVENT1:
      return "";
    case CumulativePeriod.EVENT2:
      return "";
    default:
      return "";
  }
}

const CumulativePeriodSelector: React.FC<CumulativePeriodSelectorProps> = memo(
  ({
    currentPeriod,
    onPeriodChange,
    loading = false,
    compact = false,
  }) => {
    const { t } = useTranslation("leaderboard");
    const { data: configData, isLoading: isConfigLoading, error: configError } = useLeaderboardConfig();

    const isLoadingCombined = loading || isConfigLoading;

    const periodOptions = useMemo(() => {
      if (configError) {
        console.error("Error fetching leaderboard config:", configError);
        return []; // 에러 발생 시 빈 배열 반환
      }
      if (!configData?.data?.availableLeaderboards) {
        return [];
      }

      return configData.data.availableLeaderboards
        .filter(lb => lb.visible) // visible이 true인 리더보드만 필터링
        .map((lb) => {
          const periodLower = lb.id.toLowerCase() as "cumulative" | "event1" | "event2";
          const periodKey = `periods.${periodLower}` as const;
          let label = String(t(periodKey));

          if (lb.startDate && lb.endDate && lb.id !== "CUMULATIVE") {
            const startDate = formatDate(lb.startDate as string);
            const endDate = formatDate(lb.endDate as string);
            label = `${label} (${startDate} - ${endDate})`;
          }

          if (lb.id !== "CUMULATIVE" && lb.endDate && new Date(lb.endDate) < new Date()) {
            label = `${label} - ${String(t("displayDate.eventEnded"))}`;
          }

          return {
            value: periodLower as CumulativePeriod,
            label: label,
            // description 키는 i18n 타입 정의에 없으므로 빈 문자열 사용 (현재 UI에서 미사용)
            description: "",
            icon: getPeriodIcon(periodLower as CumulativePeriod),
          };
        });
    }, [t, configData, configError]);

    const handlePeriodClick = (period: CumulativePeriod) => {
      if (!isLoadingCombined && period !== currentPeriod) {
        onPeriodChange(period);
      }
    };

    if (compact) {
      return (
        <div className="inline-flex bg-gray-800 p-1 rounded-lg">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handlePeriodClick(option.value)}
              disabled={isLoadingCombined}
              className={`
              px-3 py-1.5 font-medium rounded-lg
              ${
                currentPeriod === option.value
                  ? "bg-white text-black shadow-sm"
                  : "text-white hover:bg-gray-700"
              }
              ${isLoadingCombined ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
            `}
            >
              {String(option.label)}
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className="border-b border-gray-700">
        <div className="flex items-center space-x-4">
          {periodOptions.map((option) => {
            const isActive = currentPeriod === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handlePeriodClick(option.value)}
                disabled={isLoadingCombined}
                className={`
                relative px-1 py-1.5 font-medium outline-none
                ${isActive ? "text-white" : "text-gray-400 hover:text-white"}
                ${isLoadingCombined ? "cursor-not-allowed opacity-60" : ""}
              `}
              >
                {String(option.label)}
                {isActive && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-white rounded-lg-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

CumulativePeriodSelector.displayName = "CumulativePeriodSelector";

export default CumulativePeriodSelector;
