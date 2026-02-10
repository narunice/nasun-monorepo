/**
 * TradingView Datafeed Adapter for Pado DEX
 *
 * Implements TradingView's IDatafeedChartApi interface using Binance API
 * for real-time market data. For tokens without Binance mapping (NASUN),
 * generates simulated candle data.
 *
 * Data model change: Push → Pull
 * - Old (lightweight-charts): app fetches data, calls series.setData()
 * - New (TradingView): chart calls datafeed.getBars() / subscribeBars()
 */

import type {
  IDatafeedChartApi,
  OnReadyCallback,
  SearchSymbolsCallback,
  ResolveCallback,
  ErrorCallback,
  HistoryCallback,
  SubscribeBarsCallback,
  Bar,
  PeriodParams,
  LibrarySymbolInfo,
  DatafeedConfiguration,
} from './types';

// ========================================
// Constants
// ========================================

const SUPPORTED_RESOLUTIONS = ['1', '5', '15', '60', '240', '1D', '1W'];

// Maps TV resolution strings to Binance kline interval strings
const RESOLUTION_TO_BINANCE: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '1D': '1d',
  '1W': '1w',
};

// Maps base token symbols to Binance trading pairs
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  NBTC: 'BTCUSDT',
  NETH: 'ETHUSDT',
  NSOL: 'SOLUSDT',
  NASUN: '', // No external data
};

// Price scale mapping for proper decimal display
const PRICESCALE_MAP: Record<string, number> = {
  NBTC: 100,    // 2 decimal places for BTC
  NETH: 100,    // 2 decimal places for ETH
  NSOL: 10000,  // 4 decimal places for SOL
  NASUN: 10000, // 4 decimal places for NASUN
};

// Approximate prices for fallback when Binance API is unavailable (updated 2026-02)
const FALLBACK_PRICES: Record<string, number> = {
  NBTC: 69000,
  NETH: 2000,
  NSOL: 85,
  NASUN: 0.10,
};

const BINANCE_API = 'https://api.binance.com/api/v3';
const POLL_INTERVAL_MS = 10_000; // 10 seconds for real-time bar updates
const MAX_CONSECUTIVE_FAILURES = 6; // After 6 failures, max backoff is ~10 minutes

// ========================================
// Binance API Helpers
// ========================================

async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  from: number,
  to: number,
  limit: number,
): Promise<Bar[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    startTime: String(from * 1000),
    endTime: String(to * 1000),
    limit: String(Math.min(limit, 1000)),
  });

  const response = await fetch(`${BINANCE_API}/klines?${params}`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }

  const body = await response.json();
  if (!Array.isArray(body)) {
    throw new Error('Invalid klines response: not an array');
  }

  return body
    .filter((k: unknown) => Array.isArray(k) && k.length >= 6)
    .map((k: unknown[]) => {
      const time = Number(k[0]);
      const open = parseFloat(String(k[1]));
      const high = parseFloat(String(k[2]));
      const low = parseFloat(String(k[3]));
      const close = parseFloat(String(k[4]));
      const volume = parseFloat(String(k[5]));
      if ([time, open, high, low, close, volume].some(v => !Number.isFinite(v))) {
        return null;
      }
      return { time, open, high, low, close, volume } as Bar;
    })
    .filter((bar): bar is Bar => bar !== null);
}

function generateSimulatedBars(
  from: number,
  to: number,
  resolution: string,
  basePrice: number,
): Bar[] {
  const resolutionMs = getResolutionMs(resolution);
  const bars: Bar[] = [];
  let price = basePrice;
  const startMs = from * 1000;
  const endMs = to * 1000;

  for (let t = startMs; t < endMs; t += resolutionMs) {
    const volatility = 0.02;
    const open = price;
    const change1 = (Math.random() - 0.5) * 2 * volatility * price;
    const change2 = (Math.random() - 0.5) * 2 * volatility * price;
    const change3 = (Math.random() - 0.5) * 2 * volatility * price;
    const high = Math.max(open, open + change1, open + change2, open + change3);
    const low = Math.min(open, open + change1, open + change2, open + change3);
    const close = open + change3;
    const volume = 100 + Math.random() * 900;

    bars.push({ time: t, open, high, low, close, volume });
    price = close;
  }

  return bars;
}

function getResolutionMs(resolution: string): number {
  switch (resolution) {
    case '1': return 60_000;
    case '5': return 5 * 60_000;
    case '15': return 15 * 60_000;
    case '60': return 60 * 60_000;
    case '240': return 4 * 60 * 60_000;
    case '1D': return 24 * 60 * 60_000;
    case '1W': return 7 * 24 * 60 * 60_000;
    default: return 60_000;
  }
}

// ========================================
// Symbol Resolution Helpers
// ========================================

interface MarketInfo {
  baseSymbol: string;
  quoteSymbol: string;
  name: string;
  pricescale: number;
}

