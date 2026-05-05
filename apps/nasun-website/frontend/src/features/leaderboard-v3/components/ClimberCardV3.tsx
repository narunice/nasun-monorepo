/**
 * ClimberCardV3 Component
 *
 * Individual card displaying a top climber with rank change visualization.
 * Based on V2 ClimberCard pattern.
 */

import React from 'react';
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import type { TopClimberEntry } from '../types';

interface ClimberCardV3Props {
  climber: TopClimberEntry;
}

function DefaultAvatar({ username, originalUsername }: { username: string; originalUsername?: string }) {
  const displayName = originalUsername || username;
  const initial = (displayName || "?").charAt(0).toUpperCase();
  return (
    <div className="w-11 h-11 rounded-sm bg-nasun-nw3/30 border border-nasun-nw3/40 flex items-center justify-center text-nasun-nw4 font-semibold">
      {initial}
    </div>
  );
}

const ClimberCardV3: React.FC<ClimberCardV3Props> = ({ climber }) => {
  const { t } = useTranslation("leaderboard");
  const rankImprovement = climber.rankChange.direction === 'up' ? climber.rankChange.amount : 0;

  return (
    <div className="relative h-full flex flex-col bg-nasun-nw3/10 border border-nasun-nw3/25 rounded-sm p-4 hover:border-nasun-nw1/40 hover:bg-nasun-nw3/15 transition-all duration-200">
      {/* Header: Avatar + Name + External link */}
      <div className="flex items-start gap-3 mb-4">
        <div className="relative flex-shrink-0">
          {climber.profileImageUrl ? (
            <img
              src={climber.profileImageUrl}
              alt={climber.displayName || climber.originalUsername || climber.username}
              className="w-11 h-11 rounded-sm object-cover"
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

        <div className="min-w-0 flex-1">
          {climber.displayName && (
            <p className="text-nasun-white font-medium truncate text-sm leading-tight">{climber.displayName}</p>
          )}
          <p className={`truncate text-sm ${climber.displayName ? 'text-nasun-nw4' : 'text-nasun-white font-medium'}`}>
            @{climber.originalUsername || climber.username}
          </p>
        </div>

        <a
          href={`https://x.com/${climber.username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nasun-nw4/80 hover:text-nasun-nw1 transition-colors flex-shrink-0 mt-0.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Rank change section */}
      <div className="flex-1 space-y-2.5">
        <div className="text-sm">
          <span className="text-nasun-nw4">{t("v3.climbers.rankChange")} </span>
          <span className="text-nasun-nw4">{climber.previousRank === null ? 'Chart Out' : `#${climber.previousRank}`}</span>
          <span className="text-nasun-nw4 mx-1">→</span>
          <span className="text-nasun-white font-semibold">#{climber.currentRank}</span>
        </div>

        {climber.rankChange.direction === 'up' && (
          <div className="bg-nasun-nw2/20 border border-nasun-nw1/25 rounded-sm py-1.5 px-3 flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-nasun-nw1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-nasun-nw1 font-semibold text-sm">
              {rankImprovement} {rankImprovement === 1 ? t("v3.climbers.rank") : t("v3.climbers.ranks")}
            </span>
          </div>
        )}
        {climber.rankChange.direction === 'new' && (
          <div className="bg-nasun-nw2/20 border border-nasun-nw1/25 rounded-sm py-1.5 px-3 flex items-center justify-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-nasun-nw1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            <span className="text-nasun-nw1 font-semibold text-sm">{t("v3.climbers.new")}</span>
          </div>
        )}
      </div>

      {/* Stats section */}
      <div className="border-t border-nasun-nw3/25 pt-3 mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-nasun-nw4">{t("v3.climbers.pointIncrease")}</span>
          <span className="text-nasun-white">{climber.scoreIncrease?.toFixed(3) || '0'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-nasun-nw4">{t("v3.climbers.percentage")}</span>
          <span className="text-nasun-white">{climber.percentageIncrease?.toFixed(3) || '0.000'}%</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-nasun-nw4">{t("v3.climbers.currentPoints")}</span>
          <span className="text-nasun-nw1 font-semibold">{climber.currentScore.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
};

export default ClimberCardV3;
