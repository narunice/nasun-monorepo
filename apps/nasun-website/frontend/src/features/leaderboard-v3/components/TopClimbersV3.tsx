/**
 * TopClimbersV3 Component
 *
 * Spotlight section showing users with biggest rank improvements.
 * Based on V2 TopClimbersSpotlight pattern.
 */

import React, { useState } from 'react';
import { OuterBox } from '@/components/ui/OuterBox';
import { useTopClimbersV3 } from '../hooks/useTopClimbersV3';
import type { TimeRangeV3 } from '../types';
import { TIME_RANGE_LABELS } from '../types';
import ClimberCardV3 from './ClimberCardV3';

interface TopClimbersV3Props {
  seasonId?: string;
}

const TIME_RANGES: TimeRangeV3[] = ['today', '7d', '4w'];

const TopClimbersV3: React.FC<TopClimbersV3Props> = ({ seasonId }) => {
  const [timeRange, setTimeRange] = useState<TimeRangeV3>('7d');

  const { data, isLoading, error } = useTopClimbersV3({
    seasonId,
    range: timeRange,
    limit: 5,
  });

  // Loading skeleton
  if (isLoading) {
    return (
      <OuterBox color="c6" className="w-full border-nasun-c5/30 bg-gray-800/30">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-nasun-white flex items-center gap-2">
            <span className="text-xl">🏆</span> Top Climbers
          </h3>
          <div className="flex gap-2 animate-pulse">
            {TIME_RANGES.map((r) => (
              <div key={r} className="h-8 w-16 bg-nasun-c5/20 rounded-lg"></div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-48 bg-nasun-c5/10 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </OuterBox>
    );
  }

  // Error state
  if (error) {
    return (
      <OuterBox color="c6" className="w-full border-nasun-c5/30 bg-gray-800/30">
        <div className="text-center py-8 text-nasun-white/50">
          Failed to load top climbers. Please try again later.
        </div>
      </OuterBox>
    );
  }

  // No data
  if (!data || data.climbers.length === 0) {
    return (
      <OuterBox color="c6" className="w-full border-nasun-c5/30 bg-gray-800/30">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-nasun-white flex items-center gap-2">
            <span className="text-xl">🏆</span> Top Climbers
          </h3>
          <TimeRangeSelectorInline
            selected={timeRange}
            onSelect={setTimeRange}
            ranges={TIME_RANGES}
          />
        </div>
        <div className="text-center py-8 text-nasun-white/50">
          No rank improvements in this period yet.
        </div>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="c6" className="w-full border-nasun-c5/30 bg-gray-800/30">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-nasun-white flex items-center gap-2">
          <span className="text-xl">🏆</span> Top Climbers
        </h3>
        <TimeRangeSelectorInline
          selected={timeRange}
          onSelect={setTimeRange}
          ranges={TIME_RANGES}
        />
      </div>

      {/* Climber cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {data.climbers.slice(0, 5).map((climber, index) => (
          <ClimberCardV3 key={climber.accountId} climber={climber} position={index + 1} />
        ))}
      </div>
    </OuterBox>
  );
};

// Inline time range selector
interface TimeRangeSelectorInlineProps {
  selected: TimeRangeV3;
  onSelect: (range: TimeRangeV3) => void;
  ranges: TimeRangeV3[];
}

function TimeRangeSelectorInline({
  selected,
  onSelect,
  ranges,
}: TimeRangeSelectorInlineProps) {
  return (
    <div className="flex gap-1 bg-nasun-c6/50 p-1 rounded-lg">
      {ranges.map((range) => (
        <button
          key={range}
          onClick={() => onSelect(range)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            selected === range
              ? 'bg-nasun-c4 text-nasun-white shadow'
              : 'text-nasun-white/50 hover:text-nasun-white hover:bg-white/5'
          }`}
        >
          {TIME_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}

export default TopClimbersV3;