function parseSymbolName(symbolName: string): MarketInfo | null {
  // Expected format: "NBTC/NUSDC" or "NETH/NUSDC"
  const parts = symbolName.split('/');
  if (parts.length !== 2) return null;

  const baseSymbol = parts[0];
  const quoteSymbol = parts[1];

  return {
    baseSymbol,
    quoteSymbol,
    name: symbolName,
    pricescale: PRICESCALE_MAP[baseSymbol] || 100,
  };
}

// ========================================
// PadoDatafeed Class
// ========================================

export class PadoDatafeed implements IDatafeedChartApi {
  private subscriptions = new Map<string, ReturnType<typeof setInterval>>();
  private lastBarCache = new Map<string, Bar>();
  private currentPriceGetter: (() => number) | null = null;

  /**
   * @param getCurrentPrice - Optional callback to get current price for real-time updates.
   *                         When provided, uses this for last-bar updates instead of polling Binance.
   */
  constructor(getCurrentPrice?: () => number) {
    if (getCurrentPrice) {
      this.currentPriceGetter = getCurrentPrice;
    }
  }

  // ---- onReady ----
  onReady(callback: OnReadyCallback): void {
    // TradingView requires async callback
    setTimeout(() => {
      const config: DatafeedConfiguration = {
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        exchanges: [
          { value: 'Pado', name: 'Pado DEX', desc: 'Pado Decentralized Exchange' },
        ],
        symbols_types: [
          { name: 'Crypto', value: 'crypto' },
        ],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
      };
      callback(config);
    }, 0);
  }

  // ---- searchSymbols ----
  searchSymbols(
    userInput: string,
    _exchange: string,
    _symbolType: string,
    onResult: SearchSymbolsCallback,
  ): void {
    const markets = [
      { base: 'NBTC', quote: 'NUSDC', desc: 'Nasun BTC / Nasun USDC' },
      { base: 'NETH', quote: 'NUSDC', desc: 'Nasun ETH / Nasun USDC' },
      { base: 'NSOL', quote: 'NUSDC', desc: 'Nasun SOL / Nasun USDC' },
      { base: 'NASUN', quote: 'NUSDC', desc: 'Nasun / Nasun USDC' },
    ];

    const query = userInput.toUpperCase();
    const results = markets
      .filter(m => m.base.includes(query) || m.desc.toUpperCase().includes(query))
      .map(m => ({
        symbol: `${m.base}/${m.quote}`,
        full_name: `Pado:${m.base}/${m.quote}`,
        description: m.desc,
        exchange: 'Pado',
        ticker: `${m.base}/${m.quote}`,
        type: 'crypto',
      }));

    onResult(results);
  }

  // ---- resolveSymbol ----
  resolveSymbol(
    symbolName: string,
    onResolve: ResolveCallback,
    onError: ErrorCallback,
  ): void {
    setTimeout(() => {
      const market = parseSymbolName(symbolName);
      if (!market) {
        onError(`Unknown symbol: ${symbolName}`);
        return;
      }

      const symbolInfo: LibrarySymbolInfo = {
        name: market.name,
        full_name: `Pado:${market.name}`,
        ticker: market.name,
        description: `${market.baseSymbol} / ${market.quoteSymbol}`,
        type: 'crypto',
        session: '24x7',
        exchange: 'Pado',
        listed_exchange: 'Pado',
        timezone: 'Etc/UTC',
        format: 'price',
        pricescale: market.pricescale,
        minmov: 1,
        has_intraday: true,
        has_weekly_and_monthly: true,
        has_daily: true,
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        volume_precision: 2,
        data_status: 'streaming',
      };

      onResolve(symbolInfo);
    }, 0);
  }

