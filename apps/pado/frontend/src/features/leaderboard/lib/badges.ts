/**
 * Achievement Badge System
 * Computes badges from existing leaderboard/trader stats data.
 * No new API endpoints needed — all computed client-side.
 */

import type { TraderStatsResponse, LeaderboardTrader } from '../types';

export type BadgeTier = 'bronze' | 'silver' | 'gold';
export type BadgeCategory = 'volume' | 'trades' | 'rank' | 'diversity';

export interface Badge {
  id: string;
  name: string;
  description: string;
  tier: BadgeTier;
  category: BadgeCategory;
}

export interface EarnedBadge {
  badge: Badge;
}

interface ThresholdDef {
  badge: Badge;
  check: (volume: number, trades: number, bestRank: number, pools: number) => boolean;
}

const BADGE_DEFS: ThresholdDef[] = [
  // Volume milestones
  {
    badge: { id: 'vol-1k', name: 'Paper Trader', description: 'Traded $1K+ total volume', tier: 'bronze', category: 'volume' },
    check: (v) => v >= 1_000,
  },
  {
    badge: { id: 'vol-10k', name: 'Serious Trader', description: 'Traded $10K+ total volume', tier: 'silver', category: 'volume' },
    check: (v) => v >= 10_000,
  },
  {
    badge: { id: 'vol-100k', name: 'Whale', description: 'Traded $100K+ total volume', tier: 'gold', category: 'volume' },
    check: (v) => v >= 100_000,
  },
  // Trade count milestones
  {
    badge: { id: 'trades-10', name: 'Getting Started', description: 'Completed 10+ trades', tier: 'bronze', category: 'trades' },
    check: (_v, t) => t >= 10,
  },
  {
    badge: { id: 'trades-100', name: 'Active Trader', description: 'Completed 100+ trades', tier: 'silver', category: 'trades' },
    check: (_v, t) => t >= 100,
  },
  {
    badge: { id: 'trades-500', name: 'Machine Gun', description: 'Completed 500+ trades', tier: 'gold', category: 'trades' },
    check: (_v, t) => t >= 500,
  },
  // Rank achievements
  {
    badge: { id: 'top-50', name: 'Contender', description: 'Reached top 50 on leaderboard', tier: 'bronze', category: 'rank' },
    check: (_v, _t, r) => r > 0 && r <= 50,
  },
  {
    badge: { id: 'top-10', name: 'Elite', description: 'Reached top 10 on leaderboard', tier: 'silver', category: 'rank' },
    check: (_v, _t, r) => r > 0 && r <= 10,
  },
  {
    badge: { id: 'top-3', name: 'Champion', description: 'Reached top 3 on leaderboard', tier: 'gold', category: 'rank' },
    check: (_v, _t, r) => r > 0 && r <= 3,
  },
  // Diversity
  {
    badge: { id: 'multi-market', name: 'Diversified', description: 'Traded in 2+ markets', tier: 'bronze', category: 'diversity' },
    check: (_v, _t, _r, p) => p >= 2,
  },
  {
    badge: { id: 'all-markets', name: 'Explorer', description: 'Traded in all 4 markets', tier: 'silver', category: 'diversity' },
    check: (_v, _t, _r, p) => p >= 4,
  },
];

/**
 * Compute badges from full TraderStatsResponse (used on trader profile pages)
 */
export function computeBadges(stats: TraderStatsResponse | undefined): EarnedBadge[] {
  if (!stats) return [];

  const allStats = stats.stats['all'];
  if (!allStats) return [];

  const volume = parseFloat(allStats.volume) || 0;
  const trades = allStats.tradeCount || 0;
  const pools = allStats.uniquePools || 0;

  // Best rank across all periods
  const periods = ['24h', '7d', '30d', 'all'] as const;
  let bestRank = 0;
  for (const p of periods) {
    const ps = stats.stats[p];
    if (ps && ps.rank > 0) {
      bestRank = bestRank === 0 ? ps.rank : Math.min(bestRank, ps.rank);
    }
  }

  return BADGE_DEFS
    .filter(def => def.check(volume, trades, bestRank, pools))
    .map(def => ({ badge: def.badge }));
}

/**
 * Quick badge computation from LeaderboardTrader data (used inline in leaderboard rows).
 * Only returns silver and gold badges to keep rows compact.
 */
export function computeBadgesFromLeaderboard(trader: LeaderboardTrader): EarnedBadge[] {
  const volume = parseFloat(trader.volumeUsd) || 0;
  const trades = trader.tradeCount || 0;
  const pools = trader.uniquePools || 0;
  const rank = trader.rank || 0;

  return BADGE_DEFS
    .filter(def => def.badge.tier !== 'bronze' && def.check(volume, trades, rank, pools))
    .map(def => ({ badge: def.badge }));
}
