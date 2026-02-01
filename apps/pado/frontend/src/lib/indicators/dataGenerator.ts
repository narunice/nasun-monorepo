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

// Binance symbol mapping for tokens with external market data
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  'NBTC': 'BTCUSDT',
  'NASUN': '', // No external data
};

/**
 * Get Binance trading symbol for a given token
 * @returns Binance symbol (e.g., 'BTCUSDT') or empty string if unavailable
 */
export function getBinanceSymbol(tokenSymbol: string): string {
  return BINANCE_SYMBOL_MAP[tokenSymbol] || '';
}

/**
 * Fetch real OHLCV candle data from Binance API
 * @param symbol - Binance symbol (e.g., 'BTCUSDT')
 * @param interval - Candle interval (e.g., '15m', '1h', '1d')
 * @param limit - Number of candles to fetch
 * @returns Array of candle data, or null on error
 */
export async function fetchBinanceCandles(
  symbol: string,
  interval: string,
  limit: number
): Promise<CandleWithVolume[] | null> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) throw new Error(`Binance API ${response.status}`);

    const klines: unknown[][] = await response.json();

    return klines.map((k) => ({
      time: Math.floor((k[0] as number) / 1000) as Time,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  } catch (error) {
    console.warn('[Chart] Binance API failed, using simulated data:', error);
    return null;
  }
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
