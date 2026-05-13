export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type BadgeCategory = 'trading' | 'ranking' | 'features' | 'social';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  tier: BadgeTier;
  category: BadgeCategory;
  icon: string; // SVG path data or emoji fallback
}

export interface UnlockedBadge {
  badgeId: string;
  unlockedAt: number;
}

export interface BadgeEvalContext {
  totalTrades: number;
  totalVolume: number;
  bestRank: number;
  uniquePools: number;
  usedTpsl: boolean;
  usedTrailingStop: boolean;
  chatMessageCount: number;
}

export const TIER_COLORS: Record<BadgeTier, { bg: string; border: string; text: string }> = {
  bronze: { bg: 'bg-amber-500/15 dark:bg-amber-900/20', border: 'border-amber-600/50 dark:border-amber-700/40', text: 'text-amber-600 dark:text-amber-500' },
  silver: { bg: 'bg-gray-300/40 dark:bg-gray-400/10', border: 'border-gray-400/60 dark:border-gray-400/30', text: 'text-gray-500 dark:text-gray-300' },
  gold: { bg: 'bg-yellow-400/20 dark:bg-yellow-500/15', border: 'border-yellow-500/60 dark:border-yellow-500/40', text: 'text-yellow-600 dark:text-yellow-400' },
  platinum: { bg: 'bg-cyan-400/20 dark:bg-cyan-400/15', border: 'border-cyan-500/60 dark:border-cyan-400/40', text: 'text-cyan-600 dark:text-cyan-300' },
};
