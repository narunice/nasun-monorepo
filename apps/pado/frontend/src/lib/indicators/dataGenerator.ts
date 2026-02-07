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
 * 24-hour ticker data from Binance
 */
export interface Binance24hTicker {
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

/**
 * Fetch 24h ticker data from Binance
 * @param symbol - Binance symbol (e.g., 'BTCUSDT')
 * @returns 24h ticker data, or null on error
 */
export async function fetchBinance24hTicker(
  symbol: string
): Promise<Binance24hTicker | null> {
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) throw new Error(`Binance API ${response.status}`);

    const data = await response.json();
    return {
      priceChange: parseFloat(data.priceChange),
      priceChangePercent: parseFloat(data.priceChangePercent),
      highPrice: parseFloat(data.highPrice),
      lowPrice: parseFloat(data.lowPrice),
      volume: parseFloat(data.volume),
      quoteVolume: parseFloat(data.quoteVolume),
    };
  } catch (error) {
    console.warn('[Market] Binance 24h ticker failed:', error);
    return null;
  }
}

/**
 * Recent trade data from Binance
 */
export interface RecentTrade {
  id: number;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean;
}

/**
 * Fetch recent trades from Binance
 * @param symbol - Binance symbol (e.g., 'BTCUSDT')
 * @param limit - Number of trades (max 1000, default 50)
 * @returns Array of recent trades, or null on error
 */
export async function fetchBinanceRecentTrades(
  symbol: string,
  limit: number = 50
): Promise<RecentTrade[] | null> {
  try {
    const url = `https://api.binance.com/api/v3/trades?symbol=${symbol}&limit=${limit}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) throw new Error(`Binance API ${response.status}`);

    const data = await response.json();
    return data.map((t: Record<string, unknown>) => ({
      id: t.id as number,
      price: parseFloat(t.price as string),
      qty: parseFloat(t.qty as string),
      time: t.time as number,
      isBuyerMaker: t.isBuyerMaker as boolean,
    }));
  } catch (error) {
    console.warn('[Market] Binance recent trades failed:', error);
    return null;
  }
}

/**
 * Generate volume histogram data from candle data
 * @param candleData - Array of candle data with volume
 * @returns Array of histogram data for volume chart
 */
export function generateVolumeData(
  candleData: CandleWithVolume[],
  upColor = 'rgba(34, 197, 94, 0.5)',
  downColor = 'rgba(239, 68, 68, 0.5)',
): HistogramData[] {
  return candleData.map((candle) => ({
    time: candle.time,
    value: candle.volume,
    color: candle.close >= candle.open ? upColor : downColor,
  }));
}