  // ---- getBars ----
  getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: ErrorCallback,
  ): void {
    const market = parseSymbolName(symbolInfo.name);
    if (!market) {
      onError(`Cannot parse symbol: ${symbolInfo.name}`);
      return;
    }

    const binanceSymbol = BINANCE_SYMBOL_MAP[market.baseSymbol];
    const binanceInterval = RESOLUTION_TO_BINANCE[resolution];

    if (!binanceInterval) {
      onError(`Unsupported resolution: ${resolution}`);
      return;
    }

    const { from, to, countBack } = periodParams;

    if (binanceSymbol) {
      // Fetch real data from Binance
      fetchBinanceKlines(binanceSymbol, binanceInterval, from, to, countBack)
        .then((bars) => {
          if (bars.length === 0) {
            onResult([], { noData: true });
            return;
          }

          // Cache last bar for real-time updates
          const lastBar = bars[bars.length - 1];
          this.lastBarCache.set(this.getSubscriptionKey(symbolInfo.name, resolution), lastBar);

          onResult(bars, { noData: false });
        })
        .catch((err) => {
          console.warn('[PadoDatafeed] Binance fetch failed, using simulated data:', err);
          const basePrice = FALLBACK_PRICES[market.baseSymbol] ?? 100;
          const bars = generateSimulatedBars(from, to, resolution, basePrice);
          onResult(bars, { noData: bars.length === 0 });
        });
    } else {
      // Generate simulated data for unsupported tokens
      const basePrice = FALLBACK_PRICES[market.baseSymbol] ?? 100;
      const bars = generateSimulatedBars(from, to, resolution, basePrice);

      if (bars.length > 0) {
        const lastBar = bars[bars.length - 1];
        this.lastBarCache.set(this.getSubscriptionKey(symbolInfo.name, resolution), lastBar);
      }

      onResult(bars, { noData: bars.length === 0 });
    }
  }

  // ---- subscribeBars ----
  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
    _onResetCacheNeededCallback: () => void, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): void {
    const market = parseSymbolName(symbolInfo.name);
    if (!market) return;

    const subKey = this.getSubscriptionKey(symbolInfo.name, resolution);
    const binanceSymbol = BINANCE_SYMBOL_MAP[market.baseSymbol];
    const binanceInterval = RESOLUTION_TO_BINANCE[resolution];
    const resolutionMs = getResolutionMs(resolution);

    // Clear any existing subscription for this guid
    this.unsubscribeBars(listenerGuid);

    let consecutiveFailures = 0;
    let lastFailureTime = 0;

    const timer = setInterval(async () => {
      try {
        // Exponential backoff: skip cycles when in backoff window
        if (consecutiveFailures > 0) {
          const backoffMs = Math.min(
            POLL_INTERVAL_MS * Math.pow(2, consecutiveFailures),
            10 * 60 * 1000, // Max 10 minutes
          );
          if (Date.now() - lastFailureTime < backoffMs) return;
        }

        const lastBar = this.lastBarCache.get(subKey);
        if (!lastBar) return;

        const now = Date.now();
        const currentBarTime = Math.floor(now / resolutionMs) * resolutionMs;

        if (binanceSymbol && binanceInterval) {
          // Fetch latest candle from Binance
          const bars = await fetchBinanceKlines(
            binanceSymbol,
            binanceInterval,
            Math.floor((now - resolutionMs * 2) / 1000),
            Math.floor(now / 1000),
            2,
          );

          consecutiveFailures = 0; // Reset on success

          if (bars.length > 0) {
            const latestBar = bars[bars.length - 1];
            this.lastBarCache.set(subKey, latestBar);
            onTick(latestBar);
          }
        } else if (this.currentPriceGetter) {
          // Use current price callback for real-time update
          const price = this.currentPriceGetter();
          if (price <= 0) return;

          let bar: Bar;
          if (lastBar.time >= currentBarTime) {
            // Update existing bar
            bar = {
              ...lastBar,
              high: Math.max(lastBar.high, price),
              low: Math.min(lastBar.low, price),
              close: price,
              volume: (lastBar.volume || 0) + Math.random() * 10,
            };
          } else {
            // New bar
            bar = {
              time: currentBarTime,
              open: price,
              high: price,
              low: price,
              close: price,
              volume: Math.random() * 100,
            };
          }

          this.lastBarCache.set(subKey, bar);
          onTick(bar);
        } else {
          // Simulated tick for tokens without external data
          const volatility = 0.001;
          const prevClose = lastBar.close;
          const newPrice = prevClose + (Math.random() - 0.5) * 2 * volatility * prevClose;

          let bar: Bar;
          if (lastBar.time >= currentBarTime) {
            bar = {
              ...lastBar,
              high: Math.max(lastBar.high, newPrice),
              low: Math.min(lastBar.low, newPrice),
              close: newPrice,
              volume: (lastBar.volume || 0) + Math.random() * 10,
            };
          } else {
            bar = {
              time: currentBarTime,
              open: prevClose,
              high: Math.max(prevClose, newPrice),
              low: Math.min(prevClose, newPrice),
              close: newPrice,
              volume: Math.random() * 100,
            };
          }

          this.lastBarCache.set(subKey, bar);
          onTick(bar);
        }
      } catch (err) {
        consecutiveFailures = Math.min(consecutiveFailures + 1, MAX_CONSECUTIVE_FAILURES);
        lastFailureTime = Date.now();
        console.warn(`[PadoDatafeed] subscribeBars tick error (failures: ${consecutiveFailures}):`, err);
      }
    }, POLL_INTERVAL_MS);

    this.subscriptions.set(listenerGuid, timer);
  }

  // ---- unsubscribeBars ----
  unsubscribeBars(listenerGuid: string): void {
    const timer = this.subscriptions.get(listenerGuid);
    if (timer) {
      clearInterval(timer);
      this.subscriptions.delete(listenerGuid);
    }
  }

  // ---- Cleanup ----
  destroy(): void {
    for (const timer of this.subscriptions.values()) {
      clearInterval(timer);
    }
    this.subscriptions.clear();
    this.lastBarCache.clear();
  }

  private getSubscriptionKey(symbolName: string, resolution: string): string {
    return `${symbolName}_${resolution}`;
  }
}
