/**
 * Risk Metrics Tests
 * Unit tests for Sharpe Ratio, Profit Factor, Avg Win/Loss, Expectancy.
 */

import { describe, it, expect } from 'vitest';
import { computeRiskMetrics } from './risk-metrics';

// Helper to create trades on different days
function makeTrade(pnl: number, daysAgo: number = 0) {
  return { pnl, timestamp: Date.now() - daysAgo * 86_400_000 };
}

// ========================================
// Empty / Edge Cases
// ========================================

describe('computeRiskMetrics — edge cases', () => {
  it('returns zeros for empty trades', () => {
    const m = computeRiskMetrics([]);
    expect(m.sharpeRatio).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.avgWin).toBe(0);
    expect(m.avgLoss).toBe(0);
    expect(m.expectancy).toBe(0);
    expect(m.largestWin).toBe(0);
    expect(m.largestLoss).toBe(0);
  });

  it('returns zeros for single trade (insufficient data for Sharpe)', () => {
    const m = computeRiskMetrics([makeTrade(100)]);
    expect(m.sharpeRatio).toBe(0);
    // But other metrics should still work
    expect(m.profitFactor).toBe(99.9); // No losses → capped
    expect(m.avgWin).toBe(100);
    expect(m.avgLoss).toBe(0);
    expect(m.largestWin).toBe(100);
  });

  it('handles all break-even trades (zero PnL)', () => {
    const trades = [makeTrade(0, 1), makeTrade(0, 2), makeTrade(0, 3)];
    const m = computeRiskMetrics(trades);
    expect(m.profitFactor).toBe(0);
    expect(m.avgWin).toBe(0);
    expect(m.avgLoss).toBe(0);
    expect(m.expectancy).toBe(0);
  });
});

// ========================================
// Profit Factor
// ========================================

describe('computeRiskMetrics — profit factor', () => {
  it('computes profit factor for mixed trades', () => {
    const trades = [
      makeTrade(200, 1),   // win
      makeTrade(-100, 2),  // loss
    ];
    const m = computeRiskMetrics(trades);
    // grossProfit=200, grossLoss=100 → PF=2.0
    expect(m.profitFactor).toBe(2);
  });

  it('caps profit factor at 99.9 when no losses', () => {
    const trades = [makeTrade(50, 1), makeTrade(100, 2)];
    const m = computeRiskMetrics(trades);
    expect(m.profitFactor).toBe(99.9);
  });

  it('returns 0 when no wins', () => {
    const trades = [makeTrade(-50, 1), makeTrade(-100, 2)];
    const m = computeRiskMetrics(trades);
    expect(m.profitFactor).toBe(0);
  });

  it('handles very small losses correctly', () => {
    const trades = [makeTrade(1000, 1), makeTrade(-0.01, 2)];
    const m = computeRiskMetrics(trades);
    // 1000 / 0.01 = 100000, but capped at 99.9
    expect(m.profitFactor).toBe(99.9);
  });
});

// ========================================
// Avg Win / Avg Loss
// ========================================

describe('computeRiskMetrics — avg win/loss', () => {
  it('computes correct averages', () => {
    const trades = [
      makeTrade(100, 1),
      makeTrade(200, 2),
      makeTrade(-50, 3),
      makeTrade(-150, 4),
    ];
    const m = computeRiskMetrics(trades);
    // avgWin = (100+200)/2 = 150
    expect(m.avgWin).toBe(150);
    // avgLoss = (50+150)/2 = 100  (absolute value)
    expect(m.avgLoss).toBe(100);
  });

  it('returns 0 avgLoss when all wins', () => {
    const trades = [makeTrade(10, 1), makeTrade(20, 2)];
    const m = computeRiskMetrics(trades);
    expect(m.avgWin).toBe(15);
    expect(m.avgLoss).toBe(0);
  });

  it('returns 0 avgWin when all losses', () => {
    const trades = [makeTrade(-10, 1), makeTrade(-30, 2)];
    const m = computeRiskMetrics(trades);
    expect(m.avgWin).toBe(0);
    expect(m.avgLoss).toBe(20);
  });
});

// ========================================
// Expectancy
// ========================================

