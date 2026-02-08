import { describe, it, expect } from 'vitest';
import { calculateMA, calculateEMA, calculateEMALine } from './movingAverage';
import type { CandlestickData, Time } from 'lightweight-charts';

// Helper to create candle data
function makeCandles(closes: number[], startTime = 1000): CandlestickData[] {
  return closes.map((close, i) => ({
    time: (startTime + i * 60) as Time,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
  }));
}

// ========================================
// calculateMA (Simple Moving Average)
// ========================================
describe('calculateMA', () => {
  it('calculates SMA correctly for period 3', () => {
    const candles = makeCandles([10, 20, 30, 40, 50]);
    const result = calculateMA(candles, 3);

    expect(result).toHaveLength(3); // 5 candles - 3 + 1 = 3 results
    expect(result[0].value).toBeCloseTo(20); // (10+20+30)/3
    expect(result[1].value).toBeCloseTo(30); // (20+30+40)/3
    expect(result[2].value).toBeCloseTo(40); // (30+40+50)/3
  });

  it('returns timestamps from original data', () => {
    const candles = makeCandles([10, 20, 30], 5000);
    const result = calculateMA(candles, 2);

    expect(result[0].time).toBe(5060); // 2nd candle's time
    expect(result[1].time).toBe(5120); // 3rd candle's time
  });

  it('returns empty for insufficient data', () => {
    const candles = makeCandles([10, 20]);
    expect(calculateMA(candles, 5)).toEqual([]);
  });

  it('returns single result when data.length === period', () => {
    const candles = makeCandles([10, 20, 30]);
    const result = calculateMA(candles, 3);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(20);
  });

  it('period 1 returns all data points', () => {
    const candles = makeCandles([100, 200, 300]);
    const result = calculateMA(candles, 1);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.value)).toEqual([100, 200, 300]);
  });
});

// ========================================
// calculateEMA (Exponential Moving Average)
// ========================================
describe('calculateEMA', () => {
  it('first value equals first data point', () => {
    const data = [10, 20, 30, 40, 50];
    const result = calculateEMA(data, 3);
    expect(result[0]).toBe(10);
  });

  it('calculates EMA with smoothing factor k=2/(period+1)', () => {
    // Period 3: k = 2/4 = 0.5
    const data = [10, 20, 30];
    const result = calculateEMA(data, 3);

    expect(result[0]).toBe(10);
    // EMA[1] = 20 * 0.5 + 10 * 0.5 = 15
    expect(result[1]).toBeCloseTo(15);
    // EMA[2] = 30 * 0.5 + 15 * 0.5 = 22.5
    expect(result[2]).toBeCloseTo(22.5);
  });

  it('returns same length as input', () => {
    const data = [10, 20, 30, 40, 50];
    expect(calculateEMA(data, 3)).toHaveLength(5);
  });

  it('returns empty for empty input', () => {
    expect(calculateEMA([], 3)).toEqual([]);
  });

  it('EMA converges toward recent values more quickly', () => {
    // Constant input should converge to that constant
    const data = Array(20).fill(100);
    const result = calculateEMA(data, 5);
    expect(result[result.length - 1]).toBeCloseTo(100);
  });
});

// ========================================
// calculateEMALine
// ========================================
describe('calculateEMALine', () => {
  it('skips first period-1 unconverged values', () => {
    const candles = makeCandles([10, 20, 30, 40, 50]);
    const result = calculateEMALine(candles, 3);

    // period 3 → skip first 2 → 3 results
    expect(result).toHaveLength(3);
  });

  it('preserves timestamps from original data', () => {
    const candles = makeCandles([10, 20, 30, 40, 50], 1000);
    const result = calculateEMALine(candles, 3);

    // First result should be at candle index 2 (offset = period - 1 = 2)
    expect(result[0].time).toBe(candles[2].time);
    expect(result[1].time).toBe(candles[3].time);
  });

  it('returns empty for insufficient data', () => {
    const candles = makeCandles([10]);
    expect(calculateEMALine(candles, 5)).toEqual([]);
  });
});
