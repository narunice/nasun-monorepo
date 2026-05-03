/**
 * Stock daily-close price fetcher for prediction market resolution.
 *
 * Two upstreams:
 *   - Twelve Data (primary): documented free tier (800/day), API key required.
 *   - Yahoo Finance v8 chart (fallback): unofficial, key-less, Cloudflare-prone.
 *
 * Resolution discipline:
 *   - Only `daily close` is accepted. We never read `regularMarketPrice` or any
 *     intraday tick that might reflect pre-market / after-hours noise.
 *   - The candle's session date (YYYY-MM-DD in the exchange local timezone)
 *     must equal the criteria's reading-time session date, otherwise we throw.
 *   - The fetch must run after the session has closed. If both upstreams agree
 *     within 5 % we accept the primary value; otherwise we throw `PriceFetchError`
 *     so the keeper can defer to a later tick (and a human can intervene).
 *
 * Currency check: the API-reported currency must match the criteria's
 * declared currency. A KRX ticker that suddenly returns USD (ADR remap, Yahoo
 * format change) is rejected, not silently mis-resolved.
 */

import type { ResolutionCriteria } from './prediction-criteria.js';
import { localDateString, sessionCloseUtc, type Market } from './market-holidays.js';

const HTTP_TIMEOUT_MS = 8_000;
const PRICE_AGREEMENT_TOLERANCE = 0.05; // 5%

/**
 * Transient upstream failure (HTTP error, missing candle, session not yet
 * finalized). The keeper retries on the next tick; should not escalate.
 */
export class PriceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceFetchError';
  }
}

/**
 * Non-transient resolution-integrity failure (currency mismatch, cross-source
 * disagreement). Retrying will not help; the keeper must escalate so an
 * operator inspects before the resolve_deadline elapses.
 */
export class PriceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceIntegrityError';
  }
}

export interface StockQuote {
  price: number;
  currency: string;
  /** UTC ms of the candle's session close. */
  asOf: number;
}

/**
 * Inferred from the criteria: KR tickers (".KS", ".KQ" suffix) trade on KRX,
 * everything else assumed NYSE/NASDAQ. KRX-only suffixes for the v1 set.
 */
export function inferMarket(symbol: string): Market {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return 'KRX';
  return 'NYSE';
}

interface FetchJsonOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

