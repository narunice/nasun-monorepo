/**
 * Leaderboard V3 Public Component
 *
 * Displays the community engagement leaderboard with:
 * - Season selector
 * - Top Climbers spotlight
 * - Rank change indicators
 * - Snapshot date picker for past rankings
 */

import { useState, useEffect } from 'react';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { OuterBox } from '@/components/ui/OuterBox';
import { useSeasons, useActiveSeason } from '../hooks/useSeasons';
import { useSeasonLeaderboard } from '../hooks/useSeasonLeaderboard';
import { SeasonSelector } from './SeasonSelector';
import TopClimbersV3 from './TopClimbersV3';
import LeaderboardV3Row from './LeaderboardV3Row';

interface LeaderboardV3Props {
  showBreakdown?: boolean;
}

export function LeaderboardV3({ showBreakdown = false }: LeaderboardV3Props) {
  const { data: seasons, isLoading: seasonsLoading } = useSeasons();
  const activeSeason = useActiveSeason();

  // Selected season (defaults to active season)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined);

  // Snapshot date for past rankings (optional)
  const [snapshotDate, setSnapshotDate] = useState<string | undefined>(undefined);

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
    breakdown: showBreakdown,
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
    <SectionLayout className="!max-w-5xl !pt-12 !pb-20">
      {/* Header */}
      <div className="w-full mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-nasun-white uppercase mb-4">
          Community Leaderboard
        </h1>
        <p className="text-nasun-white/60 text-lg font-light max-w-2xl mx-auto leading-relaxed">
          Top contributors in the Nasun community, ranked by engagement quality and consistency.
        </p>
      </div>

      {/* Season Selector */}
      {seasons && seasons.length > 0 && (
        <div className="mb-8">
          <SeasonSelector
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onSelect={handleSeasonChange}
            isLoading={seasonsLoading}
          />
        </div>
      )}

      {/* Season Info Banner */}
      {selectedSeason && (
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-nasun-c6/30 rounded-lg border border-nasun-c5/20">
            <span className="text-nasun-white/70 text-sm">
              {selectedSeason.startDate} - {selectedSeason.endDate}
            </span>
            {isSeasonEnded && (
              <span className="px-2 py-0.5 bg-nasun-c5/30 rounded text-xs text-nasun-white/60">
                Ended
              </span>
            )}
            {selectedSeason.status === 'active' && (
              <span className="px-2 py-0.5 bg-nasun-c3/20 rounded text-xs text-nasun-c3">
                Active
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top Climbers Spotlight */}
      {selectedSeasonId && (
        <div className="mb-8">
          <TopClimbersV3 seasonId={selectedSeasonId} />
        </div>
      )}

      {/* Snapshot Date Picker (for ended seasons) */}
      {isSeasonEnded && (
        <div className="mb-6 flex justify-center">
          <div className="flex items-center gap-3 px-4 py-2 bg-nasun-c6/30 rounded-lg border border-nasun-c5/20">
            <span className="text-nasun-white/50 text-sm">View Past Ranking:</span>
            <input
              type="date"
              value={snapshotDate || ''}
              onChange={(e) => setSnapshotDate(e.target.value || undefined)}
              min={selectedSeason?.startDate}
              max={selectedSeason?.endDate}
              className="bg-transparent border border-nasun-c5/30 rounded px-2 py-1 text-sm text-nasun-white focus:outline-none focus:border-nasun-c3/50"
            />
            {snapshotDate && (
              <button
                onClick={() => setSnapshotDate(undefined)}
                className="text-nasun-white/50 hover:text-nasun-white text-sm"
              >
                Clear
              </button>
            )}
          </div>
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
        <OuterBox color="c6" className="w-full border-nasun-c5/30 bg-gray-800/30 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-nasun-c5/20 text-xs uppercase tracking-widest text-nasun-white/50 font-medium">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-3">User</div>
            <div className="col-span-2 hidden md:block">Platform</div>
            <div className="col-span-2 text-center">Posts</div>
            <div className="col-span-1 text-center">Days</div>
            <div className="col-span-2 text-right">Score</div>
            <div className="col-span-1 text-center">Change</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-nasun-c5/10">
            {leaderboardData.entries.map((entry) => (
              <LeaderboardV3Row
                key={`${entry.platform}-${entry.username}`}
                entry={entry}
                showBreakdown={showBreakdown}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-nasun-c5/20 text-xs text-nasun-white/40 flex justify-between items-center">
            <span>Total: {leaderboardData.totalCount} contributors</span>
            <span>
              {snapshotDate ? `Snapshot: ${snapshotDate}` : 'Live'} |{' '}
              {new Date(leaderboardData.calculatedAt).toLocaleString('en-US')}
            </span>
          </div>
        </OuterBox>
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
