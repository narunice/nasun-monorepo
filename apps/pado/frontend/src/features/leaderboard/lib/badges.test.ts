/**
 * Achievement Badge Computation Tests
 * Tests computeBadges() and computeBadgesFromLeaderboard() with edge cases.
 */

import { describe, it, expect } from 'vitest';
import { computeBadges, computeBadgesFromLeaderboard, type EarnedBadge } from './badges';
import type { TraderStatsResponse, LeaderboardTrader, TraderPeriodStats } from '../types';

// ========================================
// Test Helpers
// ========================================

function makeStats(overrides: Partial<TraderPeriodStats> = {}): TraderPeriodStats {
  return {
    rank: 100,
    volume: '0',
    tradeCount: 0,
    uniquePools: 0,
    rankChange: 0,
    ...overrides,
  };
}

function makeStatsResponse(allStats: Partial<TraderPeriodStats> = {}, periodOverrides: Partial<Record<string, Partial<TraderPeriodStats>>> = {}): TraderStatsResponse {
  return {
    address: '0x' + 'a'.repeat(64),
    nickname: null,
    stats: {
      '24h': periodOverrides['24h'] ? makeStats(periodOverrides['24h']) : null,
      '7d': periodOverrides['7d'] ? makeStats(periodOverrides['7d']) : null,
      '30d': periodOverrides['30d'] ? makeStats(periodOverrides['30d']) : null,
      'all': makeStats(allStats),
    },
  };
}

function makeLeaderboardTrader(overrides: Partial<LeaderboardTrader> = {}): LeaderboardTrader {
  return {
    rank: 50,
    address: '0x' + 'b'.repeat(64),
    nickname: null,
    volumeUsd: '0',
    tradeCount: 0,
    uniquePools: 0,
    rankChange: 0,
    lastTradeAt: Date.now(),
    ...overrides,
  };
}

function hasBadge(badges: EarnedBadge[], id: string): boolean {
  return badges.some(b => b.badge.id === id);
}

// ========================================
// computeBadges — Volume Badges
// ========================================

describe('computeBadges — volume badges', () => {
  it('returns no volume badges for $0 volume', () => {
    const result = computeBadges(makeStatsResponse({ volume: '0' }));
    expect(hasBadge(result, 'vol-1k')).toBe(false);
    expect(hasBadge(result, 'vol-10k')).toBe(false);
    expect(hasBadge(result, 'vol-100k')).toBe(false);
  });

  it('returns Paper Trader for $1K volume', () => {
    const result = computeBadges(makeStatsResponse({ volume: '1000' }));
    expect(hasBadge(result, 'vol-1k')).toBe(true);
    expect(hasBadge(result, 'vol-10k')).toBe(false);
  });

  it('returns Paper Trader + Serious Trader for $10K volume', () => {
    const result = computeBadges(makeStatsResponse({ volume: '10000' }));
    expect(hasBadge(result, 'vol-1k')).toBe(true);
    expect(hasBadge(result, 'vol-10k')).toBe(true);
    expect(hasBadge(result, 'vol-100k')).toBe(false);
  });

  it('returns all volume badges for $100K+ volume', () => {
    const result = computeBadges(makeStatsResponse({ volume: '150000' }));
    expect(hasBadge(result, 'vol-1k')).toBe(true);
    expect(hasBadge(result, 'vol-10k')).toBe(true);
    expect(hasBadge(result, 'vol-100k')).toBe(true);
  });

  it('handles borderline $999.99 — just under 1K', () => {
    const result = computeBadges(makeStatsResponse({ volume: '999.99' }));
    expect(hasBadge(result, 'vol-1k')).toBe(false);
  });

  it('handles exact $1000 boundary', () => {
    const result = computeBadges(makeStatsResponse({ volume: '1000.00' }));
    expect(hasBadge(result, 'vol-1k')).toBe(true);
  });
});

// ========================================
// computeBadges — Trade Count Badges
// ========================================

