import { useMemo, useEffect, useState } from 'react';
import { BADGES, BADGE_CONDITIONS } from '../constants';
import type { BadgeDefinition, UnlockedBadge, BadgeEvalContext } from '../types';

const STORAGE_KEY = 'pado-badges-unlocked';

function loadUnlocked(): Map<string, UnlockedBadge> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map();
    const valid = parsed.filter(
      (b): b is UnlockedBadge =>
        typeof b === 'object' && b !== null &&
        typeof b.badgeId === 'string' && typeof b.unlockedAt === 'number'
    );
    return new Map(valid.map((b) => [b.badgeId, b]));
  } catch {
    return new Map();
  }
}

function saveUnlocked(unlocked: Map<string, UnlockedBadge>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked.values()]));
  } catch { /* ignore storage errors */ }
}

export interface BadgeState {
  badge: BadgeDefinition;
  unlocked: boolean;
  unlockedAt: number | null;
}

export interface UseBadgesResult {
  badges: BadgeState[];
  unlockedCount: number;
  totalCount: number;
  newlyUnlocked: BadgeDefinition[];
}

function evaluateBadges(
  ctx: BadgeEvalContext,
  prevUnlocked: Set<string>,
): { badges: BadgeState[]; changed: boolean; unlocked: Map<string, UnlockedBadge>; newBadges: BadgeDefinition[] } {
  const unlocked = loadUnlocked();
  const now = Date.now();
  let changed = false;
  const newBadges: BadgeDefinition[] = [];

  for (const badge of BADGES) {
    if (unlocked.has(badge.id)) continue;
    const evaluator = BADGE_CONDITIONS[badge.id];
    if (evaluator && evaluator(ctx)) {
      unlocked.set(badge.id, { badgeId: badge.id, unlockedAt: now });
      changed = true;
      if (!prevUnlocked.has(badge.id)) {
        newBadges.push(badge);
      }
    }
  }

  const badges = BADGES.map((badge) => {
    const entry = unlocked.get(badge.id);
    return { badge, unlocked: !!entry, unlockedAt: entry?.unlockedAt ?? null };
  });

  return { badges, changed, unlocked, newBadges };
}

export function useBadges(context: BadgeEvalContext): UseBadgesResult {
  // Capture previously unlocked badges once on mount
  const [prevUnlocked] = useState<Set<string>>(() => new Set(loadUnlocked().keys()));
  const [newlyUnlocked, setNewlyUnlocked] = useState<BadgeDefinition[]>([]);

  // Pure computation -- no side effects
  const { badges, changed, unlocked, newBadges } = useMemo(
    () => evaluateBadges(context, prevUnlocked),
    [context, prevUnlocked],
  );

  // Side effects in useEffect, not useMemo
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (changed) saveUnlocked(unlocked);
    if (newBadges.length > 0) setNewlyUnlocked(newBadges);
  }, [changed, unlocked, newBadges]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    badges,
    unlockedCount: badges.filter((b) => b.unlocked).length,
    totalCount: BADGES.length,
    newlyUnlocked,
  };
}
