/**
 * LeaderboardV3Row Component
 *
 * Individual row in the leaderboard table with rank change indicator.
 */

import React from 'react';
import type { SeasonLeaderboardEntry } from '../types';
import { PLATFORM_LABELS } from '../types';
import { RankChangeIndicatorV3 } from './RankChangeIndicatorV3';

interface LeaderboardV3RowProps {
  entry: SeasonLeaderboardEntry;
  showBreakdown?: boolean;
  isHighlighted?: boolean;
}

// Default avatar for users without profile image
function DefaultAvatar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();
  return (
    <div className="w-10 h-10 rounded-2xl bg-gray-700 flex items-center justify-center text-nasun-white/60 font-semibold text-sm flex-shrink-0">
      {initial}
    </div>
  );
}

const LeaderboardV3Row: React.FC<LeaderboardV3RowProps> = ({
  entry,
  showBreakdown = false,
  isHighlighted = false,
}) => {
  const isTopThree = entry.rank <= 3;
  const rankColors: Record<number, string> = {
    1: 'text-yellow-400',
    2: 'text-gray-300',
    3: 'text-amber-600',
  };

  return (
    <div
      data-username={entry.username}
      className={`grid grid-cols-12 gap-4 px-4 py-4 items-center transition-all duration-200 hover:bg-black hover:scale-[1.01] hover:shadow-sm ${
        isTopThree ? 'bg-nasun-c4/5' : ''
      } ${isHighlighted ? 'bg-yellow-900/30 border-l-4 border-yellow-500 scale-[1.02] shadow-lg' : ''}`}
    >
      {/* Rank */}
      <div
        className={`col-span-1 text-center font-bold text-lg ${
          rankColors[entry.rank] || 'text-nasun-white/70'
        }`}
      >
        {entry.rank}
      </div>

      {/* User with Avatar */}
      <div className="col-span-3 md:col-span-3 flex items-center gap-3 min-w-0">
        {/* Profile Image */}
        {entry.profileImageUrl ? (
          <img
            src={entry.profileImageUrl}
            alt={entry.displayName || entry.username}
            className="w-10 h-10 rounded-2xl object-cover flex-shrink-0"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.classList.remove('hidden');
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
        <div className="min-w-0 flex-1">
          {entry.displayName && (
            <div className="text-nasun-white font-medium truncate flex items-center gap-1.5">
              {entry.displayName}
              {entry.isRegistered && (
                <span
                  className="inline-flex items-center justify-center w-4 h-4 bg-nasun-c3/20 rounded-full flex-shrink-0"
                  title="Registered Member"
                >
                  <svg
                    className="w-2.5 h-2.5 text-nasun-c3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
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

      {/* Platform - Hidden on mobile */}
      <div className="col-span-2 hidden md:block text-nasun-white/50 text-sm">
        {PLATFORM_LABELS[entry.platform] || entry.platform}
      </div>

      {/* Post Count */}
      <div className="col-span-2 text-center text-nasun-white/70">{entry.postCount}</div>

      {/* Active Days */}
      <div className="col-span-1 text-center text-nasun-white/70">{entry.uniqueActiveDays}</div>

      {/* Score */}
      <div className="col-span-2 text-right">
        <span className="text-nasun-c3 font-extrabold text-lg">{entry.userScore.toFixed(1)}</span>
        {showBreakdown && entry.breakdown && (
          <div className="text-xs text-nasun-white/40 mt-1">
            {entry.breakdown.rawScore.toFixed(1)} x {entry.breakdown.consistencyBonus.toFixed(2)} x{' '}
            {entry.breakdown.freshnessMultiplier.toFixed(2)}
          </div>
        )}
      </div>

      {/* Rank Change */}
      <div className="col-span-1 flex justify-center">
        {entry.rankChange ? (
          <RankChangeIndicatorV3
            direction={entry.rankChange.direction}
            amount={entry.rankChange.amount}
            variant="short"
          />
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </div>
    </div>
  );
};

export default LeaderboardV3Row;