describe('computeBadges — trade count badges', () => {
  it('returns no trade badges for 0 trades', () => {
    const result = computeBadges(makeStatsResponse({ tradeCount: 0 }));
    expect(hasBadge(result, 'trades-10')).toBe(false);
  });

  it('returns Getting Started for 10 trades', () => {
    const result = computeBadges(makeStatsResponse({ tradeCount: 10 }));
    expect(hasBadge(result, 'trades-10')).toBe(true);
    expect(hasBadge(result, 'trades-100')).toBe(false);
  });

  it('returns Active Trader for 100 trades', () => {
    const result = computeBadges(makeStatsResponse({ tradeCount: 100 }));
    expect(hasBadge(result, 'trades-10')).toBe(true);
    expect(hasBadge(result, 'trades-100')).toBe(true);
    expect(hasBadge(result, 'trades-500')).toBe(false);
  });

  it('returns Machine Gun for 500+ trades', () => {
    const result = computeBadges(makeStatsResponse({ tradeCount: 600 }));
    expect(hasBadge(result, 'trades-10')).toBe(true);
    expect(hasBadge(result, 'trades-100')).toBe(true);
    expect(hasBadge(result, 'trades-500')).toBe(true);
  });

  it('returns no badge for 9 trades', () => {
    const result = computeBadges(makeStatsResponse({ tradeCount: 9 }));
    expect(hasBadge(result, 'trades-10')).toBe(false);
  });
});

// ========================================
// computeBadges — Rank Badges
// ========================================

describe('computeBadges — rank badges', () => {
  it('returns no rank badges for rank 0 (unranked)', () => {
    const result = computeBadges(makeStatsResponse({ rank: 0 }));
    expect(hasBadge(result, 'top-50')).toBe(false);
  });

  it('returns Contender for rank 50', () => {
    const result = computeBadges(makeStatsResponse({}, {
      '24h': { rank: 50 },
    }));
    expect(hasBadge(result, 'top-50')).toBe(true);
    expect(hasBadge(result, 'top-10')).toBe(false);
  });

  it('returns Elite for rank 10', () => {
    const result = computeBadges(makeStatsResponse({}, {
      '7d': { rank: 10 },
    }));
    expect(hasBadge(result, 'top-50')).toBe(true);
    expect(hasBadge(result, 'top-10')).toBe(true);
    expect(hasBadge(result, 'top-3')).toBe(false);
  });

  it('returns Champion for rank 1', () => {
    const result = computeBadges(makeStatsResponse({}, {
      '30d': { rank: 1 },
    }));
    expect(hasBadge(result, 'top-50')).toBe(true);
    expect(hasBadge(result, 'top-10')).toBe(true);
    expect(hasBadge(result, 'top-3')).toBe(true);
  });

  it('uses best rank across all periods', () => {
    const result = computeBadges(makeStatsResponse(
      { rank: 100 }, // all-time rank is 100
      {
        '24h': { rank: 80 },
        '7d': { rank: 5 },  // best rank = 5
        '30d': { rank: 45 },
      }
    ));
    expect(hasBadge(result, 'top-50')).toBe(true);
    expect(hasBadge(result, 'top-10')).toBe(true);
    expect(hasBadge(result, 'top-3')).toBe(false);
  });

  it('returns no rank badges for rank 51', () => {
    const result = computeBadges(makeStatsResponse({}, {
      '24h': { rank: 51 },
    }));
    expect(hasBadge(result, 'top-50')).toBe(false);
  });
});

// ========================================
// computeBadges — Diversity Badges
// ========================================

describe('computeBadges — diversity badges', () => {
  it('returns no diversity badges for 0 pools', () => {
    const result = computeBadges(makeStatsResponse({ uniquePools: 0 }));
    expect(hasBadge(result, 'multi-market')).toBe(false);
    expect(hasBadge(result, 'all-markets')).toBe(false);
  });

  it('returns no diversity badges for 1 pool', () => {
    const result = computeBadges(makeStatsResponse({ uniquePools: 1 }));
    expect(hasBadge(result, 'multi-market')).toBe(false);
  });

  it('returns Diversified for 2 pools', () => {
    const result = computeBadges(makeStatsResponse({ uniquePools: 2 }));
    expect(hasBadge(result, 'multi-market')).toBe(true);
    expect(hasBadge(result, 'all-markets')).toBe(false);
  });

  it('returns Explorer for 4+ pools', () => {
    const result = computeBadges(makeStatsResponse({ uniquePools: 4 }));
    expect(hasBadge(result, 'multi-market')).toBe(true);
    expect(hasBadge(result, 'all-markets')).toBe(true);
  });
});

// ========================================
// computeBadges — Edge Cases
// ========================================

