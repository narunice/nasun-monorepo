/**
 * 🆕 TimeRangeSelector Component
 *
 * @description
 * Top Climbers Spotlight의 시간 범위 선택 컴포넌트입니다.
 * - 4개 버튼: Today, 7D, 4W, 3M
 * - 이벤트 리더보드는 4W, 3M 비활성화 (today, 7d만 지원)
 * - 다크 모드 지원
 * - 국제화 (한국어/영어)
 *
 * @author Claude Code
 * @date 2025-11-22
 */

import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TimeRange, TIME_RANGE_LABELS, CumulativePeriod } from "../types/leaderboard";

export interface TimeRangeSelectorProps {
  /** 현재 선택된 시간 범위 */
  selectedTimeRange: TimeRange;
  /** 시간 범위 변경 핸들러 */
  onTimeRangeChange: (timeRange: TimeRange) => void;
  /** 현재 리더보드 기간 (EVENT는 4W, 3M 비활성화) */
  period: CumulativePeriod;
  /** 로딩 중 여부 */
  loading?: boolean;
  /** 컴팩트 모드 (더 작은 버튼) */
  compact?: boolean;
  /** 전체 비활성화 */
  disabled?: boolean;
}

const TimeRangeSelector: React.FC<TimeRangeSelectorProps> = memo(
  ({
    selectedTimeRange,
    onTimeRangeChange,
    period,
    loading = false,
    compact = false,
    disabled = false,
  }) => {
    const { i18n } = useTranslation();

    // 시간 범위 옵션 (today, 7d, 4w, 3m)
    const timeRangeOptions = useMemo((): TimeRange[] => {
      return ["today", "7d", "4w", "3m"];
    }, []);

    // 이벤트 리더보드는 4W, 3M 비활성화
    const isEventLeaderboard =
      period === CumulativePeriod.EVENT1 || period === CumulativePeriod.EVENT2;

    const isTimeRangeDisabled = (timeRange: TimeRange): boolean => {
      if (disabled || loading) return true;
      if (isEventLeaderboard && (timeRange === "4w" || timeRange === "3m")) {
        return true;
      }
      return false;
    };

    const handleTimeRangeClick = (timeRange: TimeRange) => {
      if (!isTimeRangeDisabled(timeRange) && timeRange !== selectedTimeRange) {
        onTimeRangeChange(timeRange);
      }
    };

    const getLabel = (timeRange: TimeRange): string => {
      const currentLang = i18n.language as "ko" | "en";
      return TIME_RANGE_LABELS[timeRange][currentLang] || TIME_RANGE_LABELS[timeRange].en;
    };

    // Compact 모드 (작은 버튼 그룹)
    if (compact) {
      return (
        <div className="inline-flex border border-nasun-c4/50 bg-black/60 p-1 rounded-lg">
          {timeRangeOptions.map((timeRange) => {
            const isActive = selectedTimeRange === timeRange;
            const isDisabled = isTimeRangeDisabled(timeRange);

            return (
              <button
                key={timeRange}
                onClick={() => handleTimeRangeClick(timeRange)}
                disabled={isDisabled}
                aria-label={`Select ${getLabel(timeRange)}`}
                className={`
                px-3 py-1 rounded-2xl transition-all duration-200 text-sm font-light
                ${
                  isActive
                    ? "bg-nasun-c4/80 text-nasun-white"
                    : "text-nasun-white  hover:bg-gray-700 "
                }
                ${isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}
              `}
              >
                {getLabel(timeRange)}
              </button>
            );
          })}
        </div>
      );
    }

    // 일반 모드 (큰 버튼 그룹)
    return (
      <div className="inline-flex border border-nasun-c4 bg-nasun-black dark:bg-nasun-white p-1.5 rounded-lg gap-1">
        {timeRangeOptions.map((timeRange) => {
          const isActive = selectedTimeRange === timeRange;
          const isDisabled = isTimeRangeDisabled(timeRange);

          return (
            <button
              key={timeRange}
              onClick={() => handleTimeRangeClick(timeRange)}
              disabled={isDisabled}
              aria-label={`Select ${getLabel(timeRange)}`}
              className={`
              px-4 py-2 rounded-lg transition-all duration-200 text-sm font-light
              ${
                isActive
                  ? "bg-nasun-white dark:bg-nasun-black text-nasun-black dark:text-nasun-white shadow-md"
                  : "text-nasun-white dark:text-nasun-black hover:bg-gray-700 dark:hover:bg-gray-300"
              }
              ${isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}
            `}
            >
              {getLabel(timeRange)}
            </button>
          );
        })}
      </div>
    );
  }
);

TimeRangeSelector.displayName = "TimeRangeSelector";

export default TimeRangeSelector;
