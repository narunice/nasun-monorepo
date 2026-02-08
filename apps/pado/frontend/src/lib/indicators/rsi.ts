import type { CandlestickData, LineData } from 'lightweight-charts';

/**
 * Calculate Relative Strength Index (RSI)
 * @param data - Array of candlestick data
 * @param period - RSI period (default: 14)
 * @returns Array of RSI line data points (values 0-100)
 */
export function calculateRSI(data: CandlestickData[], period: number = 14): LineData[] {
  if (data.length < period + 1) return [];

  const result: LineData[] = [];
  let avgGain = 0;
  let avgLoss = 0;

  // Initial average calculation
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // RSI calculation using smoothed averages
  for (let i = period; i < data.length; i++) {
    if (i > period) {
      const change = data[i].close - data[i - 1].close;
      avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    }

    // Standard Wilder RSI: RSI = 100 when avgLoss = 0, RSI = 0 when avgGain = 0
    let rsi: number;
    if (avgLoss === 0) {
      rsi = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
    }

    result.push({ time: data[i].time, value: rsi });
  }

  return result;
}
