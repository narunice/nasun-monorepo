import { describe, it, expect } from 'vitest';
import { calculateMACD } from './macd';
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
// calculateMACD
// ========================================
describe('calculateMACD', () => {
  it('returns empty arrays for insufficient data (< 26)', () => {
    const candles = makeCandles(Array.from({ length: 25 }, (_, i) => 100 + i));
    const result = calculateMACD(candles);

    expect(result.macd).toEqual([]);
    expect(result.signal).toEqual([]);
    expect(result.histogram).toEqual([]);
  });

  it('returns non-empty results for sufficient data', () => {
    // Need 26 + 8 = 34 candles minimum for MACD + signal
    const prices = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const candles = makeCandles(prices);
    const result = calculateMACD(candles);

    expect(result.macd.length).toBeGreaterThan(0);
    expect(result.signal.length).toBeGreaterThan(0);
    expect(result.histogram.length).toBeGreaterThan(0);
  });

  it('all three arrays have same length', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
    const candles = makeCandles(prices);
    const result = calculateMACD(candles);

    expect(result.macd.length).toBe(result.signal.length);
    expect(result.signal.length).toBe(result.histogram.length);
  });

  it('histogram = MACD - Signal', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 20);
    const candles = makeCandles(prices);
    const result = calculateMACD(candles);

    for (let i = 0; i < result.histogram.length; i++) {
      const expected = result.macd[i].value - result.signal[i].value;
      expect(result.histogram[i].value).toBeCloseTo(expected, 10);
    }
  });

  it('histogram color is green for positive, red for negative', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 20);
    const candles = makeCandles(prices);
    const result = calculateMACD(candles);

    for (const bar of result.histogram) {
      if (bar.value >= 0) {
        expect(bar.color).toBe('#22c55e');
      } else {
        expect(bar.color).toBe('#ef4444');
      }
    }
  });

  it('custom colors are applied', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 100 + i);
    const candles = makeCandles(prices);
    const result = calculateMACD(candles, '#00ff00', '#ff0000');

    // Uptrend should have positive MACD → green histogram
    const positiveBar = result.histogram.find(b => b.value >= 0);
    if (positiveBar) {
      expect(positiveBar.color).toBe('#00ff00');
    }
  });

  it('timestamps align with input data', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 100 + i);
    const candles = makeCandles(prices, 5000);
    const result = calculateMACD(candles);

    // All timestamps should be from original candle data
    for (const point of result.macd) {
      const found = candles.some(c => c.time === point.time);
      expect(found).toBe(true);
    }
  });
});
