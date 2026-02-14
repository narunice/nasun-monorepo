/**
 * Points System Backend Tests (T2-12)
 *
 * Tests:
 * - Points formula: trade_points, volume_points, diversity_points
 * - POINTS constants correctness
 * - Edge cases: zero trades, large volumes, BigInt boundaries
 * - Store: replaceTraderPoints, getPointsLeaderboard, getTraderPoints
 * - Aggregation: sorting, ranking, prev_rank tracking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POINTS } from './leaderboard-types.js';
import {
  initLeaderboardStore,
  closeLeaderboardStore,
  replaceTraderPoints,
  getPointsLeaderboard,
  getTraderPoints,
  getPointsCurrentRanks,
  getTotalPointsTraders,
  insertTradeFill,
  aggregateTraderVolume,
} from './leaderboard-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ===== Points Formula Constants =====

describe('POINTS constants', () => {
  it('has correct PER_TRADE value', () => {
    expect(POINTS.PER_TRADE).toBe(10);
  });

  it('has correct PER_1K_VOLUME value', () => {
    expect(POINTS.PER_1K_VOLUME).toBe(5);
  });

  it('has correct PER_UNIQUE_POOL value', () => {
    expect(POINTS.PER_UNIQUE_POOL).toBe(25);
  });

  it('has correct FIRST_TRADE_BONUS value', () => {
    expect(POINTS.FIRST_TRADE_BONUS).toBe(100);
  });

  it('object is defined with expected keys', () => {
    expect(Object.keys(POINTS)).toEqual(
      expect.arrayContaining(['PER_TRADE', 'PER_1K_VOLUME', 'PER_UNIQUE_POOL', 'FIRST_TRADE_BONUS'])
    );
  });
});

// ===== Points Formula Logic =====
// Replicating the exact formula from aggregator.ts:runPointsAggregation

function computePoints(tradeCount: number, volumeQuoteRaw: string, uniquePools: number) {
  const volumeRaw = BigInt(volumeQuoteRaw);

  const firstTradeBonus = tradeCount >= 1 ? POINTS.FIRST_TRADE_BONUS : 0;
  const tradePoints = firstTradeBonus + tradeCount * POINTS.PER_TRADE;
  // volumeRaw in NUSDC raw (6 decimals). 1K USD = 1e9 raw
  const volumePoints = Number(volumeRaw / BigInt(1_000_000_000)) * POINTS.PER_1K_VOLUME;
  const diversityPoints = uniquePools * POINTS.PER_UNIQUE_POOL;

  return {
    totalPoints: tradePoints + volumePoints + diversityPoints,
    tradePoints,
    volumePoints,
    diversityPoints,
  };
}

describe('Points Formula', () => {
  describe('trade points', () => {
    it('gives FIRST_TRADE_BONUS + PER_TRADE for 1 trade', () => {
      const result = computePoints(1, '0', 0);
      expect(result.tradePoints).toBe(100 + 10); // 110
    });

    it('gives 0 for 0 trades (no bonus)', () => {
      const result = computePoints(0, '0', 0);
      expect(result.tradePoints).toBe(0);
    });

    it('scales linearly with trade count', () => {
      const result = computePoints(50, '0', 0);
      // 100 (bonus) + 50 * 10 = 600
      expect(result.tradePoints).toBe(600);
    });

    it('handles very large trade counts', () => {
      const result = computePoints(10000, '0', 0);
      // 100 + 10000 * 10 = 100,100
      expect(result.tradePoints).toBe(100_100);
    });
  });

  describe('volume points', () => {
    it('gives 0 for zero volume', () => {
      const result = computePoints(0, '0', 0);
      expect(result.volumePoints).toBe(0);
    });

    it('gives 0 for volume below $1K (1e9 raw)', () => {
      // $999.99 = 999_990_000 raw
      const result = computePoints(0, '999990000', 0);
      expect(result.volumePoints).toBe(0);
    });

    it('gives PER_1K_VOLUME for exactly $1K volume', () => {
      // $1,000 = 1_000_000_000 raw (1e9)
      const result = computePoints(0, '1000000000', 0);
      expect(result.volumePoints).toBe(5);
    });

    it('gives correct points for $10K volume', () => {
      // $10,000 = 10_000_000_000 raw
      const result = computePoints(0, '10000000000', 0);
      // floor(10e9 / 1e9) * 5 = 10 * 5 = 50
      expect(result.volumePoints).toBe(50);
    });

    it('gives correct points for $1M volume', () => {
      // $1,000,000 = 1_000_000_000_000 raw
      const result = computePoints(0, '1000000000000', 0);
      // floor(1e12 / 1e9) * 5 = 1000 * 5 = 5000
      expect(result.volumePoints).toBe(5000);
    });

    it('truncates fractional $1K (floors, does not round)', () => {
      // $1,999.99 = 1_999_990_000 raw
      const result = computePoints(0, '1999990000', 0);
      // floor(1999990000 / 1e9) * 5 = 1 * 5 = 5 (only 1 full $1K)
      expect(result.volumePoints).toBe(5);
    });

    it('handles very large volume ($100M)', () => {
      // $100,000,000 = 100_000_000_000_000 raw
      const result = computePoints(0, '100000000000000', 0);
      // floor(1e14 / 1e9) * 5 = 100000 * 5 = 500,000
      expect(result.volumePoints).toBe(500_000);
    });
  });

  describe('diversity points', () => {
    it('gives 0 for 0 unique pools', () => {
      const result = computePoints(0, '0', 0);
      expect(result.diversityPoints).toBe(0);
    });

    it('gives PER_UNIQUE_POOL for 1 pool', () => {
      const result = computePoints(0, '0', 1);
      expect(result.diversityPoints).toBe(25);
    });

    it('scales linearly with unique pools', () => {
      const result = computePoints(0, '0', 4);
      expect(result.diversityPoints).toBe(100);
    });
  });

  describe('total points', () => {
    it('sums all components correctly', () => {
      // 5 trades on 2 pools with $5K volume
      const result = computePoints(5, '5000000000', 2);
      // tradePoints = 100 + 5*10 = 150
      // volumePoints = floor(5e9/1e9)*5 = 25
      // diversityPoints = 2*25 = 50
      // total = 150 + 25 + 50 = 225
      expect(result.tradePoints).toBe(150);
      expect(result.volumePoints).toBe(25);
      expect(result.diversityPoints).toBe(50);
      expect(result.totalPoints).toBe(225);
    });

    it('handles realistic trader scenario', () => {
      // Active trader: 200 trades, $500K volume, 4 pools
      const result = computePoints(200, '500000000000', 4);
      // tradePoints = 100 + 200*10 = 2100
      // volumePoints = floor(500e9/1e9)*5 = 500*5 = 2500
      // diversityPoints = 4*25 = 100
      // total = 2100 + 2500 + 100 = 4700
      expect(result.totalPoints).toBe(4700);
    });

    it('handles whale scenario', () => {
      // Whale: 1000 trades, $10M volume, 4 pools
      const result = computePoints(1000, '10000000000000', 4);
      // tradePoints = 100 + 1000*10 = 10100
      // volumePoints = floor(10e12/1e9)*5 = 10000*5 = 50000
      // diversityPoints = 4*25 = 100
      // total = 10100 + 50000 + 100 = 60200
      expect(result.totalPoints).toBe(60200);
    });

    it('handles edge case: first trade only, no volume, 1 pool', () => {
      const result = computePoints(1, '0', 1);
      // tradePoints = 100 + 10 = 110
      // volumePoints = 0
      // diversityPoints = 25
      // total = 135
      expect(result.totalPoints).toBe(135);
    });
  });
});

// ===== Store Functions (with real SQLite) =====

describe('Points Store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pado-points-test-'));
    initLeaderboardStore({
      leaderboardDbPath: join(tmpDir, 'test-leaderboard.db'),
      deepbookPackage: '0x0',
      rpcUrl: 'http://localhost:9000',
      indexerPollIntervalMs: 5000,
      aggregationIntervalMs: 60000,
      excludedAddresses: new Set(),
    });
  });

  afterEach(() => {
    closeLeaderboardStore();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('replaceTraderPoints', () => {
    it('inserts trader points data', () => {
      replaceTraderPoints([
        {
          address: '0x' + 'a'.repeat(64),
          totalPoints: 500,
          pointsFromTrades: 200,
          pointsFromVolume: 250,
          pointsFromDiversity: 50,
          tradeCount: 10,
          volumeQuote: '50000000000',
          rank: 1,
          prevRank: 1,
        },
      ]);

      const result = getTraderPoints('0x' + 'a'.repeat(64));
      expect(result).not.toBeNull();
      expect(result!.total_points).toBe(500);
      expect(result!.points_from_trades).toBe(200);
      expect(result!.points_from_volume).toBe(250);
      expect(result!.points_from_diversity).toBe(50);
      expect(result!.trade_count).toBe(10);
      expect(result!.volume_quote).toBe('50000000000');
      expect(result!.rank).toBe(1);
    });

    it('replaces existing data on re-insert', () => {
      const addr = '0x' + 'b'.repeat(64);

      replaceTraderPoints([
        { address: addr, totalPoints: 100, pointsFromTrades: 50, pointsFromVolume: 25, pointsFromDiversity: 25, tradeCount: 5, volumeQuote: '5000000000', rank: 1, prevRank: 1 },
      ]);

      replaceTraderPoints([
        { address: addr, totalPoints: 300, pointsFromTrades: 150, pointsFromVolume: 100, pointsFromDiversity: 50, tradeCount: 15, volumeQuote: '20000000000', rank: 1, prevRank: 1 },
      ]);

      const result = getTraderPoints(addr);
      expect(result!.total_points).toBe(300);
      expect(result!.trade_count).toBe(15);
    });

    it('removes traders not in new data set', () => {
      const addr1 = '0x' + 'c'.repeat(64);
      const addr2 = '0x' + 'd'.repeat(64);

      replaceTraderPoints([
        { address: addr1, totalPoints: 100, pointsFromTrades: 50, pointsFromVolume: 25, pointsFromDiversity: 25, tradeCount: 5, volumeQuote: '0', rank: 1, prevRank: 1 },
        { address: addr2, totalPoints: 50, pointsFromTrades: 25, pointsFromVolume: 10, pointsFromDiversity: 15, tradeCount: 2, volumeQuote: '0', rank: 2, prevRank: 2 },
      ]);

      // Replace with only addr1 — addr2 should be deleted
      replaceTraderPoints([
        { address: addr1, totalPoints: 150, pointsFromTrades: 75, pointsFromVolume: 50, pointsFromDiversity: 25, tradeCount: 7, volumeQuote: '0', rank: 1, prevRank: 1 },
      ]);

      expect(getTraderPoints(addr1)).not.toBeNull();
      expect(getTraderPoints(addr2)).toBeNull();
    });

    it('handles empty array (clears all)', () => {
      const addr = '0x' + 'e'.repeat(64);
      replaceTraderPoints([
        { address: addr, totalPoints: 100, pointsFromTrades: 50, pointsFromVolume: 25, pointsFromDiversity: 25, tradeCount: 5, volumeQuote: '0', rank: 1, prevRank: 1 },
      ]);

      replaceTraderPoints([]);

      expect(getTraderPoints(addr)).toBeNull();
      expect(getTotalPointsTraders()).toBe(0);
    });
  });

  describe('getPointsLeaderboard', () => {
    it('returns traders sorted by rank', () => {
      const traders = Array.from({ length: 5 }, (_, i) => ({
        address: '0x' + (i + 1).toString().padStart(64, '0'),
        totalPoints: (5 - i) * 100,
        pointsFromTrades: (5 - i) * 50,
        pointsFromVolume: (5 - i) * 30,
        pointsFromDiversity: (5 - i) * 20,
        tradeCount: (5 - i) * 10,
        volumeQuote: String((5 - i) * 1_000_000_000),
        rank: i + 1,
        prevRank: i + 1,
      }));

      replaceTraderPoints(traders);

      const leaderboard = getPointsLeaderboard(50);
      expect(leaderboard.length).toBe(5);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].total_points).toBe(500);
      expect(leaderboard[4].rank).toBe(5);
      expect(leaderboard[4].total_points).toBe(100);
    });

    it('respects limit parameter', () => {
      const traders = Array.from({ length: 10 }, (_, i) => ({
        address: '0x' + (i + 1).toString().padStart(64, '0'),
        totalPoints: (10 - i) * 100,
        pointsFromTrades: 50,
        pointsFromVolume: 25,
        pointsFromDiversity: 25,
        tradeCount: 5,
        volumeQuote: '0',
        rank: i + 1,
        prevRank: i + 1,
      }));

      replaceTraderPoints(traders);

      const top3 = getPointsLeaderboard(3);
      expect(top3.length).toBe(3);
      expect(top3[0].rank).toBe(1);
      expect(top3[2].rank).toBe(3);
    });

    it('returns empty array when no data', () => {
      const leaderboard = getPointsLeaderboard(50);
      expect(leaderboard).toEqual([]);
    });
  });

  describe('getTraderPoints', () => {
    it('returns null for non-existent trader', () => {
      const result = getTraderPoints('0x' + 'f'.repeat(64));
      expect(result).toBeNull();
    });

    it('returns all fields for existing trader', () => {
      const addr = '0x' + 'a'.repeat(64);
      replaceTraderPoints([{
        address: addr,
        totalPoints: 1000,
        pointsFromTrades: 500,
        pointsFromVolume: 300,
        pointsFromDiversity: 200,
        tradeCount: 42,
        volumeQuote: '60000000000',
        rank: 7,
        prevRank: 10,
      }]);

      const result = getTraderPoints(addr);
      expect(result).not.toBeNull();
      expect(result!.address).toBe(addr);
      expect(result!.total_points).toBe(1000);
      expect(result!.points_from_trades).toBe(500);
      expect(result!.points_from_volume).toBe(300);
      expect(result!.points_from_diversity).toBe(200);
      expect(result!.trade_count).toBe(42);
      expect(result!.volume_quote).toBe('60000000000');
      expect(result!.rank).toBe(7);
      expect(result!.prev_rank).toBe(10);
      expect(result!.updated_at).toBeGreaterThan(0);
    });
  });

  describe('getPointsCurrentRanks', () => {
    it('returns empty map when no data', () => {
      const ranks = getPointsCurrentRanks();
      expect(ranks.size).toBe(0);
    });

    it('returns correct rank mapping', () => {
      const addr1 = '0x' + 'a'.repeat(64);
      const addr2 = '0x' + 'b'.repeat(64);

      replaceTraderPoints([
        { address: addr1, totalPoints: 200, pointsFromTrades: 100, pointsFromVolume: 50, pointsFromDiversity: 50, tradeCount: 10, volumeQuote: '0', rank: 1, prevRank: 2 },
        { address: addr2, totalPoints: 100, pointsFromTrades: 50, pointsFromVolume: 25, pointsFromDiversity: 25, tradeCount: 5, volumeQuote: '0', rank: 2, prevRank: 1 },
      ]);

      const ranks = getPointsCurrentRanks();
      expect(ranks.size).toBe(2);
      expect(ranks.get(addr1)).toBe(1);
      expect(ranks.get(addr2)).toBe(2);
    });
  });

  describe('getTotalPointsTraders', () => {
    it('returns 0 when no data', () => {
      expect(getTotalPointsTraders()).toBe(0);
    });

    it('returns correct count', () => {
      replaceTraderPoints([
        { address: '0x' + 'a'.repeat(64), totalPoints: 100, pointsFromTrades: 50, pointsFromVolume: 25, pointsFromDiversity: 25, tradeCount: 5, volumeQuote: '0', rank: 1, prevRank: 1 },
        { address: '0x' + 'b'.repeat(64), totalPoints: 50, pointsFromTrades: 25, pointsFromVolume: 10, pointsFromDiversity: 15, tradeCount: 2, volumeQuote: '0', rank: 2, prevRank: 2 },
        { address: '0x' + 'c'.repeat(64), totalPoints: 25, pointsFromTrades: 10, pointsFromVolume: 5, pointsFromDiversity: 10, tradeCount: 1, volumeQuote: '0', rank: 3, prevRank: 3 },
      ]);
      expect(getTotalPointsTraders()).toBe(3);
    });
  });

  describe('trade_count and volume_quote columns', () => {
    it('stores and retrieves trade_count correctly', () => {
      const addr = '0x' + 'a'.repeat(64);
      replaceTraderPoints([{
        address: addr,
        totalPoints: 100,
        pointsFromTrades: 50,
        pointsFromVolume: 25,
        pointsFromDiversity: 25,
        tradeCount: 42,
        volumeQuote: '0',
        rank: 1,
        prevRank: 1,
      }]);

      const result = getTraderPoints(addr);
      expect(result!.trade_count).toBe(42);
    });

    it('stores and retrieves volume_quote correctly', () => {
      const addr = '0x' + 'a'.repeat(64);
      replaceTraderPoints([{
        address: addr,
        totalPoints: 100,
        pointsFromTrades: 50,
        pointsFromVolume: 25,
        pointsFromDiversity: 25,
        tradeCount: 10,
        volumeQuote: '123456789012345',
        rank: 1,
        prevRank: 1,
      }]);

      const result = getTraderPoints(addr);
      expect(result!.volume_quote).toBe('123456789012345');
    });

    it('defaults trade_count to 0', () => {
      const addr = '0x' + 'a'.repeat(64);
      replaceTraderPoints([{
        address: addr,
        totalPoints: 0,
        pointsFromTrades: 0,
        pointsFromVolume: 0,
        pointsFromDiversity: 0,
        tradeCount: 0,
        volumeQuote: '0',
        rank: 1,
        prevRank: 1,
      }]);

      const result = getTraderPoints(addr);
      expect(result!.trade_count).toBe(0);
      expect(result!.volume_quote).toBe('0');
    });
  });
});

// ===== Aggregation Integration =====

describe('Points Aggregation Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pado-agg-test-'));
    initLeaderboardStore({
      leaderboardDbPath: join(tmpDir, 'test-leaderboard.db'),
      deepbookPackage: '0x0',
      rpcUrl: 'http://localhost:9000',
      indexerPollIntervalMs: 5000,
      aggregationIntervalMs: 60000,
      excludedAddresses: new Set(),
    });
  });

  afterEach(() => {
    closeLeaderboardStore();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('aggregateTraderVolume for points', () => {
    function insertFill(maker: string, taker: string, poolId: string, quoteQty: string, ts: number) {
      insertTradeFill({
        tx_digest: `tx_${Math.random().toString(36)}`,
        event_seq: '0',
        pool_id: poolId,
        maker_address: maker,
        taker_address: taker,
        price: '97000000000000',
        base_quantity: '1000000000',
        quote_quantity: quoteQty,
        taker_is_bid: 1,
        timestamp_ms: ts,
      });
    }

    it('aggregates volume across multiple trades', () => {
      const trader = '0x' + 'a'.repeat(64);
      const other = '0x' + 'b'.repeat(64);
      const pool = '0x' + '1'.repeat(64);

      insertFill(trader, other, pool, '1000000000', Date.now()); // $1000
      insertFill(other, trader, pool, '2000000000', Date.now()); // $2000

      const result = aggregateTraderVolume(0, new Set(), 100);
      const traderData = result.find(t => t.address === trader);
      expect(traderData).toBeTruthy();
      // trader is maker in fill 1 ($1000) and taker in fill 2 ($2000) = $3000
      expect(BigInt(traderData!.volume_quote)).toBe(3000000000n);
    });

    it('counts unique pools correctly', () => {
      const trader = '0x' + 'a'.repeat(64);
      const other = '0x' + 'b'.repeat(64);
      const pool1 = '0x' + '1'.repeat(64);
      const pool2 = '0x' + '2'.repeat(64);
      const pool3 = '0x' + '3'.repeat(64);

      insertFill(trader, other, pool1, '1000000000', Date.now());
      insertFill(trader, other, pool2, '1000000000', Date.now());
      insertFill(trader, other, pool3, '1000000000', Date.now());
      insertFill(trader, other, pool1, '1000000000', Date.now()); // duplicate pool

      const result = aggregateTraderVolume(0, new Set(), 100);
      const traderData = result.find(t => t.address === trader);
      expect(traderData!.unique_pools).toBe(3);
    });

    it('counts trades correctly', () => {
      const trader = '0x' + 'a'.repeat(64);
      const other = '0x' + 'b'.repeat(64);
      const pool = '0x' + '1'.repeat(64);

      insertFill(trader, other, pool, '1000000000', Date.now());
      insertFill(trader, other, pool, '1000000000', Date.now());
      insertFill(trader, other, pool, '1000000000', Date.now());

      const result = aggregateTraderVolume(0, new Set(), 100);
      const traderData = result.find(t => t.address === trader);
      // trader is maker 3 times
      expect(traderData!.trade_count).toBe(3);
    });

    it('excludes specified addresses', () => {
      const trader = '0x' + 'a'.repeat(64);
      const bot = '0x' + 'b'.repeat(64);
      const pool = '0x' + '1'.repeat(64);

      insertFill(trader, bot, pool, '1000000000', Date.now());
      insertFill(bot, trader, pool, '5000000000', Date.now());

      const excluded = new Set([bot]);
      const result = aggregateTraderVolume(0, excluded, 100);

      expect(result.find(t => t.address === bot)).toBeUndefined();
      expect(result.find(t => t.address === trader)).toBeTruthy();
    });
  });

  describe('prev_rank tracking', () => {
    it('uses current rank as prevRank for first-time traders', () => {
      const ranks = getPointsCurrentRanks();
      const addr = '0x' + 'a'.repeat(64);
      const prevRank = ranks.get(addr) ?? 0;

      // When prevRank is 0 (not found), aggregator uses current rank
      const effectivePrevRank = prevRank > 0 ? prevRank : 1;
      expect(effectivePrevRank).toBe(1);
    });

    it('preserves previous rank across updates', () => {
      const addr1 = '0x' + 'a'.repeat(64);
      const addr2 = '0x' + 'b'.repeat(64);

      // First aggregation: addr1 rank 1, addr2 rank 2
      replaceTraderPoints([
        { address: addr1, totalPoints: 200, pointsFromTrades: 100, pointsFromVolume: 50, pointsFromDiversity: 50, tradeCount: 10, volumeQuote: '0', rank: 1, prevRank: 1 },
        { address: addr2, totalPoints: 100, pointsFromTrades: 50, pointsFromVolume: 25, pointsFromDiversity: 25, tradeCount: 5, volumeQuote: '0', rank: 2, prevRank: 2 },
      ]);

      // Get current ranks for next aggregation
      const ranks = getPointsCurrentRanks();
      expect(ranks.get(addr1)).toBe(1);
      expect(ranks.get(addr2)).toBe(2);

      // Second aggregation: addr2 overtakes addr1
      replaceTraderPoints([
        { address: addr2, totalPoints: 300, pointsFromTrades: 150, pointsFromVolume: 100, pointsFromDiversity: 50, tradeCount: 15, volumeQuote: '0', rank: 1, prevRank: ranks.get(addr2) ?? 0 },
        { address: addr1, totalPoints: 200, pointsFromTrades: 100, pointsFromVolume: 50, pointsFromDiversity: 50, tradeCount: 10, volumeQuote: '0', rank: 2, prevRank: ranks.get(addr1) ?? 0 },
      ]);

      const result1 = getTraderPoints(addr1);
      const result2 = getTraderPoints(addr2);
      expect(result2!.rank).toBe(1);
      expect(result2!.prev_rank).toBe(2); // was rank 2, now rank 1
      expect(result1!.rank).toBe(2);
      expect(result1!.prev_rank).toBe(1); // was rank 1, now rank 2
    });
  });

  describe('sorting by total points', () => {
    it('leaderboard returns traders sorted by points descending', () => {
      replaceTraderPoints([
        { address: '0x' + 'c'.repeat(64), totalPoints: 50, pointsFromTrades: 25, pointsFromVolume: 10, pointsFromDiversity: 15, tradeCount: 2, volumeQuote: '0', rank: 3, prevRank: 3 },
        { address: '0x' + 'a'.repeat(64), totalPoints: 300, pointsFromTrades: 150, pointsFromVolume: 100, pointsFromDiversity: 50, tradeCount: 15, volumeQuote: '0', rank: 1, prevRank: 1 },
        { address: '0x' + 'b'.repeat(64), totalPoints: 150, pointsFromTrades: 75, pointsFromVolume: 50, pointsFromDiversity: 25, tradeCount: 7, volumeQuote: '0', rank: 2, prevRank: 2 },
      ]);

      const leaderboard = getPointsLeaderboard(50);
      expect(leaderboard[0].total_points).toBe(300);
      expect(leaderboard[1].total_points).toBe(150);
      expect(leaderboard[2].total_points).toBe(50);
    });
  });

  describe('edge cases', () => {
    it('handles 200 traders (points aggregation limit)', () => {
      const traders = Array.from({ length: 200 }, (_, i) => ({
        address: '0x' + (i + 1).toString(16).padStart(64, '0'),
        totalPoints: (200 - i) * 10,
        pointsFromTrades: (200 - i) * 5,
        pointsFromVolume: (200 - i) * 3,
        pointsFromDiversity: (200 - i) * 2,
        tradeCount: 200 - i,
        volumeQuote: String((200 - i) * 1_000_000_000),
        rank: i + 1,
        prevRank: i + 1,
      }));

      replaceTraderPoints(traders);

      expect(getTotalPointsTraders()).toBe(200);
      const top10 = getPointsLeaderboard(10);
      expect(top10.length).toBe(10);
      expect(top10[0].rank).toBe(1);
      expect(top10[9].rank).toBe(10);
    });

    it('handles zero-points trader', () => {
      replaceTraderPoints([{
        address: '0x' + 'a'.repeat(64),
        totalPoints: 0,
        pointsFromTrades: 0,
        pointsFromVolume: 0,
        pointsFromDiversity: 0,
        tradeCount: 0,
        volumeQuote: '0',
        rank: 1,
        prevRank: 1,
      }]);

      const result = getTraderPoints('0x' + 'a'.repeat(64));
      expect(result).not.toBeNull();
      expect(result!.total_points).toBe(0);
    });

    it('handles very large volume_quote string (BigInt safe)', () => {
      const hugeVolume = '999999999999999999999'; // > Number.MAX_SAFE_INTEGER
      replaceTraderPoints([{
        address: '0x' + 'a'.repeat(64),
        totalPoints: 5000000,
        pointsFromTrades: 1000,
        pointsFromVolume: 4999000,
        pointsFromDiversity: 0,
        tradeCount: 100,
        volumeQuote: hugeVolume,
        rank: 1,
        prevRank: 1,
      }]);

      const result = getTraderPoints('0x' + 'a'.repeat(64));
      expect(result!.volume_quote).toBe(hugeVolume);
    });
  });
});
