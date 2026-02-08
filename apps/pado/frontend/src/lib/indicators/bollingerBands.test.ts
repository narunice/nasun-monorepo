import { describe, it, expect } from 'vitest';
import { calculateBollingerBands } from './bollingerBands';
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
// calculateBollingerBands
// ========================================
describe('calculateBollingerBands', () => {
  it('returns empty arrays for insufficient data', () => {
    const candles = makeCandles([100, 101, 102]);
    const result = calculateBollingerBands(candles, 20);
    expect(result.upper).toEqual([]);
    expect(result.middle).toEqual([]);
    expect(result.lower).toEqual([]);
  });

  it('middle band equals SMA', () => {
    // 5 candles, period 3
    const candles = makeCandles([10, 20, 30, 40, 50]);
    const result = calculateBollingerBands(candles, 3, 2);

    expect(result.middle).toHaveLength(3);
    expect(result.middle[0].value).toBeCloseTo(20); // (10+20+30)/3
    expect(result.middle[1].value).toBeCloseTo(30); // (20+30+40)/3
    expect(result.middle[2].value).toBeCloseTo(40); // (30+40+50)/3
  });

  it('upper band > middle > lower band', () => {
    const candles = makeCandles([10, 20, 30, 40, 50]);
    const result = calculateBollingerBands(candles, 3, 2);

    for (let i = 0; i < result.middle.length; i++) {
      expect(result.upper[i].value).toBeGreaterThan(result.middle[i].value);
      expect(result.lower[i].value).toBeLessThan(result.middle[i].value);
    }
  });

  it('bands are symmetric around middle', () => {
    const candles = makeCandles([10, 20, 30, 40, 50]);
    const result = calculateBollingerBands(candles, 3, 2);

    for (let i = 0; i < result.middle.length; i++) {
      const upperDiff = result.upper[i].value - result.middle[i].value;
      const lowerDiff = result.middle[i].value - result.lower[i].value;
      expect(upperDiff).toBeCloseTo(lowerDiff);
    }
  });

  it('zero stddev multiplier collapses bands to middle', () => {
    const candles = makeCandles([10, 20, 30, 40, 50]);
    const result = calculateBollingerBands(candles, 3, 0);

    for (let i = 0; i < result.middle.length; i++) {
      expect(result.upper[i].value).toBeCloseTo(result.middle[i].value);
      expect(result.lower[i].value).toBeCloseTo(result.middle[i].value);
    }
  });

  it('constant prices produce zero-width bands', () => {
    const candles = makeCandles([100, 100, 100, 100, 100]);
    const result = calculateBollingerBands(candles, 3, 2);

    for (let i = 0; i < result.middle.length; i++) {
      expect(result.upper[i].value).toBeCloseTo(100);
      expect(result.lower[i].value).toBeCloseTo(100);
    }
  });

  it('all three arrays have same length', () => {
    const candles = makeCandles(Array.from({ length: 25 }, (_, i) => 100 + i));
    const result = calculateBollingerBands(candles, 20, 2);

    expect(result.upper.length).toBe(result.middle.length);
    expect(result.lower.length).toBe(result.middle.length);
  });

  it('timestamps align across all bands', () => {
    const candles = makeCandles([10, 20, 30, 40, 50], 5000);
    const result = calculateBollingerBands(candles, 3, 2);

    for (let i = 0; i < result.middle.length; i++) {
      expect(result.upper[i].time).toBe(result.middle[i].time);
      expect(result.lower[i].time).toBe(result.middle[i].time);
    }
  });
});
