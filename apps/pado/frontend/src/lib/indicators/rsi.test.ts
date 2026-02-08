import { describe, it, expect } from 'vitest';
import { calculateRSI } from './rsi';
import type { CandlestickData, Time } from 'lightweight-charts';

function makeCandles(closes: number[], startTime = 1000): CandlestickData[] {
  return closes.map((close, i) => ({
    time: (startTime + i * 60) as Time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  }));
}

// ========================================
// calculateRSI
// ========================================
describe('calculateRSI', () => {
  it('returns empty for insufficient data (< period + 1)', () => {
    const candles = makeCandles([100, 101, 102, 103]); // 4 candles, period 14 needs 15
    expect(calculateRSI(candles, 14)).toEqual([]);
  });

  it('produces values between 0 and 100', () => {
    // Generate 30 candles with random-ish prices
    const prices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109,
                    111, 110, 112, 114, 113, 115, 117, 116, 118, 120,
                    119, 121, 123, 122, 124, 126, 125, 127, 129, 128];
    const candles = makeCandles(prices);
    const result = calculateRSI(candles, 14);

    expect(result.length).toBeGreaterThan(0);
    for (const point of result) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  it('RSI = 100 when all changes are positive', () => {
    // 16 candles with strictly increasing prices (15 changes, all positive)
    const prices = Array.from({ length: 16 }, (_, i) => 100 + i);
    const candles = makeCandles(prices);
    const result = calculateRSI(candles, 14);

    expect(result.length).toBeGreaterThan(0);
    // When avgLoss = 0: RSI = 100 (standard Wilder formula)
    expect(result[0].value).toBe(100);
  });

  it('RSI approaches 0 when all changes are negative', () => {
    const prices = Array.from({ length: 16 }, (_, i) => 200 - i);
    const candles = makeCandles(prices);
    const result = calculateRSI(candles, 14);

    expect(result.length).toBeGreaterThan(0);
    // avgGain = 0 → RS = 0 → RSI = 100 - 100/(1+0) = 0
    expect(result[0].value).toBeCloseTo(0, 0);
  });

  it('uses Wilder smoothing for subsequent values', () => {
    // 20 candles: first 14 up, then down
    const prices = [
      100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128,
      126, 124, 122, 120, 118,
    ];
    const candles = makeCandles(prices);
    const result = calculateRSI(candles, 14);

    expect(result.length).toBe(6); // 20 - 14 = 6 results
    // First RSI = 100 (all gains, no losses)
    expect(result[0].value).toBe(100);
    // Subsequent values should decrease as losses appear
    expect(result[1].value).toBeLessThan(100);
    expect(result[2].value).toBeLessThan(result[1].value);
  });

  it('result timestamps match input data', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const candles = makeCandles(prices, 5000);
    const result = calculateRSI(candles, 14);

    // First result at index `period` (14)
    expect(result[0].time).toBe(candles[14].time);
  });
});
