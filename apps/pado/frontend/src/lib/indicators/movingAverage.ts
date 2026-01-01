import type { CandlestickData, LineData } from 'lightweight-charts';

/**
 * Calculate Simple Moving Average (SMA)
 * @param data - Array of candlestick data
 * @param period - MA period (e.g., 5, 20, 50)
 * @returns Array of MA line data points
 */
export function calculateMA(data: CandlestickData[], period: number): LineData[] {
  const result: LineData[] = [];

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({
      time: data[i].time,
      value: sum / period,
    });
  }

  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param data - Array of close prices
 * @param period - EMA period (e.g., 12, 26)
 * @returns Array of EMA values
 */
export function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];

  const k = 2 / (period + 1);
  const result: number[] = [data[0]];

  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }

  return result;
}
