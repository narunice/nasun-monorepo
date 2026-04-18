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
    // Active first, then paused
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    if (a.status === 'paused' && b.status !== 'paused') return -1;
    if (b.status === 'paused' && a.status !== 'paused') return 1;
    if (a.isDefault && !b.isDefault) return -1;
    if (b.isDefault && !a.isDefault) return 1;
    // Then by start date desc
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === 'active') {
      return (
        <span className="ml-2 px-2 py-0.5 text-sm font-medium rounded-sm bg-nasun-nw1/20 text-nasun-nw1 border border-nasun-nw1/30">
          {t("v3.season.live")}
        </span>
      );
    }
    if (status === 'paused') {
      return (
        <span className="ml-2 px-2 py-0.5 text-sm font-medium rounded-sm bg-amber-500/15 text-amber-400 border border-amber-500/30">
          {t("v3.season.paused")}
        </span>
      );
    }
    if (status === 'upcoming') {
      return (
        <span className="ml-2 px-2 py-0.5 text-sm font-medium rounded-sm bg-nasun-nw2/15 text-nasun-nw4 border border-nasun-nw2/30">
          {t("v3.season.soon")}
        </span>
      );
    }
    if (status === 'ended' || status === 'archived') {
      return (
        <span className="ml-2 px-2 py-0.5 text-sm font-medium rounded-sm bg-white/10 text-nasun-nw4 border border-white/15">
          {t("v3.season.ended")}
        </span>
      );
    }
    return null;
  };

  const DateRange = () => {
    if (!selectedSeason) return null;
    const isOngoing = selectedSeason.status === 'active' || selectedSeason.status === 'upcoming';
    const isPaused = selectedSeason.status === 'paused';
    return (
      <span className="text-sm text-nasun-nw4">
        {selectedSeason.startDate}{isPaused ? ' - Paused' : isOngoing ? ' - Ongoing' : ` - ${selectedSeason.endDate}`}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="border-b border-nasun-nw3/30 animate-pulse pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-8 w-24 bg-nasun-nw3/20 rounded-sm"></div>
            <div className="h-8 w-24 bg-nasun-nw3/20 rounded-sm"></div>
          </div>
          <div className="h-5 w-40 bg-nasun-nw3/20 rounded-sm"></div>
        </div>
      </div>
    );
  }

  if (seasons.length === 0) {
    return null;
  }

  if (seasons.length <= 3) {
    return (
      <div className="border-b border-nasun-nw3/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            {sortedSeasons.map((season) => {
              const isSelected = season.seasonId === selectedSeasonId;
              return (
                <button
                  key={season.seasonId}
                  onClick={() => onSelect(season.seasonId)}
                  className={`relative px-3 py-2.5 font-medium outline-none flex items-center transition-colors ${
                    isSelected ? 'text-nasun-white' : 'text-nasun-nw4 hover:text-nasun-white'
                  }`}
                >
                  {season.name}
                  <StatusBadge status={season.status} />
                  {isSelected && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-nasun-nw1 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
          <DateRange />
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-nasun-nw3/30 pb-2">
      <div className="flex items-center justify-between">
        <select
          value={selectedSeasonId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="bg-nasun-nw3/10 text-nasun-white text-sm font-medium px-3 py-1.5 rounded-sm focus:outline-none cursor-pointer border border-nasun-nw3/40 hover:border-nasun-nw1/50 transition-colors"
        >
          {sortedSeasons.map((season) => {
            const statusLabel =
              season.status === 'active'
                ? ` (${t("v3.season.live")})`
                : season.status === 'paused'
                  ? ` (${t("v3.season.paused")})`
                  : season.status === 'upcoming'
                    ? ` (${t("v3.season.soon")})`
                    : season.status === 'ended' || season.status === 'archived'
                      ? ` (${t("v3.season.ended")})`
                      : '';
            return (
              <option key={season.seasonId} value={season.seasonId} className="bg-nasun-black">
                {season.name}
                {statusLabel}
              </option>
            );
          })}
        </select>
        <DateRange />
      </div>
    </div>
  );
}
