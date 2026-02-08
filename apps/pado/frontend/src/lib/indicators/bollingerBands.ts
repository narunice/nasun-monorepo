import type { CandlestickData, LineData } from 'lightweight-charts';
import { calculateMA } from './movingAverage';
import type { BollingerBandsResult } from './types';

/**
 * Calculate Bollinger Bands
 * @param data - Array of candlestick data
 * @param period - SMA period (default 20)
 * @param stdDevMultiplier - Standard deviation multiplier (default 2)
 */
export function calculateBollingerBands(
  data: CandlestickData[],
  period = 20,
  stdDevMultiplier = 2
): BollingerBandsResult {
  const middle = calculateMA(data, period);

  const upper: LineData[] = [];
  const lower: LineData[] = [];

  for (let i = 0; i < middle.length; i++) {
    const dataIdx = i + (period - 1);
    let sumSqDiff = 0;
    for (let j = 0; j < period; j++) {
      const diff = data[dataIdx - j].close - middle[i].value;
      sumSqDiff += diff * diff;
    }
    const stddev = Math.sqrt(sumSqDiff / period);
    const band = stddev * stdDevMultiplier;

    upper.push({ time: middle[i].time, value: middle[i].value + band });
    lower.push({ time: middle[i].time, value: middle[i].value - band });
  }

  return { upper, middle, lower };
}
