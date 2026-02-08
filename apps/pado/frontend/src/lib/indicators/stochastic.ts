import type { CandlestickData, LineData } from 'lightweight-charts';
import type { StochasticResult } from './types';

function smaSmooth(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - j];
    }
    result.push(sum / period);
  }
  return result;
}

/**
 * Calculate Slow Stochastic Oscillator
 * @param data - Array of candlestick data
 * @param kPeriod - Lookback period for raw %K (default 14)
 * @param dPeriod - SMA period for %D signal (default 3)
 * @param smooth - SMA smoothing for %K (default 3, makes it "slow")
 */
export function calculateStochastic(
  data: CandlestickData[],
  kPeriod = 14,
  dPeriod = 3,
  smooth = 3
): StochasticResult {
  if (data.length < kPeriod) return { k: [], d: [] };

  // Step 1: Calculate raw %K for each bar
  const rawK: number[] = [];
  for (let i = kPeriod - 1; i < data.length; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = 0; j < kPeriod; j++) {
      const candle = data[i - j];
      if (candle.high > highest) highest = candle.high;
      if (candle.low < lowest) lowest = candle.low;
    }
    const range = highest - lowest;
    rawK.push(range === 0 ? 50 : ((data[i].close - lowest) / range) * 100);
  }

  // Step 2: Smooth raw %K with SMA to get slow %K
  const smoothedK = smaSmooth(rawK, smooth);

  // Step 3: %D = SMA of smoothed %K
  const dValues = smaSmooth(smoothedK, dPeriod);

  // Align timestamps
  const kOffset = (kPeriod - 1) + (smooth - 1);
  const dOffset = kOffset + (dPeriod - 1);

  const k: LineData[] = smoothedK.map((value, i) => ({
    time: data[i + kOffset].time,
    value,
  }));

  const d: LineData[] = dValues.map((value, i) => ({
    time: data[i + dOffset].time,
    value,
  }));

  return { k, d };
}
