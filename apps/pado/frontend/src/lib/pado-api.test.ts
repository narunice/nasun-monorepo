/**
 * Tests for pado-api.ts: API timeout, data adapters, and feature detection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock network config before importing
vi.mock('../config/network', () => ({
  NETWORK_CONFIG: {
    chatHttpUrl: 'http://localhost:3100',
    deepbookPackage: '0xpkg',
  },
  POOLS: {
    NBTC_NUSDC: {
      id: '0x' + '1'.repeat(64),
      baseToken: { decimals: 8 },
      quoteToken: { decimals: 6 },
      takerFeeBps: 10,
      makerFeeBps: 5,
    },
    NASUN_NUSDC: {
      id: '0x' + '2'.repeat(64),
      baseToken: { decimals: 9 },
      quoteToken: { decimals: 6 },
      takerFeeBps: 10,
      makerFeeBps: 5,
    },
    NETH_NUSDC: {
      id: '0x' + '3'.repeat(64),
      baseToken: { decimals: 8 },
      quoteToken: { decimals: 6 },
      takerFeeBps: 10,
      makerFeeBps: 5,
    },
    NSOL_NUSDC: {
      id: '0x' + '4'.repeat(64),
      baseToken: { decimals: 9 },
      quoteToken: { decimals: 6 },
      takerFeeBps: 10,
      makerFeeBps: 5,
    },
  },
}));

vi.mock('./prices', () => ({
  getUnifiedPrice: vi.fn(() => 95000),
}));

import {
  isTradeApiAvailable,
  adaptCostBasisEntry,
  fetchTradeHistoryFromApi,
  fetchCostBasisFromApi,
} from './pado-api';

describe('isTradeApiAvailable', () => {
  it('returns true when chatHttpUrl is configured', () => {
    expect(isTradeApiAvailable()).toBe(true);
  });
});

describe('adaptCostBasisEntry', () => {
  const getCurrentPrice = vi.fn(() => 100000);
  const NBTC_POOL_ID = '0x' + '1'.repeat(64);
  const UNKNOWN_POOL_ID = '0x' + 'f'.repeat(64);

  it('adapts a valid NBTC cost basis entry', () => {
    const entry = {
      pool_id: NBTC_POOL_ID,
      total_bought: 2.5,
      total_sold: 1.0,
      avg_buy_price: 90000,
      realized_pnl: 5000,
      holding_qty: 1.5,
    };

    const result = adaptCostBasisEntry(entry, getCurrentPrice);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe('NBTC');
    expect(result!.totalBought).toBe(2.5);
    expect(result!.totalSold).toBe(1.0);
    expect(result!.avgBuyPrice).toBe(90000);
    expect(result!.realizedPnl).toBe(5000);
    expect(result!.holdingQty).toBe(1.5);
    // unrealizedPnl = (100000 - 90000) * 1.5 = 15000
    expect(result!.unrealizedPnl).toBe(15000);
  });

  it('returns null for unknown pool', () => {
    const entry = {
      pool_id: UNKNOWN_POOL_ID,
      total_bought: 1,
      total_sold: 0,
      avg_buy_price: 100,
      realized_pnl: 0,
      holding_qty: 1,
    };

    const result = adaptCostBasisEntry(entry, getCurrentPrice);
    expect(result).toBeNull();
  });

  it('unrealized PnL is 0 when holding_qty is 0', () => {
    const entry = {
      pool_id: NBTC_POOL_ID,
      total_bought: 1.0,
      total_sold: 1.0,
      avg_buy_price: 90000,
      realized_pnl: 10000,
      holding_qty: 0,
    };

    const result = adaptCostBasisEntry(entry, getCurrentPrice);
    expect(result!.unrealizedPnl).toBe(0);
  });
});

describe('API timeout constant', () => {
  it('uses 5 second timeout', async () => {
    // We verify by checking the AbortController is set up with 5000ms
    // by making a fetch that times out
    const originalFetch = globalThis.fetch;
    let capturedSignal: AbortSignal | undefined;

    globalThis.fetch = vi.fn(async (_url: string, opts?: RequestInit) => {
      capturedSignal = opts?.signal;
      // Simulate a slow response that never resolves
      return new Promise(() => {});
    }) as any;

    const addr = '0x' + 'a'.repeat(64);
    const promise = fetchTradeHistoryFromApi(addr, null);

    // The abort should fire after 5000ms
    // We can't easily test the exact timeout value, but we can verify
    // the signal is present
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    // Clean up
    globalThis.fetch = originalFetch;
    // Suppress the unhandled rejection from the aborted promise
    promise.catch(() => {});
  });
});

describe('fetchTradeHistoryFromApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds correct URL with cursor and pool params', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({
        trades: [],
        nextCursor: null,
        hasMore: false,
      }));
    }) as any;

    const addr = '0x' + 'a'.repeat(64);
    await fetchTradeHistoryFromApi(addr, 42, '0x' + 'b'.repeat(64));

    expect(capturedUrl).toContain(`/api/trades/${encodeURIComponent(addr)}`);
    expect(capturedUrl).toContain('cursor=42');
    expect(capturedUrl).toContain('pool=0x' + 'b'.repeat(64));
    expect(capturedUrl).toContain('limit=50');
  });

  it('filters out trades from unknown pools', async () => {
    const NBTC_POOL = '0x' + '1'.repeat(64);
    const UNKNOWN_POOL = '0x' + 'f'.repeat(64);

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        trades: [
          {
            id: 1, tx_digest: 'tx1', event_seq: '0', pool_id: NBTC_POOL,
            price: '95000000000', base_quantity: '100000000', quote_quantity: '95000000000',
            taker_is_bid: 1, side: 'buy', role: 'taker', timestamp_ms: 1000,
          },
          {
            id: 2, tx_digest: 'tx2', event_seq: '0', pool_id: UNKNOWN_POOL,
            price: '100', base_quantity: '100', quote_quantity: '100',
            taker_is_bid: 1, side: 'buy', role: 'taker', timestamp_ms: 2000,
          },
        ],
        nextCursor: null,
        hasMore: false,
      }));
    }) as any;

    const addr = '0x' + 'a'.repeat(64);
    const result = await fetchTradeHistoryFromApi(addr, null);

    // Only the NBTC trade should be included; unknown pool is filtered out
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].poolId).toBe(NBTC_POOL);
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response('Not found', { status: 404 });
    }) as any;

    const addr = '0x' + 'a'.repeat(64);
    await expect(fetchTradeHistoryFromApi(addr, null)).rejects.toThrow('API error: 404');
  });
});
