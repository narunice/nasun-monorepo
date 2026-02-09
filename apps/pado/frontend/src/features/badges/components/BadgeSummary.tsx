import type { BadgeState } from '../hooks/useBadges';
import { TIER_COLORS } from '../types';

interface BadgeSummaryProps {
  badges: BadgeState[];
  maxDisplay?: number;
}

export function BadgeSummary({ badges, maxDisplay = 5 }: BadgeSummaryProps) {
  const unlocked = badges.filter((b) => b.unlocked);
  if (unlocked.length === 0) return null;

  // Sort by tier value (platinum > gold > silver > bronze)
  const tierOrder = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
  const sorted = [...unlocked].sort((a, b) => tierOrder[a.badge.tier] - tierOrder[b.badge.tier]);
  const display = sorted.slice(0, maxDisplay);
  const remaining = unlocked.length - display.length;

  return (
    <div className="flex items-center gap-1.5">
      {display.map((item) => {
        const colors = TIER_COLORS[item.badge.tier];
        return (
          <div
            key={item.badge.id}
            className={`w-6 h-6 rounded-md border flex items-center justify-center ${colors.bg} ${colors.border}`}
            title={item.badge.name}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`w-3.5 h-3.5 ${colors.text}`}
            >
              <path d={item.badge.icon} />
            </svg>
          </div>
        );
      })}
      {remaining > 0 && (
        <span className="text-[10px] text-theme-text-muted ml-0.5">+{remaining}</span>
      )}
    </div>
  );
}
