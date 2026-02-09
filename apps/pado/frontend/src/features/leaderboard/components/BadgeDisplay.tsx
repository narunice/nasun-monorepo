/**
 * BadgeDisplay Component
 * Renders achievement badges with tier-based styling.
 * compact=true: shows top 1-2 badges inline (for leaderboard rows)
 * compact=false: shows all badges (for profile pages)
 */

import type { EarnedBadge, BadgeTier } from '../lib/badges';

const TIER_STYLES: Record<BadgeTier, string> = {
  bronze: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  silver: 'text-gray-300 bg-gray-300/10 border-gray-300/20',
  gold: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
};

const TIER_ICONS: Record<BadgeTier, string> = {
  bronze: '\u25CF',  // filled circle
  silver: '\u25C6',  // diamond
  gold: '\u2605',    // star
};

interface BadgeDisplayProps {
  badges: EarnedBadge[];
  compact?: boolean;
}

export function BadgeDisplay({ badges, compact = false }: BadgeDisplayProps) {
  if (badges.length === 0) return null;

  const displayBadges = compact ? badges.slice(0, 2) : badges;

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {displayBadges.map(({ badge }) => (
          <span
            key={badge.id}
            title={`${badge.name}: ${badge.description}`}
            className={`inline-flex items-center text-[9px] px-1 py-px rounded border ${TIER_STYLES[badge.tier]}`}
          >
            <span className="mr-0.5 text-[8px]">{TIER_ICONS[badge.tier]}</span>
            {badge.name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayBadges.map(({ badge }) => (
        <span
          key={badge.id}
          title={badge.description}
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${TIER_STYLES[badge.tier]}`}
        >
          <span className="text-[10px]">{TIER_ICONS[badge.tier]}</span>
          {badge.name}
        </span>
      ))}
    </div>
  );
}