describe('computeBadges — edge cases', () => {
  it('returns empty array for undefined stats', () => {
    expect(computeBadges(undefined)).toEqual([]);
  });

  it('returns empty array when all period is null', () => {
    const stats: TraderStatsResponse = {
      address: '0x' + 'a'.repeat(64),
      nickname: null,
      stats: { '24h': null, '7d': null, '30d': null, 'all': null },
    };
    expect(computeBadges(stats)).toEqual([]);
  });

  it('handles non-numeric volume string gracefully', () => {
    const result = computeBadges(makeStatsResponse({ volume: 'invalid' }));
    // parseFloat('invalid') returns NaN, || 0 falls back to 0
    expect(hasBadge(result, 'vol-1k')).toBe(false);
  });

  it('returns combined badges for whale trader', () => {
    const result = computeBadges(makeStatsResponse(
      { volume: '200000', tradeCount: 600, uniquePools: 4, rank: 2 },
      { '24h': { rank: 2 }, '7d': { rank: 5 }, '30d': { rank: 1 } }
    ));
    // Should earn all 11 badges
    expect(result.length).toBe(11);
  });

  it('each badge has required fields', () => {
    const result = computeBadges(makeStatsResponse({ volume: '1000' }));
    expect(result.length).toBeGreaterThan(0);
    for (const { badge } of result) {
      expect(badge.id).toBeTruthy();
      expect(badge.name).toBeTruthy();
      expect(badge.description).toBeTruthy();
      expect(['bronze', 'silver', 'gold']).toContain(badge.tier);
      expect(['volume', 'trades', 'rank', 'diversity']).toContain(badge.category);
    }
  });
});

// ========================================
// computeBadgesFromLeaderboard
// ========================================

describe('computeBadgesFromLeaderboard', () => {
  it('only returns silver and gold badges (never bronze)', () => {
    const trader = makeLeaderboardTrader({
      volumeUsd: '200000',
      tradeCount: 600,
      uniquePools: 4,
      rank: 1,
    });
    const result = computeBadgesFromLeaderboard(trader);
    for (const { badge } of result) {
      expect(badge.tier).not.toBe('bronze');
    }
  });

  it('returns empty for trader with no achievements', () => {
    const trader = makeLeaderboardTrader({
      volumeUsd: '100',
      tradeCount: 1,
      uniquePools: 1,
      rank: 200,
    });
    const result = computeBadgesFromLeaderboard(trader);
    expect(result).toEqual([]);
  });

  it('returns Serious Trader (silver) for $10K volume', () => {
    const trader = makeLeaderboardTrader({ volumeUsd: '15000' });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'vol-10k')).toBe(true);
    expect(hasBadge(result, 'vol-1k')).toBe(false); // bronze filtered
  });

  it('returns Whale (gold) for $100K volume', () => {
    const trader = makeLeaderboardTrader({ volumeUsd: '100000' });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'vol-100k')).toBe(true);
  });

  it('returns Active Trader (silver) for 100 trades', () => {
    const trader = makeLeaderboardTrader({ tradeCount: 100 });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'trades-100')).toBe(true);
    expect(hasBadge(result, 'trades-10')).toBe(false); // bronze filtered
  });

  it('returns Machine Gun (gold) for 500 trades', () => {
    const trader = makeLeaderboardTrader({ tradeCount: 500 });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'trades-500')).toBe(true);
  });

  it('returns Elite (silver) for rank 5', () => {
    const trader = makeLeaderboardTrader({ rank: 5 });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'top-10')).toBe(true);
    expect(hasBadge(result, 'top-50')).toBe(false); // bronze filtered
  });

  it('returns Champion (gold) for rank 3', () => {
    const trader = makeLeaderboardTrader({ rank: 3 });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'top-3')).toBe(true);
  });

  it('returns Explorer (silver) for 4 pools', () => {
    const trader = makeLeaderboardTrader({ uniquePools: 4 });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'all-markets')).toBe(true);
    expect(hasBadge(result, 'multi-market')).toBe(false); // bronze filtered
  });

  it('handles invalid volumeUsd string', () => {
    const trader = makeLeaderboardTrader({ volumeUsd: 'invalid' });
    const result = computeBadgesFromLeaderboard(trader);
    expect(result).toEqual([]);
  });

  it('handles zero rank gracefully', () => {
    const trader = makeLeaderboardTrader({ rank: 0 });
    const result = computeBadgesFromLeaderboard(trader);
    expect(hasBadge(result, 'top-50')).toBe(false);
  });
});
