/**
 * TopClimbersV3 Component
 *
 * Spotlight section showing users with biggest rank improvements.
 * Based on V2 TopClimbersSpotlight pattern.
 */

import React, { useState } from 'react';
import { Trophy } from 'lucide-react';
import { useTopClimbersV3 } from '../hooks/useTopClimbersV3';
import type { TimeRangeV3 } from '../types';
import { TIME_RANGE_LABELS } from '../types';
import ClimberCardV3 from './ClimberCardV3';

interface TopClimbersV3Props {
  seasonId?: string;
}

const TIME_RANGES: TimeRangeV3[] = ['today', '7d', '4w'];

/**
 * Get responsive visibility class for each card based on index
 * - xl: 5 cards, lg: 4 cards, sm+: 3 cards (minimum 3)
 */
const getVisibilityClass = (index: number): string => {
  switch (index) {
    case 3:
      return 'hidden lg:block'; // 4th: lg+ only
    case 4:
      return 'hidden xl:block'; // 5th: xl only
    default:
      return ''; // 1st, 2nd, 3rd: always visible
  }
};

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
      <div className="w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <h3 className="font-medium text-nasun-white uppercase">
              Top Climbers Spotlight
            </h3>
          </div>
          <div className="inline-flex border border-nasun-c4/50 bg-black/60 p-1 rounded-lg animate-pulse">
            {TIME_RANGES.map((r) => (
              <div key={r} className="h-7 w-14 bg-nasun-c4/20 rounded-2xl mx-0.5"></div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={getVisibilityClass(i)}>
              <div className="h-52 bg-nasun-c4/10 border border-nasun-c4/50 rounded-xl animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full text-center py-8 text-nasun-white/50">
        Failed to load top climbers. Please try again later.
      </div>
    );
  }

  // No data
  if (!data || data.climbers.length === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <h3 className="font-medium text-nasun-white uppercase">
              Top Climbers Spotlight
            </h3>
          </div>
          <TimeRangeSelectorInline
            selected={timeRange}
            onSelect={setTimeRange}
            ranges={TIME_RANGES}
          />
        </div>
        <div className="text-center py-8 text-nasun-white/50">
          No rank improvements in this period yet.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with time range selector */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <h3 className="text-lg font-medium text-nasun-white flex items-center gap-2 uppercase">
          <span className="text-xl text-yellow-500">🏆</span> TOP CLIMBERS SPOTLIGHT
        </h3>
        <TimeRangeSelectorInline
          selected={timeRange}
          onSelect={setTimeRange}
          ranges={TIME_RANGES}
        />
      </div>

      {/* Climber cards grid (responsive: xl:5 lg:4 md:3 sm:2 mobile:3 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {data.climbers.slice(0, 5).map((climber, index) => (
          <div key={climber.accountId} className={getVisibilityClass(index)}>
            <ClimberCardV3 climber={climber} position={index + 1} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Inline time range selector (V2 pattern)
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
    <div className="inline-flex border border-nasun-c4/50 bg-black/60 p-1 rounded-lg">
      {ranges.map((range) => (
        <button
          key={range}
          onClick={() => onSelect(range)}
          className={`px-3 py-1 rounded-2xl text-sm font-light transition-all ${
            selected === range
              ? 'bg-nasun-c4/80 text-nasun-white'
              : 'text-nasun-white hover:bg-gray-700'
          }`}
        >
          {TIME_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}

export default TopClimbersV3;
