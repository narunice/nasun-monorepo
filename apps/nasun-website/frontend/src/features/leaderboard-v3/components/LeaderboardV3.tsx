/**
 * Leaderboard V3 Public Component
 *
 * Displays the community engagement leaderboard with period filtering.
 */

import { useState } from 'react';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { OuterBox } from '@/components/ui/OuterBox';
import { useLeaderboardV3 } from '../../admin/hooks/useLeaderboardV3';
import { PLATFORM_LABELS, type LeaderboardEntry } from '../../admin/types/leaderboard-v3';

type Period = 'weekly' | 'monthly' | 'alltime';

interface LeaderboardV3Props {
  showBreakdown?: boolean;
  initialPeriod?: Period;
}

export function LeaderboardV3({ showBreakdown = false, initialPeriod = 'alltime' }: LeaderboardV3Props) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const { data, isLoading, error } = useLeaderboardV3({
    period,
    limit: 100,
    breakdown: showBreakdown,
  });

  return (
    <SectionLayout className="!max-w-4xl !pt-12 !pb-20">
      {/* Header */}
      <div className="w-full mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-nasun-white uppercase mb-4">
          Community Leaderboard
        </h1>
        <p className="text-nasun-white/60 text-lg font-light max-w-2xl mx-auto leading-relaxed">
          Top contributors in the Nasun community, ranked by engagement quality and consistency.
        </p>
      </div>

      {/* Period Filter */}
      <div className="flex justify-center gap-2 mb-8 bg-nasun-c6/30 p-1 rounded-xl w-fit mx-auto border border-nasun-c5/20">
        {(['alltime', 'monthly', 'weekly'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-6 py-2 rounded-lg font-medium transition-all capitalize ${
              period === p
                ? 'bg-nasun-c4 text-nasun-white shadow-lg'
                : 'text-nasun-white/50 hover:text-nasun-white hover:bg-white/5'
            }`}
          >
            {p === 'alltime' ? 'All Time' : p}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nasun-c3"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-lg text-red-400 text-sm text-center">
          Failed to load leaderboard. Please try again later.
        </div>
      )}

      {/* Leaderboard Table */}
      {data && data.entries.length > 0 && (
        <OuterBox color="c6" className="w-full border-nasun-c5/30 bg-gray-800/30 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-nasun-c5/20 text-xs uppercase tracking-widest text-nasun-white/50 font-medium">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4 md:col-span-3">User</div>
            <div className="col-span-2 hidden md:block">Platform</div>
            <div className="col-span-2 text-center">Posts</div>
            <div className="col-span-2 text-center">Days</div>
            <div className="col-span-3 md:col-span-2 text-right">Score</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-nasun-c5/10">
            {data.entries.map((entry) => (
              <LeaderboardRow key={`${entry.platform}-${entry.username}`} entry={entry} showBreakdown={showBreakdown} />
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-nasun-c5/20 text-xs text-nasun-white/40 flex justify-between items-center">
            <span>Total: {data.totalCount} contributors</span>
            <span>Updated: {new Date(data.calculatedAt).toLocaleString('en-US')}</span>
          </div>
        </OuterBox>
      )}

      {/* Empty State */}
      {data && data.entries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-nasun-white/50 text-lg">No entries found for this period.</p>
        </div>
      )}
    </SectionLayout>
  );
}

/**
 * Default avatar component for users without profile image
 */
function DefaultAvatar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-nasun-c5/30 flex items-center justify-center text-nasun-white/60 font-semibold text-sm">
      {initial}
    </div>
  );
}

/**
 * Individual leaderboard row
 */
function LeaderboardRow({ entry, showBreakdown }: { entry: LeaderboardEntry; showBreakdown?: boolean }) {
  const isTopThree = entry.rank <= 3;
  const rankColors: Record<number, string> = {
    1: 'text-yellow-400',
    2: 'text-gray-300',
    3: 'text-amber-600',
  };

  return (
    <div
      className={`grid grid-cols-12 gap-4 px-4 py-4 items-center transition-colors hover:bg-white/5 ${
        isTopThree ? 'bg-nasun-c4/5' : ''
      }`}
    >
      {/* Rank */}
      <div className={`col-span-1 text-center font-bold text-lg ${rankColors[entry.rank] || 'text-nasun-white/70'}`}>
        {entry.rank}
      </div>

      {/* User with Avatar */}
      <div className="col-span-4 md:col-span-3 flex items-center gap-3">
        {/* Profile Image */}
        {entry.profileImageUrl ? (
          <img
            src={entry.profileImageUrl}
            alt={entry.displayName || entry.username}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            onError={(e) => {
              // Fallback to default avatar on image load error
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : (
          <DefaultAvatar username={entry.username} />
        )}
        {/* Hidden fallback avatar (shown on image error) */}
        <div className="hidden">
          <DefaultAvatar username={entry.username} />
        </div>

        {/* Name and Handle */}
        <div className="min-w-0">
          {entry.displayName && (
            <div className="text-nasun-white font-medium truncate flex items-center gap-1.5">
              {entry.displayName}
              {entry.isRegistered && (
                <span className="inline-flex items-center justify-center w-4 h-4 bg-nasun-c3/20 rounded-full" title="Registered Member">
                  <svg className="w-2.5 h-2.5 text-nasun-c3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </div>
          )}
          <a
            href={`https://x.com/${entry.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`hover:text-nasun-c3 transition-colors truncate block ${
              entry.displayName ? 'text-nasun-white/50 text-sm' : 'text-nasun-white font-medium'
            }`}
          >
            @{entry.username}
          </a>
        </div>
      </div>

      {/* Platform */}
      <div className="col-span-2 hidden md:block text-nasun-white/50 text-sm">
        {PLATFORM_LABELS[entry.platform] || entry.platform}
      </div>

      {/* Post Count */}
      <div className="col-span-2 text-center text-nasun-white/70">
        {entry.postCount}
      </div>

      {/* Active Days */}
      <div className="col-span-2 text-center text-nasun-white/70">
        {entry.uniqueActiveDays}
      </div>

      {/* Score */}
      <div className="col-span-3 md:col-span-2 text-right">
        <span className="text-nasun-c3 font-bold text-lg">
          {entry.userScore.toFixed(1)}
        </span>
        {showBreakdown && entry.breakdown && (
          <div className="text-xs text-nasun-white/40 mt-1">
            {entry.breakdown.rawScore.toFixed(1)} × {entry.breakdown.consistencyBonus.toFixed(2)} × {entry.breakdown.freshnessMultiplier.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}
