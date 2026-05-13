import type { BadgeState } from '../hooks/useBadges';
import type { BadgeCategory } from '../types';
import { TIER_COLORS } from '../types';

interface BadgeGridProps {
  badges: BadgeState[];
}

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  trading: 'Trading',
  ranking: 'Ranking',
  features: 'Features',
  social: 'Social',
};

const CATEGORY_ORDER: BadgeCategory[] = ['trading', 'ranking', 'features', 'social'];

export function BadgeGrid({ badges }: BadgeGridProps) {
  const grouped = new Map<BadgeCategory, BadgeState[]>();
  for (const cat of CATEGORY_ORDER) {
    grouped.set(cat, []);
  }
  for (const b of badges) {
    const list = grouped.get(b.badge.category);
    if (list) list.push(b);
  }

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((cat) => {
        const items = grouped.get(cat) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <h4 className="text-xs font-medium text-theme-text-muted uppercase tracking-wider mb-3">
              {CATEGORY_LABELS[cat]}
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {items.map((item) => (
                <BadgeCard key={item.badge.id} state={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BadgeCard({ state }: { state: BadgeState }) {
  const { badge, unlocked } = state;
  const colors = TIER_COLORS[badge.tier];

  return (
    <div className="group relative">
      <div
        className={`relative flex flex-col items-center p-3 rounded-lg border transition-all ${
          unlocked
            ? `${colors.bg} ${colors.border}`
            : 'bg-theme-bg-tertiary/30 border-theme-border/30 opacity-40'
        }`}
      >
        <div className={`w-8 h-8 mb-2 ${unlocked ? colors.text : 'text-theme-text-muted/50'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d={badge.icon} />
          </svg>
        </div>
        <span className={`text-sm font-medium text-center leading-tight ${unlocked ? 'text-theme-text-primary' : 'text-theme-text-muted/50'}`}>
          {badge.name}
        </span>
        {!unlocked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-4 h-4 text-theme-text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        )}
      </div>

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                      opacity-0 group-hover:opacity-100 transition-opacity duration-150
                      w-44 rounded-lg px-3 py-2
                      bg-theme-bg-primary border border-theme-border shadow-lg">
        <p className="text-sm font-medium text-theme-text-primary text-center">{badge.name}</p>
        <p className="text-sm text-theme-text-muted text-center mt-0.5">
          {unlocked ? badge.description : `Locked: ${badge.description}`}
        </p>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px
                        border-4 border-transparent border-t-theme-border" />
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[5px]
                        border-4 border-transparent border-t-theme-bg-primary" />
      </div>
    </div>
  );
}
