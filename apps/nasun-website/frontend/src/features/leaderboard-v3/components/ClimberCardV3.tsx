/**
 * ClimberCardV3 Component
 *
 * Individual card displaying a top climber with rank change visualization.
 * Based on V2 ClimberCard pattern.
 */

import React from 'react';
import type { TopClimberEntry } from '../types';
import { RankChangeIndicatorV3 } from './RankChangeIndicatorV3';

interface ClimberCardV3Props {
  climber: TopClimberEntry;
  position: number; // 1-5
}

// Medal/position indicator
const positionDisplay: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '🥇', label: '#1' },
  2: { emoji: '🥈', label: '#2' },
  3: { emoji: '🥉', label: '#3' },
  4: { emoji: '', label: '#4' },
  5: { emoji: '', label: '#5' },
};

// Default avatar (V2 style: rounded-2xl)
function DefaultAvatar({ username, originalUsername }: { username: string; originalUsername?: string }) {
  // Use originalUsername for initial if available (preserves intended casing)
  const displayName = originalUsername || username;
  const initial = displayName.charAt(0).toUpperCase();
  return (
    <div className="w-12 h-12 rounded-2xl bg-gray-700 flex items-center justify-center text-nasun-white/60 font-semibold text-lg">
      {initial}
    </div>
  );
}

const ClimberCardV3: React.FC<ClimberCardV3Props> = ({ climber, position }) => {
  const { emoji, label } = positionDisplay[position] || { emoji: '', label: `#${position}` };
  const rankImprovement = climber.rankChange.direction === 'up' ? climber.rankChange.amount : 0;

  return (
    <div className="relative bg-nasun-c4/10 border border-nasun-c4/50 rounded-xl p-4 hover:shadow-lg hover:scale-[1.01] transition-all duration-200">
      {/* Medal badge - V2 style absolute positioning */}
      {position <= 3 && (
        <div className="absolute -top-3 -left-3 z-10 text-2xl xl:text-3xl">
          {position === 1 ? '🥇' : position === 2 ? '🥈' : '🥉'}
        </div>
      )}

      {/* Header: Avatar + Name + External link */}
      <div className="flex items-start gap-3 mb-4 mt-2">
        {/* Position label for 4th, 5th */}
        {position > 3 && (
          <div className="flex flex-col items-center justify-center">
            <span className="text-nasun-white/40 text-sm font-medium">{label}</span>
          </div>
        )}

        {/* Avatar */}
        <div className="relative">
          {climber.profileImageUrl ? (
            <img
              src={climber.profileImageUrl}
              alt={climber.displayName || climber.originalUsername || climber.username}
              className="w-12 h-12 rounded-2xl object-cover"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) fallback.classList.remove('hidden');
              }}
            />
          ) : (
            <DefaultAvatar username={climber.username} originalUsername={climber.originalUsername} />
          )}
          <div className="hidden">
            <DefaultAvatar username={climber.username} originalUsername={climber.originalUsername} />
          </div>
        </div>

        {/* Name and handle */}
        <div className="min-w-0 flex-1">
          {climber.displayName && (
            <div className="text-nasun-white font-medium truncate text-sm">{climber.displayName}</div>
          )}
          <div className={`truncate ${climber.displayName ? 'text-nasun-white/50 text-xs' : 'text-nasun-white font-medium text-sm'}`}>
            @{climber.originalUsername || climber.username}
          </div>
        </div>

        {/* External link */}
        <a
          href={`https://x.com/${climber.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nasun-white/40 hover:text-nasun-c3 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Rank change section */}
      <div className="space-y-3">
        {/* Rank Change label + transition */}
        <div className="text-sm">
          <span className="text-nasun-white/50">Rank Change </span>
          <span className="text-nasun-white/40">#{climber.previousRank}</span>
          <span className="text-nasun-white/30 mx-1">→</span>
          <span className="text-nasun-white font-semibold">#{climber.currentRank}</span>
        </div>

        {/* Rank improvement button (V2 style) */}
        {climber.rankChange.direction === 'up' && (
          <div className="bg-nasun-c5/80 rounded-md py-1.5 px-3 flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-green-300 font-semibold text-sm">
              {rankImprovement} {rankImprovement === 1 ? 'rank' : 'ranks'}
            </span>
          </div>
        )}
        {climber.rankChange.direction === 'new' && (
          <div className="bg-nasun-c5/80 rounded-md py-1.5 px-3 flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-green-300 font-semibold text-sm">NEW</span>
          </div>
        )}
      </div>

      {/* Stats section (V2 style) */}
      <div className="border-t border-nasun-c4/50 pt-3 mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Point Increase</span>
          <span className="text-gray-200">{climber.scoreIncrease?.toFixed(2) || '0'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Percentage</span>
          <span className="text-gray-200">{climber.percentageIncrease?.toFixed(2) || '0.00'}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Current Points</span>
          <span className="text-gray-200">{climber.currentScore.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default ClimberCardV3;