describe('computeRiskMetrics — expectancy', () => {
  it('computes positive expectancy', () => {
    // 3 wins of $100, 1 loss of $100
    const trades = [
      makeTrade(100, 1),
      makeTrade(100, 2),
      makeTrade(100, 3),
      makeTrade(-100, 4),
    ];
    const m = computeRiskMetrics(trades);
    // winRate=0.75, avgWin=100, lossRate=0.25, avgLoss=100
    // expectancy = 0.75*100 - 0.25*100 = 75 - 25 = 50
    expect(m.expectancy).toBe(50);
  });

  it('computes negative expectancy', () => {
    // 1 win of $100, 3 losses of $100
    const trades = [
      makeTrade(100, 1),
      makeTrade(-100, 2),
      makeTrade(-100, 3),
      makeTrade(-100, 4),
    ];
    const m = computeRiskMetrics(trades);
    // winRate=0.25, avgWin=100, lossRate=0.75, avgLoss=100
    // expectancy = 0.25*100 - 0.75*100 = 25 - 75 = -50
    expect(m.expectancy).toBe(-50);
  });

  it('computes zero expectancy for balanced trades', () => {
    const trades = [makeTrade(100, 1), makeTrade(-100, 2)];
    const m = computeRiskMetrics(trades);
    // winRate=0.5, avgWin=100, lossRate=0.5, avgLoss=100
    // expectancy = 50 - 50 = 0
    expect(m.expectancy).toBe(0);
  });
});

// ========================================
// Largest Win / Loss
// ========================================

describe('computeRiskMetrics — largest win/loss', () => {
  it('finds largest win and loss', () => {
    const trades = [
      makeTrade(50, 1),
      makeTrade(300, 2),
      makeTrade(-20, 3),
      makeTrade(-200, 4),
    ];
    const m = computeRiskMetrics(trades);
    expect(m.largestWin).toBe(300);
    expect(m.largestLoss).toBe(-200);
  });

  it('returns 0 for missing side', () => {
    const wins = [makeTrade(100, 1), makeTrade(200, 2)];
    const mWins = computeRiskMetrics(wins);
    expect(mWins.largestLoss).toBe(0);

    const losses = [makeTrade(-100, 1), makeTrade(-200, 2)];
    const mLosses = computeRiskMetrics(losses);
    expect(mLosses.largestWin).toBe(0);
  });
});

// ========================================
// Sharpe Ratio
// ========================================

describe('computeRiskMetrics — Sharpe Ratio', () => {
  it('returns 0 when all trades on same day (< 2 daily buckets)', () => {
    // Both on day 0 → single daily bucket → Sharpe = 0
    const trades = [makeTrade(100, 0), makeTrade(200, 0)];
    const m = computeRiskMetrics(trades);
    expect(m.sharpeRatio).toBe(0);
  });

  it('returns 0 when daily PnL has zero variance', () => {
    // Same PnL every day → stddev = 0 → Sharpe = 0
    const trades = [
      makeTrade(100, 1),
      makeTrade(100, 2),
      makeTrade(100, 3),
    ];
    const m = computeRiskMetrics(trades);
    expect(m.sharpeRatio).toBe(0);
  });

  it('computes positive Sharpe for consistently profitable trades', () => {
    // Wins > losses with some variance → positive Sharpe
    const trades = [
      makeTrade(100, 1),
      makeTrade(150, 2),
      makeTrade(80, 3),
      makeTrade(-20, 4),
      makeTrade(120, 5),
    ];
    const m = computeRiskMetrics(trades);
    expect(m.sharpeRatio).toBeGreaterThan(0);
  });

  it('computes negative Sharpe for consistently losing trades', () => {
    const trades = [
      makeTrade(-100, 1),
      makeTrade(-50, 2),
      makeTrade(-80, 3),
      makeTrade(10, 4),
      makeTrade(-120, 5),
    ];
    const m = computeRiskMetrics(trades);
    expect(m.sharpeRatio).toBeLessThan(0);
  });

  it('aggregates multiple trades on same day correctly', () => {
    // Day 1: +100, Day 2: +50 + -30 = +20
    const trades = [
      makeTrade(100, 1),
      makeTrade(50, 2),
      makeTrade(-30, 2),
    ];
    const m = computeRiskMetrics(trades);
    // 2 daily buckets: [100, 20] → mean=60, variance is non-zero → Sharpe defined
    expect(m.sharpeRatio).toBeGreaterThan(0);
  });
});

// ========================================
// Rounding
// ========================================

describe('computeRiskMetrics — rounding', () => {
  it('rounds all values to 2 decimal places', () => {
    const trades = [
      makeTrade(33.333, 1),
      makeTrade(-11.111, 2),
    ];
    const m = computeRiskMetrics(trades);
    // avgWin = 33.333 → 33.33
    expect(m.avgWin).toBe(33.33);
    // avgLoss = 11.111 → 11.11
    expect(m.avgLoss).toBe(11.11);
    // profitFactor = 33.333 / 11.111 ≈ 3.0000... → 3
    expect(m.profitFactor).toBe(3);
  });
});
