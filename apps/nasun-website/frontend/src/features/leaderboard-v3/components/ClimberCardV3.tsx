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

// Default avatar
function DefaultAvatar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-nasun-c5/30 flex items-center justify-center text-nasun-white/60 font-semibold text-lg">
      {initial}
    </div>
  );
}

const ClimberCardV3: React.FC<ClimberCardV3Props> = ({ climber, position }) => {
  const { emoji, label } = positionDisplay[position] || { emoji: '', label: `#${position}` };

  return (
    <div className="bg-nasun-c6/30 border border-nasun-c5/20 rounded-lg p-4 hover:border-nasun-c3/30 hover:scale-[1.02] hover:shadow-lg transition-all">
      {/* Position indicator */}
      <div className="flex justify-between items-start mb-3">
        <span className="text-2xl">{emoji || label}</span>
        {emoji && <span className="text-nasun-white/40 text-sm">{label}</span>}
      </div>

      {/* Avatar and name */}
      <div className="flex items-center gap-3 mb-3">
        {climber.profileImageUrl ? (
          <img
            src={climber.profileImageUrl}
            alt={climber.displayName || climber.username}
            className="w-12 h-12 rounded-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
        ) : (
          <DefaultAvatar username={climber.username} />
        )}
        <div className="hidden">
          <DefaultAvatar username={climber.username} />
        </div>

        <div className="min-w-0 flex-1">
          {climber.displayName && (
            <div className="text-nasun-white font-medium truncate">{climber.displayName}</div>
          )}
          <a
            href={`https://x.com/${climber.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`hover:text-nasun-c3 transition-colors truncate block ${
              climber.displayName ? 'text-nasun-white/50 text-sm' : 'text-nasun-white font-medium'
            }`}
          >
            @{climber.username}
          </a>
        </div>
      </div>

      {/* Rank change visualization */}
      <div className="space-y-2">
        {/* Rank transition */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-nasun-white/50">Rank</span>
          <div className="flex items-center gap-2">
            <span className="text-nasun-white/40">#{climber.previousRank}</span>
            <span className="text-nasun-white/30">→</span>
            <span className="text-nasun-white font-semibold">#{climber.currentRank}</span>
          </div>
        </div>

        {/* Rank improvement */}
        <div className="flex items-center justify-between">
          <span className="text-nasun-white/50 text-sm">Change</span>
          <RankChangeIndicatorV3 direction={climber.rankChange.direction} amount={climber.rankChange.amount} variant="full" />
        </div>

        {/* Current score */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-nasun-white/50">Score</span>
          <span className="text-nasun-c3 font-bold">{climber.currentScore.toFixed(1)}</span>
        </div>
      </div>

      {/* View profile link */}
      <div className="mt-3 pt-3 border-t border-nasun-c5/10">
        <a
          href={`https://x.com/${climber.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nasun-c3/70 hover:text-nasun-c3 text-xs flex items-center gap-1 transition-colors"
        >
          View Profile
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
};

export default ClimberCardV3;
