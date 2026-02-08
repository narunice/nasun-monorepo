import { describe, it, expect } from 'vitest';
import { calculateStochastic } from './stochastic';
import type { CandlestickData, Time } from 'lightweight-charts';

function makeCandles(
  data: Array<{ close: number; high: number; low: number }>,
  startTime = 1000
): CandlestickData[] {
  return data.map((d, i) => ({
    time: (startTime + i * 60) as Time,
    open: d.close,
    high: d.high,
    low: d.low,
    close: d.close,
  }));
}

function makeSimpleCandles(closes: number[], startTime = 1000): CandlestickData[] {
  return closes.map((close, i) => ({
    time: (startTime + i * 60) as Time,
    open: close,
    high: close + 5,
    low: close - 5,
    close,
  }));
}

// ========================================
// calculateStochastic
// ========================================
describe('calculateStochastic', () => {
  it('returns empty for insufficient data', () => {
    const candles = makeSimpleCandles([10, 20, 30]);
    const result = calculateStochastic(candles, 14, 3, 3);
    expect(result.k).toEqual([]);
    expect(result.d).toEqual([]);
  });

  it('returns K and D arrays with correct length', () => {
    // Need kPeriod(14) + smooth(3) - 1 + dPeriod(3) - 1 = 18 candles for at least 1 D value
    const candles = makeSimpleCandles(Array.from({ length: 25 }, (_, i) => 100 + i));
    const result = calculateStochastic(candles, 14, 3, 3);

    expect(result.k.length).toBeGreaterThan(0);
    expect(result.d.length).toBeGreaterThan(0);
    expect(result.k.length).toBeGreaterThanOrEqual(result.d.length);
  });

  it('K and D values are between 0 and 100', () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i / 3) * 20);
    const candles = makeSimpleCandles(prices);
    const result = calculateStochastic(candles, 14, 3, 3);

    for (const point of result.k) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
    for (const point of result.d) {
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(100);
    }
  });

  it('handles constant range (high == low) with %K = 50', () => {
    // When high == low for all candles, range is 0, should return 50
    const candles: CandlestickData[] = Array.from({ length: 20 }, (_, i) => ({
      time: (1000 + i * 60) as Time,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
    }));
    const result = calculateStochastic(candles, 14, 3, 3);

    if (result.k.length > 0) {
      // All values should be 50 (default for zero range)
      for (const point of result.k) {
        expect(point.value).toBeCloseTo(50);
      }
    }
  });

  it('uptrend produces high stochastic values', () => {
    // Strong uptrend: close near high
    const candles: CandlestickData[] = Array.from({ length: 25 }, (_, i) => ({
      time: (1000 + i * 60) as Time,
      open: 100 + i * 2,
      high: 100 + i * 2 + 1,
      low: 100 + i * 2 - 10,
      close: 100 + i * 2, // close near high
    }));
    const result = calculateStochastic(candles, 14, 3, 3);

    if (result.k.length > 0) {
      const lastK = result.k[result.k.length - 1].value;
      expect(lastK).toBeGreaterThan(50);
    }
  });
});
