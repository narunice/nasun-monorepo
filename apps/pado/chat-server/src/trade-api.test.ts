/**
 * E2E tests for Trade API: getTraderFillsByAddress, computeCostBasis,
 * and the HTTP endpoint side/role enrichment logic.
 *
 * Uses a real SQLite DB (temp file) to test actual query behavior.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initLeaderboardStore,
  closeLeaderboardStore,
  getLeaderboardDb,
  getTraderFillsByAddress,
  computeCostBasis,
} from './leaderboard-store.js';

// ===== Test Fixtures =====

const ALICE = '0x' + 'a'.repeat(64);
const BOB = '0x' + 'b'.repeat(64);
const CAROL = '0x' + 'c'.repeat(64);
const POOL_NBTC = '0x' + '1'.repeat(64);
const POOL_NASUN = '0x' + '2'.repeat(64);
const POOL_UNKNOWN = '0x' + 'f'.repeat(64);

function insertFill(overrides: Partial<{
  tx_digest: string;
  event_seq: string;
  pool_id: string;
  maker_address: string;
  taker_address: string;
  price: string;
  base_quantity: string;
  quote_quantity: string;
  taker_is_bid: number;
  timestamp_ms: number;
}> = {}): number {
  const db = getLeaderboardDb();
  const stmt = db.prepare(`
    INSERT INTO trade_fills
      (tx_digest, event_seq, pool_id, maker_address, taker_address,
       price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    overrides.tx_digest ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    overrides.event_seq ?? '0',
    overrides.pool_id ?? POOL_NBTC,
    overrides.maker_address ?? ALICE,
    overrides.taker_address ?? BOB,
    overrides.price ?? '95000000000',    // 95000 NUSDC (6 decimals)
    overrides.base_quantity ?? '100000000', // 1.0 NBTC (8 decimals)
    overrides.quote_quantity ?? '95000000000',
    overrides.taker_is_bid ?? 1,
    overrides.timestamp_ms ?? Date.now(),
  );
  return Number(result.lastInsertRowid);
}

// ===== Lifecycle =====

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pado-test-'));
  initLeaderboardStore({ leaderboardDbPath: join(tmpDir, 'test.db') });
});

afterAll(() => {
  closeLeaderboardStore();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ===== getTraderFillsByAddress Tests =====

describe('getTraderFillsByAddress', () => {
  it('returns empty for unknown address', () => {
    const { fills, nextCursor, hasMore } = getTraderFillsByAddress(CAROL);
    expect(fills).toHaveLength(0);
    expect(nextCursor).toBeNull();
    expect(hasMore).toBe(false);
  });

  it('returns fills where address is maker', () => {
    // Alice is maker, Bob is taker
    insertFill({ maker_address: ALICE, taker_address: BOB, tx_digest: 'tx_maker_1' });

    const { fills } = getTraderFillsByAddress(ALICE);
    expect(fills.some((f) => f.tx_digest === 'tx_maker_1')).toBe(true);
  });

  it('returns fills where address is taker', () => {
    insertFill({ maker_address: ALICE, taker_address: BOB, tx_digest: 'tx_taker_1' });

    const { fills } = getTraderFillsByAddress(BOB);
    expect(fills.some((f) => f.tx_digest === 'tx_taker_1')).toBe(true);
  });

  it('does not return fills for unrelated address', () => {
    insertFill({ maker_address: ALICE, taker_address: BOB, tx_digest: 'tx_unrelated' });

    const { fills } = getTraderFillsByAddress(CAROL);
    expect(fills.some((f) => f.tx_digest === 'tx_unrelated')).toBe(false);
  });

  it('deduplicates rows where address is both maker and taker (self-trade)', () => {
    insertFill({ maker_address: ALICE, taker_address: ALICE, tx_digest: 'tx_self_1' });

    const { fills } = getTraderFillsByAddress(ALICE);
    const selfTrades = fills.filter((f) => f.tx_digest === 'tx_self_1');
    // UNION deduplicates, so only 1 row
    expect(selfTrades).toHaveLength(1);
  });

  it('filters by pool', () => {
    insertFill({ maker_address: CAROL, taker_address: BOB, pool_id: POOL_NBTC, tx_digest: 'tx_pool_nbtc' });
    insertFill({ maker_address: CAROL, taker_address: BOB, pool_id: POOL_NASUN, tx_digest: 'tx_pool_nasun' });

    const { fills } = getTraderFillsByAddress(CAROL, { pool: POOL_NBTC });
    expect(fills.every((f) => f.pool_id === POOL_NBTC)).toBe(true);
    expect(fills.some((f) => f.tx_digest === 'tx_pool_nbtc')).toBe(true);
    expect(fills.some((f) => f.tx_digest === 'tx_pool_nasun')).toBe(false);
  });

  it('respects limit parameter', () => {
    // Insert 5 fills for CAROL in a specific pool to avoid collision with earlier tests
    for (let i = 0; i < 5; i++) {
      insertFill({ maker_address: CAROL, taker_address: BOB, pool_id: POOL_UNKNOWN, tx_digest: `tx_limit_${i}` });
    }

    const { fills, hasMore } = getTraderFillsByAddress(CAROL, { pool: POOL_UNKNOWN, limit: 3 });
    expect(fills).toHaveLength(3);
    expect(hasMore).toBe(true);
  });

  it('limits clamp: max 200, min 1', () => {
    // limit > 200 should be clamped to 200
    const { fills: f1 } = getTraderFillsByAddress(CAROL, { pool: POOL_UNKNOWN, limit: 500 });
    expect(f1.length).toBeLessThanOrEqual(200);

    // limit < 1 should be clamped to 1
    const { fills: f2 } = getTraderFillsByAddress(CAROL, { pool: POOL_UNKNOWN, limit: -5 });
    expect(f2.length).toBeLessThanOrEqual(1);
  });

  it('cursor-based pagination returns correct pages', () => {
    const DAVE = '0x' + 'd'.repeat(64);
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(insertFill({ maker_address: DAVE, taker_address: BOB, tx_digest: `tx_cursor_${i}` }));
    }

    // Page 1: first 3
    const page1 = getTraderFillsByAddress(DAVE, { limit: 3 });
    expect(page1.fills).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    // Page 2: next 3 after cursor
    const page2 = getTraderFillsByAddress(DAVE, { limit: 3, cursor: page1.nextCursor! });
    expect(page2.fills).toHaveLength(3);
    expect(page2.hasMore).toBe(true);

    // No overlap between pages
    const page1Ids = new Set(page1.fills.map((f) => f.id));
    const page2Ids = new Set(page2.fills.map((f) => f.id));
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }

    // Page 2 IDs should all be smaller than page 1 IDs (DESC order)
    const minPage1Id = Math.min(...page1.fills.map((f) => f.id));
    const maxPage2Id = Math.max(...page2.fills.map((f) => f.id));
    expect(maxPage2Id).toBeLessThan(minPage1Id);
  });

  it('returns ordered by id DESC', () => {
    const EVE = '0x' + 'e'.repeat(64);
    for (let i = 0; i < 5; i++) {
      insertFill({ maker_address: EVE, taker_address: BOB, tx_digest: `tx_order_${i}` });
    }

    const { fills } = getTraderFillsByAddress(EVE);
    for (let i = 1; i < fills.length; i++) {
      expect(fills[i].id).toBeLessThan(fills[i - 1].id);
    }
  });

  it('hasMore is false when fewer results than limit', () => {
    const FRED = '0x' + '0f'.repeat(32);
    insertFill({ maker_address: FRED, taker_address: BOB, tx_digest: 'tx_nomore_1' });
    insertFill({ maker_address: FRED, taker_address: BOB, tx_digest: 'tx_nomore_2' });

    const { fills, hasMore, nextCursor } = getTraderFillsByAddress(FRED, { limit: 10 });
    expect(fills).toHaveLength(2);
    expect(hasMore).toBe(false);
    expect(nextCursor).toBeNull();
  });
});

// ===== computeCostBasis Tests =====

describe('computeCostBasis', () => {
  // baseDecimalsFn for test: POOL_NBTC = 8 decimals, POOL_NASUN = 9 decimals
  const baseDecimalsFn = (poolId: string): number => {
    if (poolId === POOL_NBTC) return 8;
    if (poolId === POOL_NASUN) return 9;
    return 9;
  };

  it('returns empty for address with no trades', () => {
    const noTradeAddr = '0x' + '99'.repeat(32);
    const entries = computeCostBasis(noTradeAddr, baseDecimalsFn);
    expect(entries).toHaveLength(0);
  });

  it('calculates cost basis for single buy', () => {
    // Use unique addresses that don't collide with top-level constants
    const BUYER = '0x' + 'ca01'.repeat(16);
    insertFill({
      maker_address: ALICE,
      taker_address: BUYER,
      pool_id: POOL_NBTC,
      price: '95000000000',      // 95000 (/ 10^6 = 95000)
      base_quantity: '100000000', // 1.0 NBTC (/ 10^8 = 1.0)
      taker_is_bid: 1,
      tx_digest: 'tx_cb_buy_1',
    });

    const entries = computeCostBasis(BUYER, baseDecimalsFn);
    const nbtcEntry = entries.find((e) => e.pool_id === POOL_NBTC);
    expect(nbtcEntry).toBeDefined();
    expect(nbtcEntry!.total_bought).toBeCloseTo(1.0, 4);
    expect(nbtcEntry!.total_sold).toBeCloseTo(0, 4);
    expect(nbtcEntry!.avg_buy_price).toBeCloseTo(95000, 0);
    expect(nbtcEntry!.realized_pnl).toBeCloseTo(0, 2);
    expect(nbtcEntry!.holding_qty).toBeCloseTo(1.0, 4);
  });

  it('calculates weighted average for multiple buys', () => {
    const BUYER2 = '0x' + 'ca02'.repeat(16);
    // Buy 1: 1.0 NBTC at 90000
    insertFill({
      maker_address: ALICE,
      taker_address: BUYER2,
      pool_id: POOL_NBTC,
      price: '90000000000',       // 90000
      base_quantity: '100000000', // 1.0
      taker_is_bid: 1,
      tx_digest: 'tx_cb_multi_1',
    });
    // Buy 2: 1.0 NBTC at 100000
    insertFill({
      maker_address: ALICE,
      taker_address: BUYER2,
      pool_id: POOL_NBTC,
      price: '100000000000',      // 100000
      base_quantity: '100000000', // 1.0
      taker_is_bid: 1,
      tx_digest: 'tx_cb_multi_2',
    });

    const entries = computeCostBasis(BUYER2, baseDecimalsFn);
    const e = entries.find((x) => x.pool_id === POOL_NBTC);
    expect(e).toBeDefined();
    expect(e!.total_bought).toBeCloseTo(2.0, 4);
    // Weighted avg: (90000 * 1 + 100000 * 1) / 2 = 95000
    expect(e!.avg_buy_price).toBeCloseTo(95000, 0);
    expect(e!.holding_qty).toBeCloseTo(2.0, 4);
  });

  it('calculates realized PnL on sell', () => {
    const TRADER = '0x' + 'ca03'.repeat(16);
    const COUNTERPARTY = '0x' + 'ca04'.repeat(16);
    // Buy 2.0 NBTC at 90000
    insertFill({
      maker_address: ALICE,
      taker_address: TRADER,
      pool_id: POOL_NBTC,
      price: '90000000000',
      base_quantity: '200000000', // 2.0
      taker_is_bid: 1,
      tx_digest: 'tx_cb_pnl_buy',
    });
    // Sell 1.0 NBTC at 100000 → profit $10,000
    insertFill({
      maker_address: TRADER,
      taker_address: COUNTERPARTY,
      pool_id: POOL_NBTC,
      price: '100000000000',
      base_quantity: '100000000', // 1.0
      taker_is_bid: 1, // taker(COUNTERPARTY) is bid → TRADER(maker) is sell
      tx_digest: 'tx_cb_pnl_sell',
    });

    const entries = computeCostBasis(TRADER, baseDecimalsFn);
    const e = entries.find((x) => x.pool_id === POOL_NBTC);
    expect(e).toBeDefined();
    expect(e!.total_bought).toBeCloseTo(2.0, 4);
    expect(e!.total_sold).toBeCloseTo(1.0, 4);
    // realized PnL = (100000 - 90000) * 1.0 = 10000
    expect(e!.realized_pnl).toBeCloseTo(10000, 0);
    expect(e!.holding_qty).toBeCloseTo(1.0, 4);
  });

  it('handles negative PnL (sell below avg buy)', () => {
    const LOSER = '0x' + 'ca05'.repeat(16);
    const COUNTERPARTY2 = '0x' + 'ca06'.repeat(16);
    // Buy 1.0 NBTC at 100000
    insertFill({
      maker_address: ALICE,
      taker_address: LOSER,
      pool_id: POOL_NBTC,
      price: '100000000000',
      base_quantity: '100000000',
      taker_is_bid: 1,
      tx_digest: 'tx_cb_loss_buy',
    });
    // Sell 1.0 NBTC at 90000 → loss $10,000
    insertFill({
      maker_address: LOSER,
      taker_address: COUNTERPARTY2,
      pool_id: POOL_NBTC,
      price: '90000000000',
      base_quantity: '100000000',
      taker_is_bid: 1,
      tx_digest: 'tx_cb_loss_sell',
    });

    const entries = computeCostBasis(LOSER, baseDecimalsFn);
    const e = entries.find((x) => x.pool_id === POOL_NBTC);
    expect(e).toBeDefined();
    expect(e!.realized_pnl).toBeCloseTo(-10000, 0);
    expect(e!.holding_qty).toBeCloseTo(0, 4);
  });

  it('handles multiple pools independently', () => {
    const MULTI = '0x' + 'ca07'.repeat(16);
    // Buy NBTC
    insertFill({
      maker_address: ALICE,
      taker_address: MULTI,
      pool_id: POOL_NBTC,
      price: '95000000000',
      base_quantity: '100000000',
      taker_is_bid: 1,
      tx_digest: 'tx_cb_multi_pool_1',
    });
    // Buy NASUN (9 decimals)
    insertFill({
      maker_address: ALICE,
      taker_address: MULTI,
      pool_id: POOL_NASUN,
      price: '500000',              // 0.5 NUSDC
      base_quantity: '1000000000',  // 1.0 NASUN (9 decimals)
      taker_is_bid: 1,
      tx_digest: 'tx_cb_multi_pool_2',
    });

    const entries = computeCostBasis(MULTI, baseDecimalsFn);
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const nbtc = entries.find((e) => e.pool_id === POOL_NBTC);
    const nasun = entries.find((e) => e.pool_id === POOL_NASUN);
    expect(nbtc).toBeDefined();
    expect(nasun).toBeDefined();
    expect(nbtc!.avg_buy_price).toBeCloseTo(95000, 0);
    expect(nasun!.avg_buy_price).toBeCloseTo(0.5, 1);
  });

  it('processes fills chronologically (ASC by id)', () => {
    const CHRONO = '0x' + 'ca08'.repeat(16);
    const CHRONO_CP = '0x' + 'ca09'.repeat(16);
    // Buy 1.0 at 80000 (first, lower id)
    insertFill({
      maker_address: ALICE,
      taker_address: CHRONO,
      pool_id: POOL_NBTC,
      price: '80000000000',
      base_quantity: '100000000',
      taker_is_bid: 1,
      tx_digest: 'tx_cb_chrono_1',
      timestamp_ms: 1000,
    });
    // Buy 1.0 at 120000 (second, higher id)
    insertFill({
      maker_address: ALICE,
      taker_address: CHRONO,
      pool_id: POOL_NBTC,
      price: '120000000000',
      base_quantity: '100000000',
      taker_is_bid: 1,
      tx_digest: 'tx_cb_chrono_2',
      timestamp_ms: 2000,
    });
    // Sell 1.0 at 110000 → should PnL against avg (100000)
    insertFill({
      maker_address: CHRONO,
      taker_address: CHRONO_CP,
      pool_id: POOL_NBTC,
      price: '110000000000',
      base_quantity: '100000000',
      taker_is_bid: 1,
      tx_digest: 'tx_cb_chrono_3',
      timestamp_ms: 3000,
    });

    const entries = computeCostBasis(CHRONO, baseDecimalsFn);
    const e = entries.find((x) => x.pool_id === POOL_NBTC);
    expect(e).toBeDefined();
    // avg = (80000 * 1 + 120000 * 1) / 2 = 100000
    // realized PnL = (110000 - 100000) * 1 = 10000
    expect(e!.realized_pnl).toBeCloseTo(10000, 0);
    expect(e!.holding_qty).toBeCloseTo(1.0, 4);
    expect(e!.avg_buy_price).toBeCloseTo(100000, 0);
  });
});

// ===== Side/Role enrichment logic (from server.ts endpoint) =====

describe('Side and Role enrichment', () => {
  // Replicate the exact logic from server.ts:786-801
  function enrichFill(row: {
    taker_address: string;
    taker_is_bid: number;
  }, queryAddress: string): { side: string; role: string } {
    const isTaker = row.taker_address === queryAddress;
    const isBid = !!row.taker_is_bid;
    const side = isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');
    return { side, role: isTaker ? 'taker' : 'maker' };
  }

  it('taker + bid = buy/taker', () => {
    const result = enrichFill({ taker_address: ALICE, taker_is_bid: 1 }, ALICE);
    expect(result).toEqual({ side: 'buy', role: 'taker' });
  });

  it('taker + ask = sell/taker', () => {
    const result = enrichFill({ taker_address: ALICE, taker_is_bid: 0 }, ALICE);
    expect(result).toEqual({ side: 'sell', role: 'taker' });
  });

  it('maker + bid = sell/maker (inverse of taker)', () => {
    const result = enrichFill({ taker_address: BOB, taker_is_bid: 1 }, ALICE);
    expect(result).toEqual({ side: 'sell', role: 'maker' });
  });

  it('maker + ask = buy/maker (inverse of taker)', () => {
    const result = enrichFill({ taker_address: BOB, taker_is_bid: 0 }, ALICE);
    expect(result).toEqual({ side: 'buy', role: 'maker' });
  });
});

// ===== Address validation (from server.ts regex) =====

describe('Address validation regex', () => {
  const ADDRESS_REGEX = /^\/api\/trades\/(0x[a-fA-F0-9]{64})$/;

  it('accepts valid 66-char hex address', () => {
    expect(ADDRESS_REGEX.test(`/api/trades/${ALICE}`)).toBe(true);
  });

  it('rejects short address', () => {
    expect(ADDRESS_REGEX.test('/api/trades/0xabc')).toBe(false);
  });

  it('rejects address without 0x prefix', () => {
    expect(ADDRESS_REGEX.test(`/api/trades/${'a'.repeat(64)}`)).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(ADDRESS_REGEX.test(`/api/trades/0x${'g'.repeat(64)}`)).toBe(false);
  });

  it('rejects empty address', () => {
    expect(ADDRESS_REGEX.test('/api/trades/')).toBe(false);
  });

  it('accepts uppercase hex', () => {
    expect(ADDRESS_REGEX.test(`/api/trades/0x${'A'.repeat(64)}`)).toBe(true);
  });

  it('accepts mixed case hex', () => {
    expect(ADDRESS_REGEX.test(`/api/trades/0x${'aAbBcC01'.repeat(8)}`)).toBe(true);
  });

  // cost-basis path should NOT match the trades regex
  it('does not match cost-basis path', () => {
    expect(ADDRESS_REGEX.test(`/api/trades/${ALICE}/cost-basis`)).toBe(false);
  });
});

// ===== Cursor validation =====

describe('Cursor parameter validation', () => {
  function validateCursor(param: string | null): { valid: boolean; cursor?: number } {
    if (param === null) return { valid: true, cursor: undefined };
    const cursor = parseInt(param, 10);
    if (!Number.isFinite(cursor) || cursor < 0) return { valid: false };
    return { valid: true, cursor };
  }

  it('null cursor is valid (first page)', () => {
    expect(validateCursor(null)).toEqual({ valid: true, cursor: undefined });
  });

  it('positive integer cursor is valid', () => {
    expect(validateCursor('100')).toEqual({ valid: true, cursor: 100 });
  });

  it('zero cursor is valid', () => {
    expect(validateCursor('0')).toEqual({ valid: true, cursor: 0 });
  });

  it('negative cursor is invalid', () => {
    expect(validateCursor('-1')).toEqual({ valid: false });
  });

  it('NaN cursor is invalid', () => {
    expect(validateCursor('abc')).toEqual({ valid: false });
  });

  it('float cursor is truncated to integer', () => {
    // parseInt('3.14') = 3, which is fine
    expect(validateCursor('3.14')).toEqual({ valid: true, cursor: 3 });
  });
});
