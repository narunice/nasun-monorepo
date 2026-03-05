import { describe, it, expect } from 'vitest';
import { calculateIchimoku } from './ichimoku';
import type { CandlestickData, Time } from 'lightweight-charts';

function makeCandle(timeUnix: number, high: number, low: number, close: number): CandlestickData {
  return { time: timeUnix as Time, open: close, high, low, close };
}

// Generate sequential candles with predictable prices
function generateCandles(count: number, basePrice: number = 100, intervalSec: number = 3600): CandlestickData[] {
  return Array.from({ length: count }, (_, i) => {
    const price = basePrice + i;
    return makeCandle(
      1000 + i * intervalSec,
      price + 5,
      price - 5,
      price,
    );
  });
}

describe('calculateIchimoku', () => {
  const intervalMs = 3600 * 1000; // 1h

  it('returns empty arrays for empty input', () => {
    const result = calculateIchimoku([], intervalMs);
    expect(result.tenkanSen).toEqual([]);
    expect(result.kijunSen).toEqual([]);
    expect(result.senkouSpanA).toEqual([]);
    expect(result.senkouSpanB).toEqual([]);
    expect(result.chikouSpan).toEqual([]);
  });

  it('tenkanSen starts after tenkan periods (default 9)', () => {
    const candles = generateCandles(20);
    const result = calculateIchimoku(candles, intervalMs);
    // tenkan=9, so first value at index 8 (9th candle)
    expect(result.tenkanSen.length).toBe(12); // 20 - 9 + 1 = 12
  });

  it('kijunSen starts after kijun periods (default 26)', () => {
    const candles = generateCandles(30);
    const result = calculateIchimoku(candles, intervalMs);
    // kijun=26, so first value at index 25 (26th candle)
    expect(result.kijunSen.length).toBe(5); // 30 - 26 + 1 = 5
  });

  it('senkouSpanB starts after senkou periods (default 52)', () => {
    const candles = generateCandles(60);
    const result = calculateIchimoku(candles, intervalMs);
    // senkou=52, so first value at index 51
    expect(result.senkouSpanB.length).toBe(9); // 60 - 52 + 1 = 9
  });

  it('senkouSpanA timestamps are shifted kijun periods into the future', () => {
    const candles = generateCandles(30);
    const result = calculateIchimoku(candles, intervalMs);
    if (result.senkouSpanA.length > 0) {
      const firstSpanA = result.senkouSpanA[0];
      // The span should have a future-shifted timestamp
      // Original time + 26 * intervalSec
      const originalCandle = candles[25]; // first candle where both tenkan and kijun exist
      const expectedTime = (originalCandle.time as number) + 26 * 3600;
      expect(firstSpanA.time).toBe(expectedTime);
    }
  });

  it('chikouSpan starts after kijun periods', () => {
    const candles = generateCandles(30);
    const result = calculateIchimoku(candles, intervalMs);
    // chikou at index i uses data[i-26].time, so starts at i=26
    expect(result.chikouSpan.length).toBe(4); // 30 - 26 = 4
  });

  it('chikouSpan values are close prices shifted into the past', () => {
    const candles = generateCandles(30);
    const result = calculateIchimoku(candles, intervalMs);
    if (result.chikouSpan.length > 0) {
      // chikou[0] = close of candle[26] at time of candle[0]
      expect(result.chikouSpan[0].value).toBe(candles[26].close);
      expect(result.chikouSpan[0].time).toBe(candles[0].time);
    }
  });

  it('accepts custom params', () => {
    const candles = generateCandles(20);
    const result = calculateIchimoku(candles, intervalMs, { tenkan: 5, kijun: 10, senkou: 20 });
    // tenkan=5, so starts at index 4
    expect(result.tenkanSen.length).toBe(16); // 20 - 5 + 1
    // kijun=10, so starts at index 9
    expect(result.kijunSen.length).toBe(11); // 20 - 10 + 1
    // senkou=20, so starts at index 19
    expect(result.senkouSpanB.length).toBe(1); // 20 - 20 + 1
  });

  it('tenkan value is (highest high + lowest low) / 2 over period', () => {
    // 9 candles with known highs and lows
    const candles = generateCandles(9);
    // Prices: 100-108, highs: 105-113, lows: 95-103
    const result = calculateIchimoku(candles, intervalMs);
    expect(result.tenkanSen.length).toBe(1);
    // highest high over 9 candles: 113, lowest low: 95
    // tenkan = (113 + 95) / 2 = 104
    expect(result.tenkanSen[0].value).toBe(104);
  });
});
