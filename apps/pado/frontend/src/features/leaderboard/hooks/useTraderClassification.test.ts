/**
 * useTraderClassification Hook Tests
 * Tests trading style classification based on median trade interval.
 *
 * Thresholds:
 * - < 5 min median interval -> scalper
 * - < 1 hour -> day-trader
 * - < 3 days -> swing-trader
 * - >= 3 days or insufficient data -> holder
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTraderClassification } from './useTraderClassification';
import type { TraderFill, TraderStatsResponse, TraderPeriodStats } from '../types';

// ========================================
// Test Helpers
// ========================================

function makeFill(timestamp: number, overrides: Partial<TraderFill> = {}): TraderFill {
  return {
    txDigest: '0x' + Math.random().toString(16).slice(2, 18),
    poolId: '0xpool1',
    side: 'buy',
    price: '42000',
    baseQuantity: '1',
    quoteQuantity: '42000',
    timestamp,
    ...overrides,
  };
}

function makeStats(allOverrides: Partial<TraderPeriodStats> = {}): TraderStatsResponse {
  return {
    address: '0x' + 'a'.repeat(64),
    nickname: null,
    stats: {
      '24h': null,
      '7d': null,
      '30d': null,
      'all': {
        rank: 10,
        volume: '100000',
        tradeCount: 100,
        uniquePools: 2,
        rankChange: 0,
        ...allOverrides,
      },
    },
  };
}

function fillsAtIntervals(baseTime: number, intervalMs: number, count: number): TraderFill[] {
  return Array.from({ length: count }, (_, i) =>
    makeFill(baseTime + i * intervalMs),
  );
}

// ========================================
// Classification Logic
// ========================================

describe('useTraderClassification', () => {
  const baseTime = Date.now();

  describe('scalper (median interval < 5 min)', () => {
    it('classifies as scalper for 1-minute intervals', () => {
      const fills = fillsAtIntervals(baseTime, 60_000, 10); // 1 min apart
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('scalper');
      expect(result.current.label).toBe('Scalper');
    });

    it('classifies as scalper for 2-minute intervals', () => {
      const fills = fillsAtIntervals(baseTime, 2 * 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('scalper');
    });

    it('classifies as scalper for 4min 59sec intervals (just under 5min)', () => {
      const fills = fillsAtIntervals(baseTime, 4 * 60_000 + 59_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('scalper');
    });
  });

  describe('day-trader (5 min <= median < 1 hour)', () => {
    it('classifies as day-trader at exactly 5-minute intervals', () => {
      const fills = fillsAtIntervals(baseTime, 5 * 60_000, 10);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('day-trader');
      expect(result.current.label).toBe('Day Trader');
    });

    it('classifies as day-trader for 30-minute intervals', () => {
      const fills = fillsAtIntervals(baseTime, 30 * 60_000, 10);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('day-trader');
    });

    it('classifies as day-trader for 59-minute intervals', () => {
      const fills = fillsAtIntervals(baseTime, 59 * 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('day-trader');
    });
  });

  describe('swing-trader (1 hour <= median < 3 days)', () => {
    it('classifies as swing-trader at exactly 1-hour intervals', () => {
      const fills = fillsAtIntervals(baseTime, 60 * 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('swing-trader');
      expect(result.current.label).toBe('Swing Trader');
    });

    it('classifies as swing-trader for 12-hour intervals', () => {
      const fills = fillsAtIntervals(baseTime, 12 * 60 * 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('swing-trader');
    });

    it('classifies as swing-trader for 2-day intervals', () => {
      const fills = fillsAtIntervals(baseTime, 2 * 24 * 60 * 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('swing-trader');
    });

    it('classifies as swing-trader for just under 3 days', () => {
      const fills = fillsAtIntervals(baseTime, 3 * 24 * 60 * 60_000 - 1000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('swing-trader');
    });
  });

  describe('holder (median >= 3 days or insufficient data)', () => {
    it('classifies as holder for 3-day intervals', () => {
      const fills = fillsAtIntervals(baseTime, 3 * 24 * 60 * 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('holder');
      expect(result.current.label).toBe('Holder');
    });

    it('classifies as holder for 7-day intervals', () => {
      const fills = fillsAtIntervals(baseTime, 7 * 24 * 60 * 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('holder');
    });

    it('classifies as holder for fewer than 2 fills', () => {
      const fills = [makeFill(baseTime)];
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('holder');
    });

    it('classifies as holder for empty fills array', () => {
      const { result } = renderHook(() => useTraderClassification([], makeStats()));
      expect(result.current.style).toBe('holder');
    });

    it('classifies as holder when tradeCount < 2 even with multiple fills', () => {
      // Stats say 1 trade, even though fills has 2 entries
      const fills = fillsAtIntervals(baseTime, 60_000, 2);
      const stats = makeStats({ tradeCount: 1 });
      const { result } = renderHook(() => useTraderClassification(fills, stats));
      expect(result.current.style).toBe('holder');
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('edge cases', () => {
    it('handles undefined stats', () => {
      const fills = fillsAtIntervals(baseTime, 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, undefined));
      // Falls back to fills.length for tradeCount
      expect(result.current.style).toBe('scalper');
    });

    it('handles stats with null all-period (uses fills.length)', () => {
      const fills = fillsAtIntervals(baseTime, 60_000, 5);
      const stats: TraderStatsResponse = {
        address: '0x' + 'a'.repeat(64),
        nickname: null,
        stats: { '24h': null, '7d': null, '30d': null, 'all': null },
      };
      const { result } = renderHook(() => useTraderClassification(fills, stats));
      expect(result.current.style).toBe('scalper');
    });

    it('sorts timestamps before computing intervals (out-of-order fills)', () => {
      // Fills given in reverse order but should still compute correct intervals
      const fills = [
        makeFill(baseTime + 4 * 60_000),
        makeFill(baseTime),
        makeFill(baseTime + 2 * 60_000),
        makeFill(baseTime + 1 * 60_000),
        makeFill(baseTime + 3 * 60_000),
      ];
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      // All 1-minute intervals -> scalper
      expect(result.current.style).toBe('scalper');
    });

    it('handles mixed intervals (uses median)', () => {
      // Intervals: [1min, 1min, 30min, 1min, 1min]
      // Sorted intervals: [1, 1, 1, 1, 30] -> median = 1 min -> scalper
      const fills = [
        makeFill(baseTime),
        makeFill(baseTime + 60_000),
        makeFill(baseTime + 2 * 60_000),
        makeFill(baseTime + 32 * 60_000), // 30 min gap
        makeFill(baseTime + 33 * 60_000),
        makeFill(baseTime + 34 * 60_000),
      ];
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('scalper');
    });

    it('returns description field', () => {
      const fills = fillsAtIntervals(baseTime, 60_000, 5);
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.description).toBe('High-frequency, rapid trades');
    });

    it('exactly 2 fills with 1-minute gap -> scalper', () => {
      const fills = [
        makeFill(baseTime),
        makeFill(baseTime + 60_000),
      ];
      const { result } = renderHook(() => useTraderClassification(fills, makeStats({ tradeCount: 2 })));
      expect(result.current.style).toBe('scalper');
    });

    it('exactly 2 fills with 4-day gap -> holder', () => {
      const fills = [
        makeFill(baseTime),
        makeFill(baseTime + 4 * 24 * 60 * 60_000),
      ];
      const { result } = renderHook(() => useTraderClassification(fills, makeStats({ tradeCount: 2 })));
      expect(result.current.style).toBe('holder');
    });

    it('all fills at same timestamp -> scalper (0ms intervals)', () => {
      const fills = Array.from({ length: 5 }, () => makeFill(baseTime));
      const { result } = renderHook(() => useTraderClassification(fills, makeStats()));
      expect(result.current.style).toBe('scalper');
    });
  });
});
