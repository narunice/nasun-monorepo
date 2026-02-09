import { useEffect, useRef } from 'react';
import type { BadgeDefinition } from '../types';
import { TIER_COLORS } from '../types';

interface BadgeNotificationProps {
  badges: BadgeDefinition[];
  onDismiss: () => void;
}

export function BadgeNotification({ badges, onDismiss }: BadgeNotificationProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (badges.length === 0) return;
    timerRef.current = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timerRef.current);
  }, [badges, onDismiss]);

  if (badges.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-xs">
      {badges.map((badge) => {
        const colors = TIER_COLORS[badge.tier];
        return (
          <div
            key={badge.id}
            className={`flex items-center gap-3 p-3 rounded-lg border shadow-lg animate-slide-up ${colors.bg} ${colors.border}`}
            role="alert"
          >
            <div className={`w-8 h-8 shrink-0 ${colors.text}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                <path d={badge.icon} />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-theme-text-muted">Badge Unlocked!</div>
              <div className={`text-sm font-medium ${colors.text}`}>{badge.name}</div>
              <div className="text-xs text-theme-text-muted truncate">{badge.description}</div>
            </div>
            <button
              onClick={onDismiss}
              className="shrink-0 text-theme-text-muted hover:text-theme-text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