async function fetchJson<T>(url: string, opts: FetchJsonOpts = {}): Promise<T> {
  const { timeoutMs = HTTP_TIMEOUT_MS, headers } = opts;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json', ...headers },
  });
  if (!response.ok) {
    throw new PriceFetchError(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return (await response.json()) as T;
}

// ========================================
// Twelve Data
// ========================================

interface TwelveDataResponse {
  status?: string;
  code?: number;
  message?: string;
  meta?: { currency?: string; symbol?: string; interval?: string };
  values?: Array<{ datetime: string; close: string }>;
}

/**
 * Fetch the daily close for `symbol` on the trading session that ends at
 * `sessionDateLocal` (YYYY-MM-DD in the exchange-local timezone).
 *
 * Twelve Data's `time_series` interval=1day endpoint returns rows keyed by
 * the session date (no time component for daily candles). We request a
 * 5-row window and pick the row whose datetime exactly equals our target.
 */
export async function fetchTwelveDataDailyClose(
  symbol: string,
  sessionDateLocal: string,
  apiKey: string,
): Promise<StockQuote> {
  if (!apiKey) {
    throw new PriceFetchError('TWELVEDATA_API_KEY is not set');
  }
  // Pass the key via header instead of `?apikey=...` so HTTP-error messages
  // (which include the request URL) cannot leak the key into pm2/CloudWatch.
  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${encodeURIComponent(symbol)}` +
    `&interval=1day&outputsize=5`;
  const data = await fetchJson<TwelveDataResponse>(url, {
    headers: { Authorization: `apikey ${apiKey}` },
  });

  if (data.status === 'error') {
    throw new PriceFetchError(`Twelve Data error: ${data.message ?? 'unknown'}`);
  }
  if (!data.values || data.values.length === 0) {
    throw new PriceFetchError(`Twelve Data returned no values for ${symbol}`);
  }

  const row = data.values.find((v) => v.datetime === sessionDateLocal);
  if (!row) {
    throw new PriceFetchError(
      `Twelve Data: no candle for ${symbol} on session ${sessionDateLocal} (got ${data.values.map((v) => v.datetime).join(',')})`,
    );
  }

  const price = parseFloat(row.close);
  if (!Number.isFinite(price) || price <= 0) {
    throw new PriceFetchError(`Twelve Data: invalid close ${row.close} for ${symbol}`);
  }
  const currency = (data.meta?.currency || '').toUpperCase();
  if (!currency) {
    throw new PriceFetchError(`Twelve Data: missing currency in meta for ${symbol}`);
  }

  return { price, currency, asOf: sessionCloseUtcForSymbol(symbol, sessionDateLocal) };
}

function sessionCloseUtcForSymbol(symbol: string, sessionDateLocal: string): number {
  const market: Market = inferMarket(symbol);
  // Construct a Date that falls on `sessionDateLocal` in the exchange tz.
  // Anchoring to noon UTC sidesteps any tz-rollover edge case for the date
  // label; sessionCloseUtc only reads the local date from this Date.
  return sessionCloseUtc(market, new Date(`${sessionDateLocal}T12:00:00Z`));
}

// ========================================
// Yahoo Finance v8 chart
// ========================================

interface YahooChartResponse {
  chart: {
    error: { code?: string; description?: string } | null;
    result: Array<{
      meta: { currency?: string; symbol?: string; gmtoffset?: number };
      timestamp: number[];
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }> | null;
  };
}

/**
 * Yahoo daily chart returns one timestamp + close pair per session. The
 * timestamp is the session OPEN (UTC seconds). We map each to YYYY-MM-DD in
 * the exchange-local timezone and match against `sessionDateLocal`.
 */
export async function fetchYahooDailyClose(
  symbol: string,
  sessionDateLocal: string,
  market: Market,
): Promise<StockQuote> {
  // Pull a 10-day window so we always have enough rows even after a long
  // weekend / multi-day holiday closure.
  const now = Math.floor(Date.now() / 1000);
  const tenDaysAgo = now - 10 * 24 * 60 * 60;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&period1=${tenDaysAgo}&period2=${now + 86400}`;
  const data = await fetchJson<YahooChartResponse>(url, {
    headers: {
      // Yahoo's edge serves stripped responses to default UAs from datacenters;
      // a browser-like UA gets the full chart payload. Still unofficial.
      'User-Agent': 'Mozilla/5.0 (compatible; nasun-pado-keeper/1.0)',
    },
  });

  if (data.chart.error || !data.chart.result || data.chart.result.length === 0) {
    throw new PriceFetchError(
      `Yahoo error: ${data.chart.error?.description ?? 'no result'} for ${symbol}`,
    );
  }
  const result = data.chart.result[0];
  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  if (timestamps.length === 0 || closes.length !== timestamps.length) {
    throw new PriceFetchError(`Yahoo: malformed chart series for ${symbol}`);
  }

  let pickedIndex = -1;
  for (let i = 0; i < timestamps.length; i++) {
    const candleDate = localDateString(market, new Date(timestamps[i] * 1000));
    if (candleDate === sessionDateLocal) {
      pickedIndex = i;
      break;
    }
  }
  if (pickedIndex < 0) {
    throw new PriceFetchError(
      `Yahoo: no candle for ${symbol} on session ${sessionDateLocal}`,
    );
  }
  const close = closes[pickedIndex];
  if (close == null || !Number.isFinite(close) || close <= 0) {
    throw new PriceFetchError(`Yahoo: invalid close ${close} for ${symbol}`);
  }
  const currency = (result.meta.currency || '').toUpperCase();
  if (!currency) {
    throw new PriceFetchError(`Yahoo: missing currency for ${symbol}`);
  }

  return { price: close, currency, asOf: sessionCloseUtcForSymbol(symbol, sessionDateLocal) };
}

// ========================================
// Combined fetch with cross-source agreement
// ========================================

/**
 * Fetch a stock daily close honoring the criteria's source preference.
 *
 * Strategy:
 *   1. Determine the primary upstream from criteria.sourceHost.
 *   2. Fetch from primary. If it succeeds, also fetch from the alternate
 *      upstream as a cross-check (best-effort: alternate failure does not
 *      abort).
 *   3. Validate currency match against criteria.currency.
 *   4. Validate cross-source agreement within PRICE_AGREEMENT_TOLERANCE.
 */
export async function fetchStockDailyClose(
  criteria: ResolutionCriteria,
  sessionDateLocal: string,
  env: { TWELVEDATA_API_KEY?: string } = process.env,
): Promise<StockQuote> {
  if (criteria.kind !== 'stock') {
    throw new PriceFetchError(`fetchStockDailyClose called with non-stock criteria`);
  }
  if (!criteria.currency) {
    throw new PriceFetchError(`stock criteria missing currency`);
  }
  const market = inferMarket(criteria.symbol);
  const apiKey = env.TWELVEDATA_API_KEY ?? '';

  const useTwelveDataFirst = criteria.sourceHost === 'api.twelvedata.com';

  // Primary fetch.
  const primary = useTwelveDataFirst
    ? await fetchTwelveDataDailyClose(criteria.symbol, sessionDateLocal, apiKey)
    : await fetchYahooDailyClose(criteria.symbol, sessionDateLocal, market);

  if (primary.currency !== criteria.currency) {
    throw new PriceIntegrityError(
      `currency mismatch on primary: criteria=${criteria.currency} api=${primary.currency} symbol=${criteria.symbol}`,
    );
  }

  // Best-effort cross-check.
  let cross: StockQuote | null = null;
  try {
    cross = useTwelveDataFirst
      ? await fetchYahooDailyClose(criteria.symbol, sessionDateLocal, market)
      : apiKey
        ? await fetchTwelveDataDailyClose(criteria.symbol, sessionDateLocal, apiKey)
        : null;
  } catch (err) {
    // Cross-check failures are advisory only; primary is authoritative when
    // alternate source is unavailable. We log but do not abort.
    console.warn(`[stock-price] cross-check failed for ${criteria.symbol}: ${err instanceof Error ? err.message : err}`);
  }

  if (cross) {
    if (cross.currency !== criteria.currency) {
      throw new PriceIntegrityError(
        `currency mismatch on cross-check: criteria=${criteria.currency} api=${cross.currency} symbol=${criteria.symbol}`,
      );
    }
    const diff = Math.abs(cross.price - primary.price) / primary.price;
    if (diff > PRICE_AGREEMENT_TOLERANCE) {
      throw new PriceIntegrityError(
        `price disagreement >${(PRICE_AGREEMENT_TOLERANCE * 100).toFixed(0)}%: primary=${primary.price} cross=${cross.price} symbol=${criteria.symbol}`,
      );
    }
  }

  return primary;
}
