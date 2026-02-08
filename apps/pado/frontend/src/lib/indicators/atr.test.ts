import { describe, it, expect } from 'vitest';
import { calculateATR } from './atr';
import type { CandlestickData, Time } from 'lightweight-charts';

function makeCandles(
  data: Array<{ open: number; high: number; low: number; close: number }>,
  startTime = 1000
): CandlestickData[] {
  return data.map((d, i) => ({
    time: (startTime + i * 60) as Time,
    ...d,
  }));
}

// ========================================
// calculateATR
// ========================================
describe('calculateATR', () => {
  it('returns empty for single candle (need at least 2 for True Range)', () => {
    const candles = makeCandles([{ open: 100, high: 105, low: 95, close: 102 }]);
    expect(calculateATR(candles, 14)).toEqual([]);
  });

  it('returns empty when TR values < period', () => {
    const candles = makeCandles([
      { open: 100, high: 105, low: 95, close: 102 },
      { open: 102, high: 108, low: 98, close: 106 },
      { open: 106, high: 110, low: 100, close: 104 },
    ]);
    // 2 TR values, period 14 needs 14
    expect(calculateATR(candles, 14)).toEqual([]);
  });

  it('calculates ATR correctly', () => {
    // Create 16 candles (15 TR values, period 14)
    const candles = makeCandles(
      Array.from({ length: 16 }, (_, i) => ({
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 102 + i,
      }))
    );
    const result = calculateATR(candles, 14);

    expect(result.length).toBeGreaterThan(0);
    // ATR should be positive
    for (const point of result) {
      expect(point.value).toBeGreaterThan(0);
    }
  });

  it('first ATR is simple average of first period TR values', () => {
    // 15 candles → 14 TR values → 1 ATR (period 14)
    // All candles have same range: high-low = 10
    const candles = makeCandles(
      Array.from({ length: 15 }, (_, i) => ({
        open: 100 + i,
        high: 110 + i, // high - low = 10
        low: 100 + i,
        close: 105 + i,
      }))
    );
    const result = calculateATR(candles, 14);
    expect(result).toHaveLength(1);

    // TR = max(10, |high - prev_close|, |low - prev_close|)
    // For sequential candles with close going up by 1:
    // TR[0] = max(10, |111-105|, |101-105|) = max(10, 6, 4) = 10
    // So first ATR should be close to 10
    expect(result[0].value).toBeCloseTo(10, 0);
  });

  it('ATR values are all positive', () => {
    const candles = makeCandles(
      Array.from({ length: 30 }, (_, i) => ({
        open: 100 + Math.sin(i / 3) * 10,
        high: 110 + Math.sin(i / 3) * 10,
        low: 90 + Math.sin(i / 3) * 10,
        close: 105 + Math.sin(i / 3) * 10,
      }))
    );
    const result = calculateATR(candles, 14);

    for (const point of result) {
      expect(point.value).toBeGreaterThan(0);
    }
  });

  it('timestamps are correctly offset', () => {
    const candles = makeCandles(
      Array.from({ length: 20 }, (_) => ({
        open: 100,
        high: 110,
        low: 90,
        close: 100,
      })),
      5000
    );
    const result = calculateATR(candles, 14);

    // First ATR timestamp at data[period] (index 14)
    expect(result[0].time).toBe(candles[14].time);
  });

  it('uses Wilder smoothing for subsequent values', () => {
    // Period 2 for simplicity
    const candles = makeCandles([
      { open: 100, high: 110, low: 90, close: 100 },  // candle 0
      { open: 100, high: 115, low: 85, close: 100 },  // candle 1, TR=max(30,15,15)=30
      { open: 100, high: 120, low: 80, close: 100 },  // candle 2, TR=max(40,20,20)=40
      { open: 100, high: 110, low: 90, close: 100 },  // candle 3, TR=max(20,10,10)=20
    ]);

    const result = calculateATR(candles, 2);
    // TR values: [30, 40, 20]
    // First ATR (period 2) = (30 + 40) / 2 = 35
    expect(result[0].value).toBeCloseTo(35);
    // Second ATR = ((35 * 1) + 20) / 2 = 27.5
    expect(result[1].value).toBeCloseTo(27.5);
  });
});
