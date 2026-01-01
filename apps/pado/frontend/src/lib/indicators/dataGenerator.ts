import type { HistogramData, Time } from 'lightweight-charts';
import type { CandleWithVolume } from './types';

/**
 * Generate simulated OHLCV candlestick data
 * @param basePrice - Starting price
 * @param count - Number of candles to generate
 * @param intervalMs - Time interval in milliseconds
 * @returns Array of candle data with volume
 */
export function generateCandleData(
  basePrice: number,
  count: number,
  intervalMs: number
): CandleWithVolume[] {
  const data: CandleWithVolume[] = [];
  let price = basePrice;
  const now = Date.now();
  const startTime = now - count * intervalMs;

  for (let i = 0; i < count; i++) {
    const time = Math.floor((startTime + i * intervalMs) / 1000) as Time;
    const volatility = 0.02;

    const open = price;
    const change1 = (Math.random() - 0.5) * 2 * volatility * price;
    const change2 = (Math.random() - 0.5) * 2 * volatility * price;
    const change3 = (Math.random() - 0.5) * 2 * volatility * price;

    const high = Math.max(open, open + change1, open + change2, open + change3);
    const low = Math.min(open, open + change1, open + change2, open + change3);
    const close = open + change3;
    const volume = 100 + Math.random() * 900; // 100-1000

    data.push({ time, open, high, low, close, volume });
    price = close;
  }

  return data;
}

/**
 * Generate volume histogram data from candle data
 * @param candleData - Array of candle data with volume
 * @returns Array of histogram data for volume chart
 */
export function generateVolumeData(candleData: CandleWithVolume[]): HistogramData[] {
  return candleData.map((candle) => ({
    time: candle.time,
    value: candle.volume,
    color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
  }));
}
