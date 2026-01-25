/**
 * RankHistoryCard Component
 *
 * Displays user's leaderboard rank history chart in the Bento Grid layout.
 * Requires Twitter account to be connected for rank lookup.
 */

import { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth';
import { useRankHistory, useActiveSeason } from '@/features/leaderboard-v3/hooks';
import { RankHistoryChartV3 } from '@/features/leaderboard-v3/components/RankHistoryChartV3';
import { OuterBox } from '@/components/ui';
import { StatCard } from '@/components/ui/StatCard';
import type { DateRangeOptionV3 } from '@/features/leaderboard-v3/types';

const DATE_RANGE_OPTIONS: { value: DateRangeOptionV3; label: string }[] = [
  { value: 7, label: '7D' },
  { value: 14, label: '2W' },
  { value: 30, label: '4W' },
  { value: 90, label: '3M' },
];

interface RankHistoryCardProps {
  className?: string;
}

export const RankHistoryCard: FC<RankHistoryCardProps> = ({ className = '' }) => {
  const { t } = useTranslation(['myAccount', 'common']);
  const { user, isAuthenticated } = useAuth();
  const activeSeason = useActiveSeason();
  const [selectedDays, setSelectedDays] = useState<DateRangeOptionV3>(7);

  // Get Twitter username
  const twitterUsername =
    user?.twitterHandle || user?.linkedAccounts?.twitter?.twitterHandle;

  const { data, isLoading, isError } = useRankHistory({
    seasonId: activeSeason?.seasonId,
    days: selectedDays,
    enabled: !!twitterUsername && !!activeSeason,
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

  // Loading
  if (isLoading) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">
          {t('rankHistory.title')}
        </h5>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-nasun-c3 border-t-transparent" />
        </div>
      </OuterBox>
    );
  }

  // Error or no data
  if (isError || !data || data.history.length === 0) {
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        <h5 className="font-medium uppercase text-nasun-white mb-4">
          {t('rankHistory.title')}
        </h5>
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <p className="text-nasun-white/50 text-center">
            {t('rankHistory.noData')}
          </p>
          <Link
            to="/wave1/leaderboard"
            className="text-nasun-c3 hover:text-nasun-c4 transition-colors text-sm"
          >
            {t('rankHistory.viewLeaderboard')}
          </Link>
        </div>
      </OuterBox>
    );
  }

  const { history, stats } = data;

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      {/* Header with date range selector */}
      <div className="flex items-center justify-between mb-4">
        <h5 className="font-medium uppercase text-nasun-white">
          {t('rankHistory.title')}
        </h5>
        <div className="flex gap-1">
          {DATE_RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedDays(option.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                selectedDays === option.value
                  ? 'bg-nasun-c3 text-nasun-c6'
                  : 'bg-nasun-c6 text-nasun-white/60 hover:text-nasun-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="mb-4">
        <RankHistoryChartV3 history={history} height={160} />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatCard
          label={t('rankHistory.stats.current')}
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
          className={`!p-2 ${
            stats.rankImprovement > 0
              ? 'text-green-400'
              : stats.rankImprovement < 0
                ? 'text-red-400'
                : ''
          }`}
        />
      </div>

      {/* View Full Leaderboard Link */}
      <Link
        to="/wave1/leaderboard"
        className="flex items-center justify-center gap-2 pt-3 border-t border-nasun-c5/30 text-nasun-c3 hover:text-nasun-c4 transition-colors"
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
