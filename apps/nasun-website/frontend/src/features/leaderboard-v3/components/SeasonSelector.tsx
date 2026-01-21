/**
 * SeasonSelector Component
 *
 * Dropdown/tabs for selecting active or past seasons.
 */

import type { Season } from '../types';

interface SeasonSelectorProps {
  seasons: Season[];
  selectedSeasonId?: string;
  onSelect: (seasonId: string) => void;
  isLoading?: boolean;
}

export function SeasonSelector({
  seasons,
  selectedSeasonId,
  onSelect,
  isLoading = false,
}: SeasonSelectorProps) {
  // Sort seasons: active first, then by startDate desc
  const sortedSeasons = [...seasons].sort((a, b) => {
    // Active/default first
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    if (a.isDefault && !b.isDefault) return -1;
    if (b.isDefault && !a.isDefault) return 1;
    // Then by start date desc
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  if (isLoading) {
    return (
      <div className="flex gap-2 animate-pulse">
        <div className="h-10 w-32 bg-nasun-c6/30 rounded-lg"></div>
        <div className="h-10 w-32 bg-nasun-c6/30 rounded-lg"></div>
      </div>
    );
  }

  if (seasons.length === 0) {
    return null;
  }

  // Use tabs for 3 or fewer seasons, dropdown for more
  if (seasons.length <= 3) {
    return (
      <div className="flex justify-center gap-2 bg-nasun-c6/30 p-1 rounded-xl w-fit mx-auto border border-nasun-c5/20">
        {sortedSeasons.map((season) => {
          const isSelected = season.seasonId === selectedSeasonId;
          const isEnded = season.status === 'ended' || season.status === 'archived';

          return (
            <button
              key={season.seasonId}
              onClick={() => onSelect(season.seasonId)}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                isSelected
                  ? 'bg-nasun-c4 text-nasun-white shadow-lg'
                  : 'text-nasun-white/50 hover:text-nasun-white hover:bg-white/5'
              }`}
            >
              {season.name}
              {isEnded && <span className="ml-1 text-xs opacity-60">(Ended)</span>}
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown for many seasons
  return (
    <div className="flex justify-center">
      <select
        value={selectedSeasonId || ''}
        onChange={(e) => onSelect(e.target.value)}
        className="bg-nasun-c6/30 border border-nasun-c5/20 rounded-lg px-4 py-2 text-nasun-white font-medium focus:outline-none focus:border-nasun-c3/50 cursor-pointer"
      >
        {sortedSeasons.map((season) => {
          const isEnded = season.status === 'ended' || season.status === 'archived';
          return (
            <option key={season.seasonId} value={season.seasonId}>
              {season.name}
              {isEnded ? ' (Ended)' : ''}
              {season.status === 'active' ? ' (Active)' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}
