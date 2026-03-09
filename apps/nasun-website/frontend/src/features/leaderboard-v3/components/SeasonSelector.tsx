/**
 * SeasonSelector Component
 *
 * Dropdown/tabs for selecting active or past seasons.
 */

import { useTranslation } from "react-i18next";
import type { Season } from '../types';

interface SeasonSelectorProps {
  seasons: Season[];
  selectedSeasonId?: string;
  onSelect: (seasonId: string) => void;
  isLoading?: boolean;
  selectedSeason?: Season;
}

export function SeasonSelector({
  seasons,
  selectedSeasonId,
  onSelect,
  isLoading = false,
  selectedSeason,
}: SeasonSelectorProps) {
  const { t } = useTranslation("leaderboard");
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

  // Status badge component (V2 style - subtle)
  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'active') {
      return (
        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-nasun-c7/20 text-nasun-c7">
          {t("v3.season.live")}
        </span>
      );
    }
    if (status === 'upcoming') {
      return (
        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-nasun-c4/20 text-nasun-c4">
          {t("v3.season.soon")}
        </span>
      );
    }
    if (status === 'ended' || status === 'archived') {
      return (
        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-600/50 text-gray-400">
          {t("v3.season.ended")}
        </span>
      );
    }
    return null;
  };

  // Date range display — hide end date for active/upcoming seasons
  const DateRange = () => {
    if (!selectedSeason) return null;
    const isOngoing = selectedSeason.status === 'active' || selectedSeason.status === 'upcoming';
    return (
      <span className="text-sm text-nasun-white/50">
        {selectedSeason.startDate}{isOngoing ? ' - Ongoing' : ` - ${selectedSeason.endDate}`}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="border-b border-gray-700 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-24 bg-gray-700 rounded"></div>
            <div className="h-8 w-24 bg-gray-700 rounded"></div>
          </div>
          <div className="h-5 w-40 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (seasons.length === 0) {
    return null;
  }

  // Use tabs for 3 or fewer seasons, dropdown for more
  if (seasons.length <= 3) {
    return (
      <div className="border-b border-gray-700">
        <div className="flex items-center justify-between">
          {/* Tabs */}
          <div className="flex items-center space-x-4">
            {sortedSeasons.map((season) => {
              const isSelected = season.seasonId === selectedSeasonId;

              return (
                <button
                  key={season.seasonId}
                  onClick={() => onSelect(season.seasonId)}
                  className={`relative px-1 py-2 font-medium outline-none flex items-center transition-colors ${
                    isSelected ? 'text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {season.name}
                  <StatusBadge status={season.status} />
                  {isSelected && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-white rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
          {/* Date Range */}
          <DateRange />
        </div>
      </div>
    );
  }

  // Dropdown for many seasons
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex items-center justify-between">
        <select
          value={selectedSeasonId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="bg-transparent text-white text-sm font-medium px-2 py-1.5 rounded focus:outline-none cursor-pointer border border-gray-600 hover:border-gray-500"
        >
          {sortedSeasons.map((season) => {
            const statusLabel =
              season.status === 'active'
                ? ` (${t("v3.season.live")})`
                : season.status === 'upcoming'
                  ? ` (${t("v3.season.soon")})`
                  : season.status === 'ended' || season.status === 'archived'
                    ? ` (${t("v3.season.ended")})`
                    : '';
            return (
              <option key={season.seasonId} value={season.seasonId} className="bg-gray-800">
                {season.name}
                {statusLabel}
              </option>
            );
          })}
        </select>
        {/* Date Range */}
        <DateRange />
      </div>
    </div>
  );
}
