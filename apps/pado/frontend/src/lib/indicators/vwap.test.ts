import { describe, it, expect } from 'vitest';
import { calculateVWAP } from './vwap';
import type { CandleWithVolume } from './types';
import type { Time } from 'lightweight-charts';

function makeCandle(timeUnix: number, high: number, low: number, close: number, volume: number): CandleWithVolume {
  return { time: timeUnix as Time, open: close, high, low, close, volume };
}

describe('calculateVWAP', () => {
  it('returns empty array for empty input', () => {
    expect(calculateVWAP([])).toEqual([]);
  });

  it('computes VWAP for a single candle', () => {
    const candles = [makeCandle(1000, 110, 90, 100, 10)];
    const result = calculateVWAP(candles);
    expect(result).toHaveLength(1);
    // typicalPrice = (110 + 90 + 100) / 3 = 100
    expect(result[0].value).toBe(100);
  });

  it('computes VWAP accumulating across candles in same day', () => {
    // Both candles within the same UTC day (day = Math.floor(time / 86400) = 0)
    const candles = [
      makeCandle(100, 110, 90, 100, 10),   // tp=100, cumTPV=1000, cumVol=10, vwap=100
      makeCandle(200, 120, 100, 110, 20),   // tp=110, cumTPV=1000+2200=3200, cumVol=30, vwap=106.67
    ];
    const result = calculateVWAP(candles);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(100);
    expect(result[1].value).toBeCloseTo(3200 / 30, 2);
  });

  it('resets at UTC midnight boundary', () => {
    // Day 0: time < 86400
    // Day 1: time >= 86400
    const candles = [
      makeCandle(86300, 110, 90, 100, 10),  // Day 0, tp=100
      makeCandle(86500, 120, 100, 110, 20), // Day 1, resets! tp=110
    ];
    const result = calculateVWAP(candles);
    expect(result).toHaveLength(2);
    // First candle: VWAP = 100
    expect(result[0].value).toBe(100);
    // Second candle: cumulative reset, VWAP = 110 (just one candle in new day)
    expect(result[1].value).toBe(110);
  });

  it('skips candles with zero volume', () => {
    const candles = [
      makeCandle(100, 110, 90, 100, 0),   // zero volume, cumVol stays 0, no output
      makeCandle(200, 120, 100, 110, 10),  // normal
    ];
    const result = calculateVWAP(candles);
    // First candle has 0 volume, so cumVol=0 -> skipped
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(110); // tp = (120+100+110)/3 = 110
  });
});
