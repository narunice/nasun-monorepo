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

// Event status type for badge display
type EventStatus = 'ended' | 'live' | 'soon';

// Determine event status based on start/end dates
function getEventStatus(startDate?: string, endDate?: string): EventStatus | null {
  if (!startDate || !endDate) return null;
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (now > end) return 'ended';
  if (now >= start && now <= end) return 'live';
  if (now < start) return 'soon';
  return null;
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
          const label = String(t(periodKey));

          // Get event status for non-cumulative periods
          const status = lb.id !== "CUMULATIVE"
            ? getEventStatus(lb.startDate as string, lb.endDate as string)
            : null;

          return {
            value: periodLower as CumulativePeriod,
            label,
            shortLabel: String(t(`periods.${periodLower}Short`)),
            status,
            icon: getPeriodIcon(periodLower as CumulativePeriod),
          };
        });
    }, [t, configData, configError]);

    const handlePeriodClick = (period: CumulativePeriod) => {
      if (!isLoadingCombined && period !== currentPeriod) {
        onPeriodChange(period);
      }
    };

    // Status badge component
    const StatusBadge = ({ status }: { status: EventStatus | null }) => {
      if (!status) return null;

      const badgeStyles = {
        ended: 'bg-gray-600 text-gray-300',
        live: 'bg-green-600 text-white',
        soon: 'bg-yellow-600 text-white',
      };

      const statusLabels = {
        ended: t('eventStatus.ended', 'Ended'),
        live: t('eventStatus.live', 'Live'),
        soon: t('eventStatus.soon', 'Soon'),
      };

      return (
        <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${badgeStyles[status]}`}>
          {statusLabels[status]}
        </span>
      );
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
              px-3 py-1.5 font-medium rounded-lg flex items-center
              ${
                currentPeriod === option.value
                  ? "bg-white text-black shadow-sm"
                  : "text-white hover:bg-gray-700"
              }
              ${isLoadingCombined ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
            `}
            >
              <span className="hidden sm:inline">{option.label}</span>
              <span className="sm:hidden">{option.shortLabel}</span>
              <StatusBadge status={option.status} />
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
                relative px-1 py-1.5 font-medium outline-none flex items-center
                ${isActive ? "text-white" : "text-gray-400 hover:text-white"}
                ${isLoadingCombined ? "cursor-not-allowed opacity-60" : ""}
              `}
              >
                <span className="hidden sm:inline">{option.label}</span>
                <span className="sm:hidden">{option.shortLabel}</span>
                <StatusBadge status={option.status} />
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
