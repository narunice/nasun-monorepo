/**
 * E2E tests for Activity Feed (#2).
 *
 * Tests getFollowedTraderFills (cross-DB feed query), UNION ALL dedup,
 * pagination, 7-day floor, side determination, and feed API response shape.
 *
 * Uses real SQLite DBs (temp files) for actual query behavior.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initLeaderboardStore,
  closeLeaderboardStore,
  getLeaderboardDb,
  getFollowedTraderFills,
} from './leaderboard-store.js';
import {
  initStore,
  closeStore,
  toggleFollow,
  getFollowing,
  getNicknamesBatch,
  setNickname,
} from './store.js';
import type { ChatServerConfig } from './types.js';

// ===== Fixtures =====

const ALICE = '0x' + 'a'.repeat(64);
const BOB   = '0x' + 'b'.repeat(64);
const CAROL = '0x' + 'c'.repeat(64);
const DAN   = '0x' + 'd'.repeat(64);
const EVE   = '0x' + 'e'.repeat(64);
const POOL_NBTC  = '0x' + '1'.repeat(64);
const POOL_NASUN = '0x' + '2'.repeat(64);

let fillId = 0;

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
  fillId++;
  const db = getLeaderboardDb();
  const stmt = db.prepare(`
    INSERT INTO trade_fills
      (tx_digest, event_seq, pool_id, maker_address, taker_address,
       price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    overrides.tx_digest ?? `tx_feed_${fillId}`,
    overrides.event_seq ?? '0',
    overrides.pool_id ?? POOL_NBTC,
    overrides.maker_address ?? ALICE,
    overrides.taker_address ?? BOB,
    overrides.price ?? '95000000000',
    overrides.base_quantity ?? '100000000',
    overrides.quote_quantity ?? '95000000000',
    overrides.taker_is_bid ?? 1,
    overrides.timestamp_ms ?? Date.now(),
  );
  return Number(result.lastInsertRowid);
}

// ===== Lifecycle =====

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pado-feed-test-'));

  // Init chat store (for follows + nicknames)
  initStore({
    dbPath: join(tmpDir, 'chat.db'),
    messageRetentionDays: 5,
  } as ChatServerConfig);

  // Init leaderboard store (for trade_fills)
  initLeaderboardStore({
    leaderboardDbPath: join(tmpDir, 'leaderboard.db'),
    deepbookPackage: '0x0',
    rpcUrl: 'http://localhost',
    indexerPollIntervalMs: 5000,
    aggregationIntervalMs: 30000,
    excludedAddresses: new Set(),
  });
});

afterAll(() => {
  closeStore();
  closeLeaderboardStore();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ===== getFollowedTraderFills =====

describe('getFollowedTraderFills', () => {
  it('returns empty for empty address list', () => {
    const { fills, hasMore } = getFollowedTraderFills([], 30);
    expect(fills).toHaveLength(0);
    expect(hasMore).toBe(false);
  });

  it('returns fills where followed trader is maker', () => {
    insertFill({
      maker_address: ALICE,
      taker_address: BOB,
      tx_digest: 'tx_maker_feed',
      timestamp_ms: Date.now() - 1000,
    });

    const { fills } = getFollowedTraderFills([ALICE], 30);
    expect(fills.some((f) => f.tx_digest === 'tx_maker_feed')).toBe(true);
  });

  it('returns fills where followed trader is taker', () => {
    insertFill({
      maker_address: CAROL,
      taker_address: BOB,
      tx_digest: 'tx_taker_feed',
      timestamp_ms: Date.now() - 2000,
    });

    const { fills } = getFollowedTraderFills([BOB], 30);
    expect(fills.some((f) => f.tx_digest === 'tx_taker_feed')).toBe(true);
  });

  it('deduplicates fills that appear in both maker and taker branches', () => {
    // Alice and Bob both followed, same fill
    insertFill({
      maker_address: ALICE,
      taker_address: BOB,
      tx_digest: 'tx_both_followed',
      timestamp_ms: Date.now() - 500,
    });

    const { fills } = getFollowedTraderFills([ALICE, BOB], 30);
    const matches = fills.filter((f) => f.tx_digest === 'tx_both_followed');
    expect(matches).toHaveLength(1); // Deduped
  });

  it('deduplicates self-trade (same address as maker and taker)', () => {
    insertFill({
      maker_address: DAN,
      taker_address: DAN,
      tx_digest: 'tx_self_trade',
      timestamp_ms: Date.now() - 300,
    });

    const { fills } = getFollowedTraderFills([DAN], 30);
    const matches = fills.filter((f) => f.tx_digest === 'tx_self_trade');
    expect(matches).toHaveLength(1);
  });

  it('does not return fills for unfollowed traders', () => {
    insertFill({
      maker_address: EVE,
      taker_address: CAROL,
      tx_digest: 'tx_eve_only',
      timestamp_ms: Date.now() - 400,
    });

    // Only following ALICE
    const { fills } = getFollowedTraderFills([ALICE], 30);
    expect(fills.some((f) => f.tx_digest === 'tx_eve_only')).toBe(false);
  });
});

// ===== Pagination =====

describe('feed pagination', () => {
  it('respects limit parameter', () => {
    // Insert 10 fills for DAN
    for (let i = 0; i < 10; i++) {
      insertFill({
        maker_address: DAN,
        taker_address: CAROL,
        tx_digest: `tx_page_${i}`,
        timestamp_ms: Date.now() - (i * 100),
      });
    }

    const { fills, hasMore } = getFollowedTraderFills([DAN], 5);
    expect(fills).toHaveLength(5);
    expect(hasMore).toBe(true);
  });

  it('returns hasMore=false when fewer results than limit', () => {
    const uniqueTrader = '0x' + 'f'.repeat(63) + '1';
    insertFill({
      maker_address: uniqueTrader,
      taker_address: CAROL,
      tx_digest: 'tx_single_page',
      timestamp_ms: Date.now() - 100,
    });

    const { fills, hasMore } = getFollowedTraderFills([uniqueTrader], 30);
    expect(fills.length).toBeLessThanOrEqual(30);
    expect(hasMore).toBe(false);
  });

  it('supports cursor-based pagination via beforeTs', () => {
    const trader = '0x' + 'f'.repeat(63) + '2';
    const now = Date.now();

    // Insert fills at known timestamps
    insertFill({ maker_address: trader, taker_address: CAROL, tx_digest: 'tx_ts_1', timestamp_ms: now - 1000 });
    insertFill({ maker_address: trader, taker_address: CAROL, tx_digest: 'tx_ts_2', timestamp_ms: now - 2000 });
    insertFill({ maker_address: trader, taker_address: CAROL, tx_digest: 'tx_ts_3', timestamp_ms: now - 3000 });

    // First page: latest 2
    const page1 = getFollowedTraderFills([trader], 2);
    expect(page1.fills).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    // Second page: before the oldest from page 1
    const lastTs = page1.fills[page1.fills.length - 1].timestamp_ms;
    const page2 = getFollowedTraderFills([trader], 2, lastTs);
    expect(page2.fills.length).toBeGreaterThanOrEqual(1);
    // Page 2 items should be older than page 1's oldest
    for (const fill of page2.fills) {
      expect(fill.timestamp_ms).toBeLessThan(lastTs);
    }
  });
});

// ===== 7-day floor =====

describe('7-day floor', () => {
  it('excludes fills older than 7 days', () => {
    const trader = '0x' + 'f'.repeat(63) + '3';
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;

    insertFill({
      maker_address: trader,
      taker_address: CAROL,
      tx_digest: 'tx_old_8d',
      timestamp_ms: eightDaysAgo,
    });

    const { fills } = getFollowedTraderFills([trader], 30);
    expect(fills.some((f) => f.tx_digest === 'tx_old_8d')).toBe(false);
  });

  it('includes fills within 7 days', () => {
    const trader = '0x' + 'f'.repeat(63) + '4';
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;

    insertFill({
      maker_address: trader,
      taker_address: CAROL,
      tx_digest: 'tx_recent_6d',
      timestamp_ms: sixDaysAgo,
    });

    const { fills } = getFollowedTraderFills([trader], 30);
    expect(fills.some((f) => f.tx_digest === 'tx_recent_6d')).toBe(true);
  });
});

// ===== Ordering =====

describe('feed ordering', () => {
  it('returns fills in descending timestamp order (newest first)', () => {
    const trader = '0x' + 'f'.repeat(63) + '5';
    const now = Date.now();

    insertFill({ maker_address: trader, taker_address: CAROL, tx_digest: 'tx_ord_old', timestamp_ms: now - 5000 });
    insertFill({ maker_address: trader, taker_address: CAROL, tx_digest: 'tx_ord_mid', timestamp_ms: now - 3000 });
    insertFill({ maker_address: trader, taker_address: CAROL, tx_digest: 'tx_ord_new', timestamp_ms: now - 1000 });

    const { fills } = getFollowedTraderFills([trader], 30);
    const relevantFills = fills.filter((f) => f.tx_digest.startsWith('tx_ord_'));

    for (let i = 0; i < relevantFills.length - 1; i++) {
      expect(relevantFills[i].timestamp_ms).toBeGreaterThanOrEqual(relevantFills[i + 1].timestamp_ms);
    }
  });
});

// ===== Side determination =====

describe('trade side determination', () => {
  // Replicate the side logic from server.ts feed handler:
  // isTaker = fill.address === fill.taker_address
  // taker_is_bid=1 means taker bought, maker sold

  function determineSide(
    address: string,
    taker_address: string,
    taker_is_bid: number,
  ): 'buy' | 'sell' {
    const isTaker = address === taker_address;
    const isBid = !!taker_is_bid;
    return isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');
  }

  it('taker buying (taker_is_bid=1): taker=buy, maker=sell', () => {
    expect(determineSide(BOB, BOB, 1)).toBe('buy');   // taker
    expect(determineSide(ALICE, BOB, 1)).toBe('sell'); // maker
  });

  it('taker selling (taker_is_bid=0): taker=sell, maker=buy', () => {
    expect(determineSide(BOB, BOB, 0)).toBe('sell');  // taker
    expect(determineSide(ALICE, BOB, 0)).toBe('buy'); // maker
  });
});

// ===== Cross-DB integration: follows + fills + nicknames =====

describe('cross-DB feed integration', () => {
  it('follows -> feed query -> nickname enrichment pipeline', () => {
    // 1. Set up follows in chat DB
    const viewer = '0x' + 'f'.repeat(63) + '6';
    toggleFollow(viewer, ALICE);
    toggleFollow(viewer, BOB);

    // 2. Set nicknames
    setNickname(ALICE, 'alice_trader');
    setNickname(BOB, 'bob_whale');

    // 3. Insert fills in leaderboard DB
    const now = Date.now();
    insertFill({
      maker_address: ALICE,
      taker_address: CAROL,
      tx_digest: 'tx_pipe_1',
      timestamp_ms: now - 1000,
    });
    insertFill({
      maker_address: DAN,
      taker_address: BOB,
      tx_digest: 'tx_pipe_2',
      timestamp_ms: now - 2000,
    });

    // 4. Get following list (chat DB)
    const following = getFollowing(viewer);
    expect(following.length).toBeGreaterThanOrEqual(2);

    // 5. Query feed (leaderboard DB)
    const { fills } = getFollowedTraderFills(following, 30);
    const feedDigests = fills.map((f) => f.tx_digest);
    expect(feedDigests).toContain('tx_pipe_1'); // ALICE as maker
    expect(feedDigests).toContain('tx_pipe_2'); // BOB as taker

    // 6. Enrich with nicknames (chat DB)
    const traderAddresses = [...new Set(fills.map((f) => f.address))];
    const nicknames = getNicknamesBatch(traderAddresses);
    expect(nicknames.get(ALICE.toLowerCase())).toBe('alice_trader');
    expect(nicknames.get(BOB.toLowerCase())).toBe('bob_whale');
  });

  it('empty follows returns empty feed', () => {
    const viewer = '0x' + 'f'.repeat(63) + '7';
    const following = getFollowing(viewer);
    expect(following).toHaveLength(0);

    const { fills } = getFollowedTraderFills(following, 30);
    expect(fills).toHaveLength(0);
  });

  it('followed trader with no trades returns empty feed', () => {
    const viewer = '0x' + 'f'.repeat(63) + '8';
    const ghost = '0x' + 'f'.repeat(63) + '9';
    toggleFollow(viewer, ghost);

    const following = getFollowing(viewer);
    const { fills } = getFollowedTraderFills(following, 30);
    // ghost has no fills, so should not appear
    expect(fills.filter((f) => f.address === ghost.toLowerCase())).toHaveLength(0);
  });
});

// ===== FeedFillRow shape =====

describe('FeedFillRow shape', () => {
  it('includes both address and maker_address/taker_address for side determination', () => {
    const trader = '0x' + 'f'.repeat(62) + 'a1';
    insertFill({
      maker_address: trader,
      taker_address: CAROL,
      tx_digest: 'tx_shape_test',
      timestamp_ms: Date.now() - 100,
    });

    const { fills } = getFollowedTraderFills([trader], 30);
    const fill = fills.find((f) => f.tx_digest === 'tx_shape_test');
    expect(fill).toBeDefined();

    // All required fields present
    expect(fill!.id).toBeTypeOf('number');
    expect(fill!.tx_digest).toBe('tx_shape_test');
    expect(fill!.pool_id).toBe(POOL_NBTC);
    expect(fill!.address).toBe(trader.toLowerCase());
    expect(fill!.maker_address).toBe(trader.toLowerCase());
    expect(fill!.taker_address).toBe(CAROL.toLowerCase());
    expect(fill!.price).toBeTypeOf('string');
    expect(fill!.base_quantity).toBeTypeOf('string');
    expect(fill!.quote_quantity).toBeTypeOf('string');
    expect(fill!.taker_is_bid).toBeTypeOf('number');
    expect(fill!.timestamp_ms).toBeTypeOf('number');
  });
});

// ===== Edge cases: multiple pools =====

describe('multi-pool feed', () => {
  it('returns fills from different pools for the same trader', () => {
    const trader = '0x' + 'f'.repeat(62) + 'b1';
    const now = Date.now();

    insertFill({
      maker_address: trader,
      taker_address: CAROL,
      pool_id: POOL_NBTC,
      tx_digest: 'tx_pool_nbtc',
      timestamp_ms: now - 100,
    });
    insertFill({
      maker_address: trader,
      taker_address: CAROL,
      pool_id: POOL_NASUN,
      tx_digest: 'tx_pool_nasun',
      timestamp_ms: now - 200,
    });

    const { fills } = getFollowedTraderFills([trader], 30);
    const pools = fills
      .filter((f) => f.tx_digest.startsWith('tx_pool_'))
      .map((f) => f.pool_id);
    expect(pools).toContain(POOL_NBTC);
    expect(pools).toContain(POOL_NASUN);
  });
});

// ===== Edge cases: 50 followed traders =====

describe('feed with max followers', () => {
  it('handles IN clause with 50 addresses', () => {
    const addresses: string[] = [];
    for (let i = 0; i < 50; i++) {
      const addr = '0x' + i.toString(16).padStart(62, '0') + 'cc';
      addresses.push(addr);
    }
    // Should not throw (50 addresses in IN clause is within SQLite limits)
    const { fills } = getFollowedTraderFills(addresses, 30);
    expect(fills).toBeDefined();
  });
});

// ===== beforeTs edge cases =====

describe('beforeTs edge cases', () => {
  it('returns latest data when beforeTs is in the future', () => {
    const trader = '0x' + 'f'.repeat(62) + 'c1';
    insertFill({
      maker_address: trader,
      taker_address: CAROL,
      tx_digest: 'tx_future_cursor',
      timestamp_ms: Date.now() - 100,
    });

    const futureTs = Date.now() + 100_000;
    const { fills } = getFollowedTraderFills([trader], 30, futureTs);
    expect(fills.some((f) => f.tx_digest === 'tx_future_cursor')).toBe(true);
  });

  it('returns empty when beforeTs is before 7-day floor', () => {
    const trader = '0x' + 'f'.repeat(62) + 'c2';
    insertFill({
      maker_address: trader,
      taker_address: CAROL,
      tx_digest: 'tx_ancient_cursor',
      timestamp_ms: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    });

    // beforeTs is 8 days ago, but floor is 7 days, so fills at 3d ago would be included
    // UNLESS beforeTs < floor, making the range empty (beforeTs < floor means no valid range)
    const ancientTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
    // beforeTs < floor means timestamp_ms < ancientTs AND >= floor, which is floor..ancientTs
    // Since floor > ancientTs, this range is empty
    const { fills } = getFollowedTraderFills([trader], 30, ancientTs);
    expect(fills.some((f) => f.tx_digest === 'tx_ancient_cursor')).toBe(false);
  });
});
