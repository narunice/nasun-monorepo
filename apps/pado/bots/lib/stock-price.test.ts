/**
 * Tests for stock-price daily-close fetcher.
 *
 * Mocks global fetch so we do not hit Twelve Data / Yahoo on every test run.
 * Focus: contract enforcement (currency, candle-date match, cross-source
 * agreement) — these are the invariants that protect against mis-resolve.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchStockDailyClose,
  fetchTwelveDataDailyClose,
  fetchYahooDailyClose,
  inferMarket,
  PriceFetchError,
  PriceIntegrityError,
} from './stock-price.js';
import type { ResolutionCriteria } from './prediction-criteria.js';

const TWELVE_KEY = 'test-key';

function makeStockCriteria(overrides: Partial<ResolutionCriteria> = {}): ResolutionCriteria {
  return {
    kind: 'stock',
    source: 'https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day',
    sourceHost: 'api.twelvedata.com',
    symbol: 'AAPL',
    currency: 'USD',
    comparison: '>',
    threshold: 250,
    tieBreak: 'NO',
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('inferMarket', () => {
  it('US tickers -> NYSE', () => {
    expect(inferMarket('AAPL')).toBe('NYSE');
    expect(inferMarket('NVDA')).toBe('NYSE');
  });
  it('KR tickers (.KS / .KQ) -> KRX', () => {
    expect(inferMarket('005930.KS')).toBe('KRX');
    expect(inferMarket('068760.KQ')).toBe('KRX');
  });
});

describe('fetchTwelveDataDailyClose', () => {
  it('returns close + currency for matching session date', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      meta: { currency: 'USD', symbol: 'AAPL', interval: '1day' },
      values: [
        { datetime: '2026-06-30', close: '255.42' },
        { datetime: '2026-06-29', close: '253.10' },
      ],
    }));
    const q = await fetchTwelveDataDailyClose('AAPL', '2026-06-30', TWELVE_KEY);
    expect(q.price).toBe(255.42);
    expect(q.currency).toBe('USD');
  });

  it('passes apikey via Authorization header (not query string) so HTTP errors do not leak it', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, { status: 500, statusText: 'Server Error' }));
    await expect(fetchTwelveDataDailyClose('AAPL', '2026-06-30', TWELVE_KEY))
      .rejects.toThrow(/HTTP 500/);
    const callArg0 = fetchSpy.mock.calls[0][0] as string;
    const callArg1 = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(callArg0).not.toContain('apikey=');
    expect(callArg0).not.toContain(TWELVE_KEY);
    expect((callArg1.headers as Record<string, string>).Authorization).toBe(`apikey ${TWELVE_KEY}`);
  });

  it('throws when API returns error status', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      status: 'error',
      code: 401,
      message: 'invalid api key',
    }));
    await expect(fetchTwelveDataDailyClose('AAPL', '2026-06-30', TWELVE_KEY))
      .rejects.toThrow(/invalid api key/);
  });

  it('throws when no candle for the requested session date', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      meta: { currency: 'USD' },
      values: [{ datetime: '2026-06-29', close: '253.10' }],
    }));
    await expect(fetchTwelveDataDailyClose('AAPL', '2026-06-30', TWELVE_KEY))
      .rejects.toThrow(/no candle/);
  });

  it('throws when API key is missing', async () => {
    await expect(fetchTwelveDataDailyClose('AAPL', '2026-06-30', ''))
      .rejects.toThrow(/TWELVEDATA_API_KEY/);
  });

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, { status: 500, statusText: 'Server Error' }));
    await expect(fetchTwelveDataDailyClose('AAPL', '2026-06-30', TWELVE_KEY))
      .rejects.toThrow(/HTTP 500/);
  });
});

describe('fetchYahooDailyClose', () => {
  it('picks the close whose timestamp falls on the requested local session', async () => {
    // 2026-06-30 16:00 ET -> 2026-06-30T20:00Z (DST). The candle "open" is
    // typically 09:30 ET = 13:30 UTC. We supply both 06-29 and 06-30 candles.
    const ts0630 = Math.floor(Date.UTC(2026, 5, 30, 13, 30, 0) / 1000);
    const ts0629 = ts0630 - 86400;
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      chart: {
        error: null,
        result: [{
          meta: { currency: 'USD', symbol: 'AAPL' },
          timestamp: [ts0629, ts0630],
          indicators: { quote: [{ close: [253.1, 255.42] }] },
        }],
      },
    }));
    const q = await fetchYahooDailyClose('AAPL', '2026-06-30', 'NYSE');
    expect(q.price).toBe(255.42);
    expect(q.currency).toBe('USD');
  });

  it('throws when no candle matches the session date', async () => {
    const ts0629 = Math.floor(Date.UTC(2026, 5, 29, 13, 30, 0) / 1000);
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      chart: {
        error: null,
        result: [{
          meta: { currency: 'USD', symbol: 'AAPL' },
          timestamp: [ts0629],
          indicators: { quote: [{ close: [253.1] }] },
        }],
      },
    }));
    await expect(fetchYahooDailyClose('AAPL', '2026-06-30', 'NYSE'))
      .rejects.toThrow(/no candle/);
  });

  it('throws on Yahoo API error envelope', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      chart: { error: { code: 'Not Found', description: 'no data' }, result: null },
    }));
    await expect(fetchYahooDailyClose('XYZ', '2026-06-30', 'NYSE'))
      .rejects.toThrow(/no data/);
  });
});

describe('fetchStockDailyClose (combined)', () => {
  it('accepts when primary + cross agree within tolerance', async () => {
    const ts0630 = Math.floor(Date.UTC(2026, 5, 30, 13, 30, 0) / 1000);
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({
        meta: { currency: 'USD' },
        values: [{ datetime: '2026-06-30', close: '255.42' }],
      })) // primary: Twelve Data
      .mockResolvedValueOnce(jsonResponse({
        chart: { error: null, result: [{
          meta: { currency: 'USD' },
          timestamp: [ts0630],
          indicators: { quote: [{ close: [255.40] }] },
        }] },
      })); // cross: Yahoo
    const q = await fetchStockDailyClose(makeStockCriteria(), '2026-06-30', { TWELVEDATA_API_KEY: TWELVE_KEY });
    expect(q.price).toBe(255.42); // primary wins
  });

  it('throws PriceIntegrityError on currency mismatch from primary', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({
      meta: { currency: 'EUR' },
      values: [{ datetime: '2026-06-30', close: '255.42' }],
    }));
    await expect(fetchStockDailyClose(makeStockCriteria(), '2026-06-30', { TWELVEDATA_API_KEY: TWELVE_KEY }))
      .rejects.toThrow(PriceIntegrityError);
  });

  it('throws PriceIntegrityError when primary + cross disagree by more than 5%', async () => {
    const ts0630 = Math.floor(Date.UTC(2026, 5, 30, 13, 30, 0) / 1000);
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({
        meta: { currency: 'USD' },
        values: [{ datetime: '2026-06-30', close: '255.42' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        chart: { error: null, result: [{
          meta: { currency: 'USD' },
          timestamp: [ts0630],
          indicators: { quote: [{ close: [200.00] }] }, // 22% off
        }] },
      }));
    await expect(fetchStockDailyClose(makeStockCriteria(), '2026-06-30', { TWELVEDATA_API_KEY: TWELVE_KEY }))
      .rejects.toThrow(PriceIntegrityError);
  });

  it('accepts when cross-check fails (advisory only)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({
        meta: { currency: 'USD' },
        values: [{ datetime: '2026-06-30', close: '255.42' }],
      }))
      .mockResolvedValueOnce(jsonResponse(
        { chart: { error: { description: 'rate-limited' }, result: null } },
        { status: 429, statusText: 'Too Many Requests' },
      ));
    // Yahoo cross-check 429 -> warning only, primary value returned.
    const q = await fetchStockDailyClose(makeStockCriteria(), '2026-06-30', { TWELVEDATA_API_KEY: TWELVE_KEY });
    expect(q.price).toBe(255.42);
  });

  it('uses Yahoo as primary when criteria.sourceHost is yahoo', async () => {
    const ts0630 = Math.floor(Date.UTC(2026, 5, 30, 13, 30, 0) / 1000);
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({
        chart: { error: null, result: [{
          meta: { currency: 'USD' },
          timestamp: [ts0630],
          indicators: { quote: [{ close: [255.42] }] },
        }] },
      }))
      .mockResolvedValueOnce(jsonResponse({
        meta: { currency: 'USD' },
        values: [{ datetime: '2026-06-30', close: '255.40' }],
      }));
    const criteria = makeStockCriteria({
      source: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL',
      sourceHost: 'query1.finance.yahoo.com',
    });
    const q = await fetchStockDailyClose(criteria, '2026-06-30', { TWELVEDATA_API_KEY: TWELVE_KEY });
    expect(q.price).toBe(255.42);
  });

  it('throws PriceFetchError when called on non-stock criteria', async () => {
    const cryptoCriteria: ResolutionCriteria = {
      kind: 'crypto',
      source: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
      sourceHost: 'api.binance.com',
      symbol: 'BTCUSDT',
      comparison: '>=',
      threshold: 100000,
      tieBreak: 'NO',
    };
    await expect(fetchStockDailyClose(cryptoCriteria, '2026-06-30', {}))
      .rejects.toThrow(PriceFetchError);
  });
});
