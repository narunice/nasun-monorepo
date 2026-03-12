/**
 * RankHistoryCard Component
 *
 * Displays user's leaderboard rank history chart in the Bento Grid layout.
 * Requires Twitter account to be connected for rank lookup.
 */

import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth';
import { getTwitterHandle } from '@/utils/getTwitterHandle';
import { useRankHistory, useActiveSeason, useSeasons } from '@/features/leaderboard-v3/hooks';
import { RankHistoryChartV3 } from '@/features/leaderboard-v3/components/RankHistoryChartV3';
import { OuterBox, Spinner } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import { DATE_RANGE_LABELS, type DateRangeOptionV3 } from '@/features/leaderboard-v3/types';

interface RankHistoryCardProps {
  className?: string;
}

export const RankHistoryCard: FC<RankHistoryCardProps> = ({ className = '' }) => {
  const { t } = useTranslation(['myAccount', 'common']);
  const { user, isAuthenticated } = useAuth();
  const activeSeason = useActiveSeason();
  const { data: seasons } = useSeasons();
  const [selectedDays, setSelectedDays] = useState<DateRangeOptionV3>(7);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined);

  // Initialize with active season
  useEffect(() => {
    if (activeSeason && !selectedSeasonId) {
      setSelectedSeasonId(activeSeason.seasonId);
    }
  }, [activeSeason, selectedSeasonId]);

  // Only show active + ended seasons (exclude upcoming/archived)
  const selectableSeasons = (seasons ?? []).filter(
    (s) => s.status === 'active' || s.status === 'ended'
  );
  const selectedSeason = selectableSeasons.find((s) => s.seasonId === selectedSeasonId);
  const isSeasonEnded = selectedSeason?.status === 'ended';

  const twitterUsername = getTwitterHandle(user);

  const { data, isLoading, isError } = useRankHistory({
    seasonId: selectedSeasonId,
    days: selectedDays,
    enabled: !!twitterUsername && !!selectedSeasonId,
  });

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">
          {t('rankHistory.title')}
        </h5>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <p className="text-nasun-white/50 text-center">
            {t('rankHistory.loginRequired')}
          </p>
        </div>
      </OuterBox>
    );
  }

  // No Twitter connected
  if (!twitterUsername) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">
          {t('rankHistory.title')}
        </h5>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <p className="text-nasun-white/50 text-center">
            {t('rankHistory.twitterRequired')}
          </p>
        </div>
      </OuterBox>
    );
  }

  // Season selector (shared across loading/noData/success paths)
  const seasonSelector = selectableSeasons.length > 1 && (
    <select
      value={selectedSeasonId || ''}
      onChange={(e) => setSelectedSeasonId(e.target.value)}
      className="bg-nasun-c6 text-nasun-white text-xs border border-nasun-c5/50 rounded px-2 py-1 focus:outline-none focus:border-nasun-c4 cursor-pointer"
    >
      {selectableSeasons.map((season) => (
        <option key={season.seasonId} value={season.seasonId}>
          {season.name}{season.status === 'active' ? ` (${t('rankHistory.seasonLive')})` : ''}
        </option>
      ))}
    </select>
  );

  // Loading
  if (isLoading) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <div className="flex items-center justify-between mb-4">
          <h5 className="font-medium uppercase text-nasun-white">
            {t('rankHistory.title')}
          </h5>
          {seasonSelector}
        </div>
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </OuterBox>
    );
  }

  // Error or no data
  if (isError || !data || data.history.length === 0) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <div className="flex items-center justify-between mb-4">
          <h5 className="font-medium uppercase text-nasun-white">
            {t('rankHistory.title')}
          </h5>
          {seasonSelector}
        </div>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <p className="text-nasun-white/50 text-center">
            {isSeasonEnded
              ? t('rankHistory.noDataEnded')
              : t('rankHistory.noData')}
          </p>
          {!isSeasonEnded && (
            <p className="text-nasun-white/30 text-xs text-center">
              {t('rankHistory.noDataDescription')}
            </p>
          )}
          <Link
            to="/wave1/leaderboard"
            className="text-nasun-c4 hover:text-nasun-white transition-colors text-sm"
          >
            {t('rankHistory.viewLeaderboard')}
          </Link>
        </div>
      </OuterBox>
    );
  }

  const { history, stats } = data;

  return (
    <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
      {/* Header with season selector and date range */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h5 className="font-medium uppercase text-nasun-white">
          {t('rankHistory.title')}
        </h5>
        <div className="flex items-center gap-2">
          {seasonSelector}
          <div className="flex gap-1">
            {(Object.entries(DATE_RANGE_LABELS) as [string, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSelectedDays(Number(val) as DateRangeOptionV3)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedDays === Number(val)
                    ? 'bg-nasun-c4 text-nasun-white'
                    : 'bg-nasun-c6 text-nasun-white/60 hover:text-nasun-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="mb-4">
        <RankHistoryChartV3 history={history} height={160} />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatCard
          label={isSeasonEnded ? t('rankHistory.stats.final') : t('rankHistory.stats.current')}
          value={`#${stats.currentRank}`}
          className="!p-2"
        />
        <StatCard
          label={t('rankHistory.stats.best')}
          value={`#${stats.bestRank}`}
          className="!p-2"
        />
        <StatCard
          label={t('rankHistory.stats.worst')}
          value={`#${stats.worstRank}`}
          className="!p-2"
        />
        <StatCard
          label={t('rankHistory.stats.change')}
          value={
            stats.rankImprovement > 0
              ? `+${stats.rankImprovement}`
              : stats.rankImprovement < 0
                ? `${stats.rankImprovement}`
                : '-'
          }
          className="!p-2"
          valueClassName={
            stats.rankImprovement > 0
              ? 'text-green-400'
              : stats.rankImprovement < 0
                ? 'text-red-400'
                : 'text-nasun-white'
          }
        />
      </div>

      {/* View Full Leaderboard Link */}
      <Link
        to="/wave1/leaderboard"
        className="flex items-center justify-center gap-2 pt-3 border-t border-nasun-c5/30 text-nasun-c4 hover:text-nasun-white transition-colors"
      >
        {t('rankHistory.viewLeaderboard')}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </OuterBox>
  );
};

export default RankHistoryCard;
