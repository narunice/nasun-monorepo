/**
 * UjuRankHistoryCard Component
 *
 * Displays user's leaderboard rank history chart for UJU Activity.
 * Detached from myAccount dependencies.
 */

import { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth';
import { getTwitterHandle } from '@/utils/getTwitterHandle';
import { useRankHistory, useActiveSeason, useSeasons } from '@/features/leaderboard-v3/hooks';
import { RankHistoryChartV3 } from '@/features/leaderboard-v3/components/RankHistoryChartV3';
import { Spinner } from '@/components/ui';
import { DATE_RANGE_LABELS, type DateRangeOptionV3 } from '@/features/leaderboard-v3/types';
import { UjuCard, UjuSectionHeader, UjuStat, UjuButton } from "../../shared";

interface UjuRankHistoryCardProps {
  className?: string;
}

export const UjuRankHistoryCard: FC<UjuRankHistoryCardProps> = ({ className = '' }) => {
  const { t } = useTranslation(['myAccount', 'common']);
  const { user, isAuthenticated } = useAuth();
  const activeSeason = useActiveSeason();
  const { data: seasons } = useSeasons();
  const [selectedDays, setSelectedDays] = useState<DateRangeOptionV3>(7);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined);
  const [isExpanded, setIsExpanded] = useState(true);

  // Initialize with active season
  useEffect(() => {
    if (activeSeason && !selectedSeasonId) {
      setSelectedSeasonId(activeSeason.seasonId);
    }
  }, [activeSeason, selectedSeasonId]);

  // Only show active + ended seasons (exclude upcoming/archived)
  const selectableSeasons = (seasons ?? []).filter(
    (s) => s.status === 'active' || s.status === 'paused' || s.status === 'ended'
  );
  const selectedSeason = selectableSeasons.find((s) => s.seasonId === selectedSeasonId);
  const isSeasonEnded = selectedSeason?.status === 'ended';

  const twitterUsername = getTwitterHandle(user);

  const { data, isLoading, isError } = useRankHistory({
    seasonId: selectedSeasonId,
    days: selectedDays,
    enabled: !!twitterUsername && !!selectedSeasonId,
  });

  const headerTrailing = (
    <button
      onClick={() => setIsExpanded((prev) => !prev)}
      className="text-uju-secondary hover:text-uju-primary transition-colors text-xs font-bold uppercase tracking-widest flex items-center gap-2"
    >
      {isExpanded ? 'Collapse' : 'Expand History'}
      <svg
        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="Rank History"
        subtitle="Leaderboard standing over time"
        trailing={headerTrailing}
      />

      {!isExpanded ? null : (
        <div className="space-y-6 mt-4 animate-fade-in">
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4 bg-uju-bg/30 rounded-xl border border-uju-border/10">
              <p className="text-uju-secondary font-medium text-center px-6">
                {t('rankHistory.loginRequired')}
              </p>
            </div>
          ) : !twitterUsername ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4 bg-uju-bg/30 rounded-xl border border-uju-border/10">
              <p className="text-uju-secondary font-medium text-center px-6">
                {t('rankHistory.twitterRequired')}
              </p>
              <UjuButton variant="primary" size="sm" as="a" href="/my-account?tab=profile">
                Connect X Account
              </UjuButton>
            </div>
          ) : (
            <>
              {/* Selectors */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-uju-secondary uppercase tracking-widest">Season</span>
                  <select
                    value={selectedSeasonId || ''}
                    onChange={(e) => setSelectedSeasonId(e.target.value)}
                    className="bg-uju-bg border border-uju-border/30 rounded-xl px-3 py-1.5 text-sm font-bold text-uju-primary focus:outline-none focus:border-pado-2 cursor-pointer transition-all"
                  >
                    {selectableSeasons.map((season) => (
                      <option key={season.seasonId} value={season.seasonId}>
                        {season.name}{season.status === 'active' ? ` (LIVE)` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-uju-bg/50 rounded-xl border border-uju-border/20">
                  {(Object.entries(DATE_RANGE_LABELS) as [string, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setSelectedDays(Number(val) as DateRangeOptionV3)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all duration-200 ${
                        selectedDays === Number(val)
                          ? 'bg-pado-2 text-uju-bg shadow-sm'
                          : 'text-uju-secondary hover:text-uju-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart Path */}
              {isLoading ? (
                <div className="flex items-center justify-center py-20 bg-uju-bg/20 rounded-2xl">
                  <Spinner />
                </div>
              ) : isError || !data || data.history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 bg-uju-bg/30 rounded-2xl border border-uju-border/10">
                  <p className="text-uju-secondary font-medium text-center px-6">
                    {isSeasonEnded
                      ? t('rankHistory.noDataEnded')
                      : t('rankHistory.noData')}
                  </p>
                  <Link
                    to="/community/creators-leaderboard"
                    className="text-pado-2 hover:text-pado-4 font-bold text-sm transition-colors"
                  >
                    View Leaderboard
                  </Link>
                </div>
              ) : (
                <>
                  {/* Chart */}
                  <div className="p-4 bg-uju-bg/40 rounded-2xl border border-uju-border/10 shadow-inner">
                    <RankHistoryChartV3 
                      history={data.history} 
                      height={180} 
                      // Note: RankHistoryChartV3 might need internal color adjustments to match UJU, 
                      // but per instructions we keep the feature component as is.
                    />
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-uju-bg/30 border border-uju-border/20 rounded-xl">
                      <p className="text-[10px] font-bold text-uju-secondary uppercase tracking-widest mb-1">
                        {isSeasonEnded ? "Final Rank" : "Current Rank"}
                      </p>
                      <p className="text-2xl font-black text-uju-primary tabular-nums">#{data.stats.currentRank}</p>
                    </div>
                    <div className="p-4 bg-uju-bg/30 border border-uju-border/20 rounded-xl">
                      <p className="text-[10px] font-bold text-uju-secondary uppercase tracking-widest mb-1">Best Rank</p>
                      <p className="text-2xl font-black text-pado-4 tabular-nums">#{data.stats.bestRank}</p>
                    </div>
                    <div className="p-4 bg-uju-bg/30 border border-uju-border/20 rounded-xl">
                      <p className="text-[10px] font-bold text-uju-secondary uppercase tracking-widest mb-1">Worst Rank</p>
                      <p className="text-2xl font-black text-red-400/80 tabular-nums">#{data.stats.worstRank}</p>
                    </div>
                    <div className="p-4 bg-uju-bg/30 border border-uju-border/20 rounded-xl">
                      <p className="text-[10px] font-bold text-uju-secondary uppercase tracking-widest mb-1">7D Change</p>
                      <p className={`text-2xl font-black tabular-nums ${
                        data.stats.rankImprovement > 0
                          ? 'text-pado-4'
                          : data.stats.rankImprovement < 0
                            ? 'text-red-400'
                            : 'text-uju-primary'
                      }`}>
                        {data.stats.rankImprovement > 0
                          ? `+${data.stats.rankImprovement}`
                          : data.stats.rankImprovement < 0
                            ? `${data.stats.rankImprovement}`
                            : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Footer CTA */}
                  <Link
                    to="/community/creators-leaderboard"
                    className="flex items-center justify-center gap-2 py-3 border-t border-uju-border/10 text-pado-2 hover:text-pado-4 font-bold transition-all text-sm group"
                  >
                    View Full Leaderboard
                    <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      )}
    </UjuCard>
  );
};

export default UjuRankHistoryCard;
