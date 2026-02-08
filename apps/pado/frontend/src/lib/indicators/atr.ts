import type { CandlestickData, LineData } from 'lightweight-charts';

/**
 * Calculate Average True Range (ATR)
 * Uses Wilder's smoothing method.
 * @param data - Array of candlestick data
 * @param period - ATR period (default 14)
 */
export function calculateATR(data: CandlestickData[], period = 14): LineData[] {
  if (data.length < 2) return [];

  // Calculate True Range for each bar (starting from index 1)
  const trValues: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trValues.push(tr);
  }

  if (trValues.length < period) return [];

  // First ATR = simple average of first `period` TR values
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trValues[i];
  }
  atr /= period;

  const result: LineData[] = [{
    time: data[period].time, // offset by 1 (TR starts at index 1) + period-1
    value: atr,
  }];

  // Wilder's smoothing: ATR = ((prevATR * (period-1)) + currentTR) / period
  for (let i = period; i < trValues.length; i++) {
    atr = ((atr * (period - 1)) + trValues[i]) / period;
    result.push({
      time: data[i + 1].time, // +1 because trValues is offset by 1
      value: atr,
    });
  }

  return result;
}
