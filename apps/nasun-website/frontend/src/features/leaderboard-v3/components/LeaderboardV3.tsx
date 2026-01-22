/**
 * Leaderboard V3 Public Component
 *
 * Displays the community engagement leaderboard with:
 * - Season selector
 * - Top Climbers spotlight
 * - Rank change indicators
 * - Snapshot date picker for past rankings
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { useSeasons, useActiveSeason } from '../hooks/useSeasons';
import { useSeasonLeaderboard } from '../hooks/useSeasonLeaderboard';
import { SeasonSelector } from './SeasonSelector';
import TopClimbersV3 from './TopClimbersV3';
import LeaderboardV3Row from './LeaderboardV3Row';
import { SnapshotViewerV3 } from './SnapshotViewerV3';
import { UserSearchBoxV3 } from './UserSearchBoxV3';

export function LeaderboardV3() {
  const { data: seasons, isLoading: seasonsLoading } = useSeasons();
  const activeSeason = useActiveSeason();

  // Selected season (defaults to active season)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined);

  // Snapshot date for past rankings (optional)
  const [snapshotDate, setSnapshotDate] = useState<string | undefined>(undefined);

  // Highlighted user for search
  const [highlightedUsername, setHighlightedUsername] = useState<string | undefined>(undefined);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tableRef = useRef<HTMLDivElement>(null);

  // Handle user search selection
  const handleUserSelect = useCallback((username: string) => {
    // Clear any existing timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    setHighlightedUsername(username);

    // Scroll to the highlighted row after a short delay
    setTimeout(() => {
      const row = document.querySelector(`[data-username="${username}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    // Auto-clear highlight after 6 seconds
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedUsername(undefined);
    }, 6000);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Set default season when data loads
  useEffect(() => {
    if (activeSeason && !selectedSeasonId) {
      setSelectedSeasonId(activeSeason.seasonId);
    }
  }, [activeSeason, selectedSeasonId]);

  // Fetch leaderboard data
  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    error: leaderboardError,
  } = useSeasonLeaderboard({
    seasonId: selectedSeasonId,
    snapshotDate,
    limit: 100,
  });

  // Get selected season info
  const selectedSeason = seasons?.find((s) => s.seasonId === selectedSeasonId);
  const isSeasonEnded =
    selectedSeason?.status === 'ended' || selectedSeason?.status === 'archived';

  // Handle season change
  const handleSeasonChange = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    setSnapshotDate(undefined); // Reset snapshot date when changing seasons
  };

  return (
    <SectionLayout className="!max-w-7xl !pt-12 !pb-20">
      {/* Header - V2 style */}
      <h2 className="text-nasun-white uppercase mb-6 md:mb-8 text-center">
        Community Leaderboard
      </h2>

      {/* Season Selector */}
      {seasons && seasons.length > 0 && (
        <div className="mb-8">
          <SeasonSelector
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onSelect={handleSeasonChange}
            isLoading={seasonsLoading}
            selectedSeason={selectedSeason}
          />
        </div>
      )}

      {/* Top Climbers Spotlight */}
      {selectedSeasonId && (
        <div className="mb-8">
          <TopClimbersV3 seasonId={selectedSeasonId} />
        </div>
      )}

      {/* Snapshot Viewer and Search */}
      {selectedSeason && (
        <div className="mb-3 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
          <SnapshotViewerV3
            selectedDate={snapshotDate}
            onDateChange={setSnapshotDate}
            minDate={selectedSeason.startDate}
            maxDate={selectedSeason.endDate}
            lastUpdated={leaderboardData?.calculatedAt}
            isEnded={isSeasonEnded}
          />
          <UserSearchBoxV3
            seasonId={selectedSeasonId}
            onUserSelect={handleUserSelect}
            placeholder="Search user..."
          />
        </div>
      )}

      {/* Loading State */}
      {leaderboardLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nasun-c3"></div>
        </div>
      )}

      {/* Error State */}
      {leaderboardError && (
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-lg text-red-400 text-sm text-center">
          Failed to load leaderboard. Please try again later.
        </div>
      )}

      {/* No Active Season */}
      {!seasonsLoading && (!seasons || seasons.length === 0) && (
        <div className="text-center py-12">
          <p className="text-nasun-white/50 text-lg">No active season at the moment.</p>
        </div>
      )}

      {/* Leaderboard Table */}
      {leaderboardData && leaderboardData.entries.length > 0 && (
        <div className="w-full border border-nasun-c3/50 bg-gray-900/80 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 py-3 border-b border-nasun-c3/30 text-xs uppercase tracking-wider text-gray-200 font-medium bg-nasun-c3/20">
            <div className="col-span-2 text-center">RANK</div>
            <div className="col-span-6">USER</div>
            <div className="col-span-2 text-right">SCORE</div>
            <div className="col-span-2 text-center">CHANGE</div>
          </div>

          {/* Table Body */}
          <div ref={tableRef} className="divide-y divide-nasun-c3/10">
            {leaderboardData.entries.map((entry) => (
              <LeaderboardV3Row
                key={`${entry.platform}-${entry.username}`}
                entry={entry}
                isHighlighted={highlightedUsername === entry.username}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="py-3 border-t border-nasun-c3/20 text-xs text-nasun-white/40 flex justify-between items-center">
            <span>Total: {leaderboardData.totalCount} contributors</span>
            <span>
              {snapshotDate ? `Snapshot: ${snapshotDate}` : 'Live'} |{' '}
              {new Date(leaderboardData.calculatedAt).toLocaleString('en-US')}
            </span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {leaderboardData && leaderboardData.entries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-nasun-white/50 text-lg">No entries found for this season.</p>
        </div>
      )}
    </SectionLayout>
  );
}
