import { describe, it, expect } from 'vitest';
import { buildPnlSeries } from './usePnlTimeSeries';
import type { UserTrade } from './useTradeHistory';

function makeTrade(overrides: Partial<UserTrade> & { side: 'buy' | 'sell'; price: number; quantity: number }): UserTrade {
  return {
    id: `trade-${Math.random().toString(36).slice(2, 8)}`,
    poolId: '0xpool1',
    poolName: 'NBTC/NUSDC',
    total: overrides.price * overrides.quantity,
    fee: 0,
    timestamp: Date.now(),
    txDigest: '0xtx',
    ...overrides,
  };
}

describe('buildPnlSeries', () => {
  it('returns empty array for empty trades', () => {
    expect(buildPnlSeries([])).toEqual([]);
  });

  it('calculates zero PnL for a single buy (no sell)', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 1, fee: 0, timestamp: 1000 }),
    ];
    const result = buildPnlSeries(trades);
    expect(result).toHaveLength(1);
    expect(result[0].cumulativePnl).toBe(0);
  });

  it('deducts buy fees from PnL', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 1, fee: 0.5, timestamp: 1000 }),
    ];
    const result = buildPnlSeries(trades);
    expect(result[0].cumulativePnl).toBe(-0.5);
  });

  it('calculates positive PnL when selling at a profit', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 2, fee: 0, timestamp: 1000 }),
      makeTrade({ side: 'sell', price: 120, quantity: 2, fee: 0, timestamp: 2000 }),
    ];
    const result = buildPnlSeries(trades);
    expect(result).toHaveLength(2);
    // PnL = (120 - 100) * 2 = 40
    expect(result[1].cumulativePnl).toBe(40);
  });

  it('calculates negative PnL when selling at a loss', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 1, fee: 0, timestamp: 1000 }),
      makeTrade({ side: 'sell', price: 80, quantity: 1, fee: 0, timestamp: 2000 }),
    ];
    const result = buildPnlSeries(trades);
    // PnL = (80 - 100) * 1 = -20
    expect(result[1].cumulativePnl).toBe(-20);
  });

  it('accounts for fees in sell PnL', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 1, fee: 0, timestamp: 1000 }),
      makeTrade({ side: 'sell', price: 120, quantity: 1, fee: 1.5, timestamp: 2000 }),
    ];
    const result = buildPnlSeries(trades);
    // PnL = (120 - 100) * 1 - 1.5 = 18.5
    expect(result[1].cumulativePnl).toBe(18.5);
  });

  it('correctly calculates weighted average cost basis with multiple buys', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 2, fee: 0, timestamp: 1000 }),
      makeTrade({ side: 'buy', price: 200, quantity: 1, fee: 0, timestamp: 2000 }),
      // Avg price: (100*2 + 200*1) / 3 = 133.33...
      makeTrade({ side: 'sell', price: 150, quantity: 3, fee: 0, timestamp: 3000 }),
    ];
    const result = buildPnlSeries(trades);
    // PnL = (150 - 133.33) * 3 = 50
    expect(result[2].cumulativePnl).toBeCloseTo(50, 1);
  });

  it('handles partial sells correctly', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 10, fee: 0, timestamp: 1000 }),
      makeTrade({ side: 'sell', price: 120, quantity: 5, fee: 0, timestamp: 2000 }),
      // Sell half: PnL = (120 - 100) * 5 = 100
      makeTrade({ side: 'sell', price: 90, quantity: 5, fee: 0, timestamp: 3000 }),
      // Sell rest: PnL += (90 - 100) * 5 = -50, cumulative = 50
    ];
    const result = buildPnlSeries(trades);
    expect(result[1].cumulativePnl).toBe(100);
    expect(result[2].cumulativePnl).toBe(50);
  });

  it('sorts trades chronologically regardless of input order', () => {
    const trades = [
      makeTrade({ side: 'sell', price: 120, quantity: 1, fee: 0, timestamp: 2000 }),
      makeTrade({ side: 'buy', price: 100, quantity: 1, fee: 0, timestamp: 1000 }),
    ];
    const result = buildPnlSeries(trades);
    expect(result[0].time).toBe(1000);
    expect(result[1].time).toBe(2000);
    // Even though sell was first in input, buy is processed first
    expect(result[1].cumulativePnl).toBe(20);
  });

  it('tracks multiple tokens independently', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 1, fee: 0, timestamp: 1000, poolName: 'NBTC/NUSDC' }),
      makeTrade({ side: 'buy', price: 5, quantity: 10, fee: 0, timestamp: 2000, poolName: 'NSN/NUSDC' }),
      makeTrade({ side: 'sell', price: 120, quantity: 1, fee: 0, timestamp: 3000, poolName: 'NBTC/NUSDC' }),
      // NBTC PnL: (120-100)*1 = 20
      makeTrade({ side: 'sell', price: 3, quantity: 10, fee: 0, timestamp: 4000, poolName: 'NSN/NUSDC' }),
      // NASUN PnL: (3-5)*10 = -20, cumulative = 0
    ];
    const result = buildPnlSeries(trades);
    expect(result[2].cumulativePnl).toBe(20);
    expect(result[3].cumulativePnl).toBe(0);
  });

  it('rounds PnL to 2 decimal places', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 33.33, quantity: 3, fee: 0, timestamp: 1000 }),
      makeTrade({ side: 'sell', price: 33.34, quantity: 3, fee: 0, timestamp: 2000 }),
    ];
    const result = buildPnlSeries(trades);
    // PnL = (33.34 - 33.33) * 3 = 0.03
    expect(result[1].cumulativePnl).toBe(0.03);
  });

  it('handles selling tokens not previously bought (zero avg price)', () => {
    const trades = [
      makeTrade({ side: 'sell', price: 50, quantity: 1, fee: 0, timestamp: 1000 }),
    ];
    const result = buildPnlSeries(trades);
    // PnL = (50 - 0) * 1 = 50 (avg price is 0 since no buy)
    expect(result[0].cumulativePnl).toBe(50);
  });

  it('accumulates PnL across many trades', () => {
    const trades = [
      makeTrade({ side: 'buy', price: 100, quantity: 1, fee: 1, timestamp: 1000 }),
      makeTrade({ side: 'sell', price: 110, quantity: 1, fee: 1, timestamp: 2000 }),
      makeTrade({ side: 'buy', price: 105, quantity: 1, fee: 1, timestamp: 3000 }),
      makeTrade({ side: 'sell', price: 115, quantity: 1, fee: 1, timestamp: 4000 }),
    ];
    const result = buildPnlSeries(trades);
    // Trade 1: buy fee -1, cumPnl = -1
    // Trade 2: sell PnL = (110-100)*1 - 1 = 9, cumPnl = -1+9 = 8
    // Trade 3: buy fee -1, cumPnl = 8-1 = 7
    // Trade 4: sell PnL = (115-105)*1 - 1 = 9, cumPnl = 7+9 = 16
    expect(result[0].cumulativePnl).toBe(-1);
    expect(result[1].cumulativePnl).toBe(8);
    expect(result[2].cumulativePnl).toBe(7);
    expect(result[3].cumulativePnl).toBe(16);
  });
});
