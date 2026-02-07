import type { CandlestickData } from 'lightweight-charts';
import { calculateEMA } from './movingAverage';
import type { MACDResult } from './types';

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * Uses standard periods: 12, 26, 9
 * @param data - Array of candlestick data
 * @returns MACD line, Signal line, and Histogram data
 */
export function calculateMACD(
  data: CandlestickData[],
  upColor = '#22c55e',
  downColor = '#ef4444',
): MACDResult {
  if (data.length < 26) {
    return { macd: [], signal: [], histogram: [] };
  }

  const closes = data.map((d) => d.close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);

  // MACD Line = EMA12 - EMA26
  const macdLine = ema12.map((v, i) => v - ema26[i]).slice(25);

  // Signal Line = 9-period EMA of MACD
  const signalLine = calculateEMA(macdLine, 9);

  const result: MACDResult = {
    macd: [],
    signal: [],
    histogram: [],
  };

  // Build result arrays (need at least 9 periods for signal)
  for (let i = 8; i < macdLine.length; i++) {
    const time = data[i + 25].time;
    const macdVal = macdLine[i];
    const signalVal = signalLine[i - 8];
    const histVal = macdVal - signalVal;

    result.macd.push({ time, value: macdVal });
    result.signal.push({ time, value: signalVal });
    result.histogram.push({
      time,
      value: histVal,
      color: histVal >= 0 ? upColor : downColor,
    });
  }

  return result;
}
