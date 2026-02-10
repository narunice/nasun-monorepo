/**
 * Trade History Filter Logic Tests
 * Tests the side and period filter logic used in TradeHistory component.
 * The filter logic is extracted here to test independently of React rendering.
 */

import { describe, it, expect } from 'vitest';

// ========================================
// Filter Logic (extracted from TradeHistory.tsx useMemo)
// ========================================

type SideFilter = 'all' | 'buy' | 'sell';
type PeriodFilter = 'all' | '24h' | '7d';

const PERIOD_MS: Record<PeriodFilter, number> = {
  all: 0,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

interface TradeItem {
  id: string;
  isBid: boolean;
  timestamp: number;
  price: number;
  quantity: number;
}

function filterTrades(
  trades: TradeItem[],
  sideFilter: SideFilter,
  periodFilter: PeriodFilter,
  now: number = Date.now(),
): TradeItem[] {
  let result = trades;
  if (sideFilter !== 'all') {
    result = result.filter(t => sideFilter === 'buy' ? t.isBid : !t.isBid);
  }
  if (periodFilter !== 'all') {
    const cutoff = now - PERIOD_MS[periodFilter];
    result = result.filter(t => t.timestamp >= cutoff);
  }
  return result;
}

// ========================================
// Test Helpers
// ========================================

const NOW = 1707400000000; // Fixed timestamp

function makeTrade(overrides: Partial<TradeItem> = {}): TradeItem {
  return {
    id: Math.random().toString(36).slice(2),
    isBid: true,
    timestamp: NOW,
    price: 97500,
    quantity: 0.5,
    ...overrides,
  };
}

// ========================================
// Side Filter
// ========================================

describe('Trade History Filters — side filter', () => {
  const trades: TradeItem[] = [
    makeTrade({ id: 'buy1', isBid: true }),
    makeTrade({ id: 'buy2', isBid: true }),
    makeTrade({ id: 'sell1', isBid: false }),
    makeTrade({ id: 'sell2', isBid: false }),
    makeTrade({ id: 'sell3', isBid: false }),
  ];

  it('returns all trades when sideFilter is "all"', () => {
    const result = filterTrades(trades, 'all', 'all', NOW);
    expect(result.length).toBe(5);
  });

  it('returns only buys when sideFilter is "buy"', () => {
    const result = filterTrades(trades, 'buy', 'all', NOW);
    expect(result.length).toBe(2);
    expect(result.every(t => t.isBid)).toBe(true);
  });

  it('returns only sells when sideFilter is "sell"', () => {
    const result = filterTrades(trades, 'sell', 'all', NOW);
    expect(result.length).toBe(3);
    expect(result.every(t => !t.isBid)).toBe(true);
  });

  it('returns empty array if no buys match', () => {
    const sellOnly = [makeTrade({ isBid: false }), makeTrade({ isBid: false })];
    const result = filterTrades(sellOnly, 'buy', 'all', NOW);
    expect(result).toEqual([]);
  });

  it('returns empty array if no sells match', () => {
    const buyOnly = [makeTrade({ isBid: true }), makeTrade({ isBid: true })];
    const result = filterTrades(buyOnly, 'sell', 'all', NOW);
    expect(result).toEqual([]);
  });
});

// ========================================
// Period Filter
// ========================================

describe('Trade History Filters — period filter', () => {
  const MS_HOUR = 60 * 60 * 1000;
  const MS_DAY = 24 * MS_HOUR;

  it('returns all trades when periodFilter is "all"', () => {
    const trades = [
      makeTrade({ timestamp: NOW }),
      makeTrade({ timestamp: NOW - 30 * MS_DAY }),
      makeTrade({ timestamp: NOW - 365 * MS_DAY }),
    ];
    const result = filterTrades(trades, 'all', 'all', NOW);
    expect(result.length).toBe(3);
  });

  it('filters to 24h — only recent trades', () => {
    const trades = [
      makeTrade({ id: 'recent', timestamp: NOW - 1 * MS_HOUR }),       // 1h ago
      makeTrade({ id: 'border', timestamp: NOW - 23 * MS_HOUR }),     // 23h ago
      makeTrade({ id: 'old1', timestamp: NOW - 25 * MS_HOUR }),       // 25h ago
      makeTrade({ id: 'old2', timestamp: NOW - 7 * MS_DAY }),         // 7d ago
    ];
    const result = filterTrades(trades, 'all', '24h', NOW);
    expect(result.length).toBe(2);
    expect(result.map(t => t.id)).toEqual(['recent', 'border']);
  });

  it('filters to 7d — includes trades from past week', () => {
    const trades = [
      makeTrade({ id: 'today', timestamp: NOW }),
      makeTrade({ id: '3d', timestamp: NOW - 3 * MS_DAY }),
      makeTrade({ id: '6d', timestamp: NOW - 6 * MS_DAY }),
      makeTrade({ id: '8d', timestamp: NOW - 8 * MS_DAY }),        // outside 7d
      makeTrade({ id: '30d', timestamp: NOW - 30 * MS_DAY }),      // way outside
    ];
    const result = filterTrades(trades, 'all', '7d', NOW);
    expect(result.length).toBe(3);
    expect(result.map(t => t.id)).toEqual(['today', '3d', '6d']);
  });

  it('exact boundary — trade at exactly 24h ago is included', () => {
    const trades = [
      makeTrade({ id: 'exact', timestamp: NOW - 24 * MS_HOUR }),
    ];
    const result = filterTrades(trades, 'all', '24h', NOW);
    // cutoff = NOW - 24h, trade.timestamp >= cutoff means trades AT the cutoff are included
    expect(result.length).toBe(1);
  });

  it('exact boundary — trade 1ms before 7d cutoff is excluded', () => {
    const trades = [
      makeTrade({ id: 'just-outside', timestamp: NOW - 7 * MS_DAY - 1 }),
    ];
    const result = filterTrades(trades, 'all', '7d', NOW);
    expect(result.length).toBe(0);
  });

  it('returns empty when no trades match period', () => {
    const trades = [
      makeTrade({ timestamp: NOW - 30 * MS_DAY }),
    ];
    const result = filterTrades(trades, 'all', '24h', NOW);
    expect(result.length).toBe(0);
  });
});

// ========================================
// Combined Filters
// ========================================

describe('Trade History Filters — combined side + period', () => {
  const MS_HOUR = 60 * 60 * 1000;
  const MS_DAY = 24 * MS_HOUR;

  it('filters by both buy side + 24h period', () => {
    const trades = [
      makeTrade({ id: 'buy-recent', isBid: true, timestamp: NOW - 2 * MS_HOUR }),
      makeTrade({ id: 'sell-recent', isBid: false, timestamp: NOW - 2 * MS_HOUR }),
      makeTrade({ id: 'buy-old', isBid: true, timestamp: NOW - 3 * MS_DAY }),
      makeTrade({ id: 'sell-old', isBid: false, timestamp: NOW - 3 * MS_DAY }),
    ];
    const result = filterTrades(trades, 'buy', '24h', NOW);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('buy-recent');
  });

  it('filters by sell side + 7d period', () => {
    const trades = [
      makeTrade({ id: 'buy-1d', isBid: true, timestamp: NOW - 1 * MS_DAY }),
      makeTrade({ id: 'sell-1d', isBid: false, timestamp: NOW - 1 * MS_DAY }),
      makeTrade({ id: 'sell-6d', isBid: false, timestamp: NOW - 6 * MS_DAY }),
      makeTrade({ id: 'sell-30d', isBid: false, timestamp: NOW - 30 * MS_DAY }),
    ];
    const result = filterTrades(trades, 'sell', '7d', NOW);
    expect(result.length).toBe(2);
    expect(result.map(t => t.id)).toEqual(['sell-1d', 'sell-6d']);
  });

  it('returns empty for combined filter with no matches', () => {
    const trades = [
      makeTrade({ isBid: true, timestamp: NOW - 3 * MS_DAY }),
      makeTrade({ isBid: false, timestamp: NOW - 2 * MS_HOUR }),
    ];
    // Looking for sells within 24h, but the only sell is recent
    // Wait, that should match. Let me fix:
    // Looking for buys within 24h — but the only buy is 3 days old
    const result = filterTrades(trades, 'buy', '24h', NOW);
    expect(result.length).toBe(0);
  });
});

// ========================================
// Edge Cases
// ========================================

describe('Trade History Filters — edge cases', () => {
  it('handles empty trades array', () => {
    expect(filterTrades([], 'all', 'all', NOW)).toEqual([]);
    expect(filterTrades([], 'buy', '24h', NOW)).toEqual([]);
  });

  it('handles single trade', () => {
    const trades = [makeTrade({ isBid: true, timestamp: NOW })];
    expect(filterTrades(trades, 'all', 'all', NOW).length).toBe(1);
    expect(filterTrades(trades, 'buy', 'all', NOW).length).toBe(1);
    expect(filterTrades(trades, 'sell', 'all', NOW).length).toBe(0);
  });

  it('preserves order of trades', () => {
    const trades = [
      makeTrade({ id: 'first', isBid: true, timestamp: NOW }),
      makeTrade({ id: 'second', isBid: true, timestamp: NOW - 1000 }),
      makeTrade({ id: 'third', isBid: true, timestamp: NOW - 2000 }),
    ];
    const result = filterTrades(trades, 'buy', 'all', NOW);
    expect(result.map(t => t.id)).toEqual(['first', 'second', 'third']);
  });

  it('handles trades with timestamp = 0', () => {
    const trades = [
      makeTrade({ id: 'epoch', timestamp: 0 }),
      makeTrade({ id: 'now', timestamp: NOW }),
    ];
    const result = filterTrades(trades, 'all', '24h', NOW);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('now');
  });

  it('handles future timestamps', () => {
    const trades = [
      makeTrade({ id: 'future', timestamp: NOW + 60000 }),
    ];
    const result = filterTrades(trades, 'all', '24h', NOW);
    expect(result.length).toBe(1); // Future trades pass the cutoff
  });
});
