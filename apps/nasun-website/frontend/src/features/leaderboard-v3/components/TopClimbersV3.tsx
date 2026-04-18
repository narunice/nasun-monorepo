/**
 * TopClimbersV3 Component
 *
 * Spotlight section showing users with biggest rank improvements.
 * Based on V2 TopClimbersSpotlight pattern.
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useTopClimbersV3 } from "../hooks/useTopClimbersV3";
import type { TimeRangeV3 } from "../types";
import { TIME_RANGE_LABELS } from "../types";
import ClimberCardV3 from "./ClimberCardV3";

interface TopClimbersV3Props {
  seasonId?: string;
}

const TIME_RANGES: TimeRangeV3[] = ["today", "7d", "4w"];

/**
 * Get responsive visibility class for each card based on index
 * - xl: 5 cards, lg: 4 cards, sm+: 3 cards (minimum 3)
 */
const getVisibilityClass = (index: number): string => {
  switch (index) {
    case 3:
      return "hidden lg:block"; // 4th: lg+ only
    case 4:
      return "hidden xl:block"; // 5th: xl only
    default:
      return ""; // 1st, 2nd, 3rd: always visible
  }
};

const TopClimbersV3: React.FC<TopClimbersV3Props> = ({ seasonId }) => {
  const { t } = useTranslation("leaderboard");
  const [timeRange, setTimeRange] = useState<TimeRangeV3>("today");

  const { data, isLoading, error } = useTopClimbersV3({
    seasonId,
    range: timeRange,
    limit: 5,
  });

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-nasun-nw1" />
            <SectionTitle as="h3" className="uppercase font-medium !mb-0">
              {t("v3.climbers.title")}
            </SectionTitle>
          </div>
          <div className="inline-flex border border-nasun-nw3/30 bg-nasun-nw3/10 p-1 rounded-sm animate-pulse">
            {TIME_RANGES.map((r) => (
              <div key={r} className="h-7 w-14 bg-nasun-nw3/20 rounded-sm mx-0.5"></div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={getVisibilityClass(i)}>
              <div className="h-56 bg-nasun-nw3/10 border border-nasun-nw3/25 rounded-sm animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full text-center py-8 text-nasun-nw4">
        {t("v3.climbers.loadError")}
      </div>
    );
  }

  if (!data || data.climbers.length === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-nasun-nw1" />
            <SectionTitle as="h3" className="uppercase font-medium !mb-0">
              {t("v3.climbers.title")}
            </SectionTitle>
          </div>
          <TimeRangeSelectorInline
            selected={timeRange}
            onSelect={setTimeRange}
            ranges={TIME_RANGES}
          />
        </div>
        <div className="text-center py-8 text-nasun-nw4">
          {t("v3.climbers.noData")}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-nasun-nw1" />
          <SectionTitle as="h3" className="uppercase font-medium !mb-0">
            {t("v3.climbers.title")}
          </SectionTitle>
        </div>
        <TimeRangeSelectorInline
          selected={timeRange}
          onSelect={setTimeRange}
          ranges={TIME_RANGES}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {data.climbers.slice(0, 5).map((climber, index) => (
          <div key={climber.accountId} className={getVisibilityClass(index)}>
            <ClimberCardV3 climber={climber} />
          </div>
        ))}
      </div>
    </div>
  );
};

interface TimeRangeSelectorInlineProps {
  selected: TimeRangeV3;
  onSelect: (range: TimeRangeV3) => void;
  ranges: TimeRangeV3[];
}

function TimeRangeSelectorInline({ selected, onSelect, ranges }: TimeRangeSelectorInlineProps) {
  return (
    <div className="inline-flex border border-nasun-nw3/30 bg-nasun-nw3/10 p-1 rounded-sm">
      {ranges.map((range) => (
        <button
          key={range}
          onClick={() => onSelect(range)}
          className={`px-3 py-1 rounded-sm text-sm transition-all ${
            selected === range
              ? "bg-nasun-nw2/60 text-nasun-white font-medium"
              : "text-nasun-nw4 hover:text-nasun-white hover:bg-nasun-nw3/30"
          }`}
        >
          {TIME_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}

export default TopClimbersV3;
