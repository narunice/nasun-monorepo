import type { LineData } from 'lightweight-charts';
import type { CandleWithVolume } from './types';

/**
 * Compute Volume Weighted Average Price (VWAP).
 * Resets at each UTC midnight boundary (session-based).
 */
export function calculateVWAP(data: CandleWithVolume[]): LineData[] {
  if (data.length === 0) return [];

  const result: LineData[] = [];
  let cumTPV = 0;
  let cumVol = 0;
  let currentDay = -1;

  for (const candle of data) {
    const day = Math.floor((candle.time as number) / 86400);

    // Reset accumulators at UTC midnight
    if (day !== currentDay) {
      cumTPV = 0;
      cumVol = 0;
      currentDay = day;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumTPV += typicalPrice * candle.volume;
    cumVol += candle.volume;

    if (cumVol > 0) {
      result.push({
        time: candle.time,
        value: cumTPV / cumVol,
      });
    }
  }

  return result;
}
