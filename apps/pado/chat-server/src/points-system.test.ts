/**
 * Score System Backend Tests
 *
 * Tests:
 * - SCORE constants correctness
 * - Store: replaceTraderScores, getScoreLeaderboard, getTraderScore
 * - prev_rank preservation across UPSERT cycles
 * - rotatePrevRanks behavior
 * - clearTraderScores (weekly reset)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SCORE } from './leaderboard-types.js';
import {
  initLeaderboardStore,
  closeLeaderboardStore,
  replaceTraderScores,
  getScoreLeaderboard,
  getTraderScore,
  getTotalScoreTraders,
  clearTraderScores,
  rotatePrevRanks,
  insertTradeFill,
  aggregateDailyTraderStats,
  aggregateUniquePools,
} from './leaderboard-store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ===== Score Constants =====

describe('SCORE constants', () => {
  it('has correct PER_TRADE value', () => {
    expect(SCORE.PER_TRADE).toBe(1);
  });

  it('has correct DAILY_TRADE_CAP value', () => {
    expect(SCORE.DAILY_TRADE_CAP).toBe(50);
  });

  it('has correct PER_2K_VOLUME value', () => {
    expect(SCORE.PER_2K_VOLUME).toBe(1);
  });

  it('has correct DAILY_VOLUME_CAP_USD value', () => {
    expect(SCORE.DAILY_VOLUME_CAP_USD).toBe(100_000);
  });

  it('has correct PER_UNIQUE_POOL value', () => {
    expect(SCORE.PER_UNIQUE_POOL).toBe(3);
  });

  it('has correct PER_1K_PROFIT value', () => {
    expect(SCORE.PER_1K_PROFIT).toBe(1);
  });

  it('has correct PER_5PCT_RETURN value', () => {
    expect(SCORE.PER_5PCT_RETURN).toBe(10);
  });
});

// ===== Store Functions =====

describe('Score Store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pado-score-test-'));
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

  describe('replaceTraderScores', () => {
    it('inserts trader score data', () => {
      replaceTraderScores('weekly', [
        {
          address: '0x' + 'a'.repeat(64),
          totalScore: 50,
          scoreFromTrades: 20,
          scoreFromVolume: 15,
          scoreFromDiversity: 9,
          scoreFromPnl: 6,
          tradeCount: 20,
          volumeQuote: '50000000000',
          rank: 1,
        },
      ]);

      const result = getTraderScore('0x' + 'a'.repeat(64), 'weekly');
      expect(result).not.toBeNull();
      expect(result!.total_score).toBe(50);
      expect(result!.score_from_trades).toBe(20);
      expect(result!.rank).toBe(1);
    });

    it('keeps weekly and alltime scopes separate', () => {
      const addr = '0x' + 'a'.repeat(64);
      replaceTraderScores('weekly', [
        { address: addr, totalScore: 10, scoreFromTrades: 5, scoreFromVolume: 3, scoreFromDiversity: 2, scoreFromPnl: 0, tradeCount: 5, volumeQuote: '0', rank: 1 },
      ]);
      replaceTraderScores('alltime', [
        { address: addr, totalScore: 100, scoreFromTrades: 50, scoreFromVolume: 30, scoreFromDiversity: 20, scoreFromPnl: 0, tradeCount: 50, volumeQuote: '0', rank: 1 },
      ]);

      expect(getTraderScore(addr, 'weekly')!.total_score).toBe(10);
      expect(getTraderScore(addr, 'alltime')!.total_score).toBe(100);
    });

    it('removes traders not in new data set', () => {
      const addr1 = '0x' + 'a'.repeat(64);
      const addr2 = '0x' + 'b'.repeat(64);

      replaceTraderScores('weekly', [
        { address: addr1, totalScore: 10, scoreFromTrades: 5, scoreFromVolume: 3, scoreFromDiversity: 2, scoreFromPnl: 0, tradeCount: 5, volumeQuote: '0', rank: 1 },
        { address: addr2, totalScore: 5, scoreFromTrades: 3, scoreFromVolume: 1, scoreFromDiversity: 1, scoreFromPnl: 0, tradeCount: 3, volumeQuote: '0', rank: 2 },
      ]);

      replaceTraderScores('weekly', [
        { address: addr1, totalScore: 15, scoreFromTrades: 8, scoreFromVolume: 4, scoreFromDiversity: 3, scoreFromPnl: 0, tradeCount: 8, volumeQuote: '0', rank: 1 },
      ]);

      expect(getTraderScore(addr1, 'weekly')).not.toBeNull();
      expect(getTraderScore(addr2, 'weekly')).toBeNull();
    });
  });

  describe('prev_rank preservation', () => {
    it('preserves prev_rank across consecutive replaceTraderScores calls', () => {
      const addr = '0x' + 'a'.repeat(64);

      // First insert: prev_rank = rank = 1
      replaceTraderScores('weekly', [
        { address: addr, totalScore: 10, scoreFromTrades: 5, scoreFromVolume: 3, scoreFromDiversity: 2, scoreFromPnl: 0, tradeCount: 5, volumeQuote: '0', rank: 1 },
      ]);

      // Rotate: prev_rank = rank = 1
      rotatePrevRanks();

      // Second insert: rank changes to 3 but prev_rank stays 1
      replaceTraderScores('weekly', [
        { address: '0x' + 'b'.repeat(64), totalScore: 20, scoreFromTrades: 10, scoreFromVolume: 6, scoreFromDiversity: 4, scoreFromPnl: 0, tradeCount: 10, volumeQuote: '0', rank: 1 },
        { address: '0x' + 'c'.repeat(64), totalScore: 15, scoreFromTrades: 8, scoreFromVolume: 4, scoreFromDiversity: 3, scoreFromPnl: 0, tradeCount: 8, volumeQuote: '0', rank: 2 },
        { address: addr, totalScore: 10, scoreFromTrades: 5, scoreFromVolume: 3, scoreFromDiversity: 2, scoreFromPnl: 0, tradeCount: 5, volumeQuote: '0', rank: 3 },
      ]);

      const result = getTraderScore(addr, 'weekly');
      expect(result!.rank).toBe(3);
      expect(result!.prev_rank).toBe(1); // preserved from rotation, not overwritten
    });
  });

  describe('rotatePrevRanks', () => {
    it('updates prev_rank = rank for all entries', () => {
      const addr = '0x' + 'a'.repeat(64);
      replaceTraderScores('weekly', [
        { address: addr, totalScore: 10, scoreFromTrades: 5, scoreFromVolume: 3, scoreFromDiversity: 2, scoreFromPnl: 0, tradeCount: 5, volumeQuote: '0', rank: 3 },
      ]);

      // prev_rank is 3 (from INSERT)
      expect(getTraderScore(addr, 'weekly')!.prev_rank).toBe(3);

      // Change rank to 1 via new UPSERT
      replaceTraderScores('weekly', [
        { address: addr, totalScore: 50, scoreFromTrades: 25, scoreFromVolume: 15, scoreFromDiversity: 10, scoreFromPnl: 0, tradeCount: 25, volumeQuote: '0', rank: 1 },
      ]);

      // prev_rank still 3 (not overwritten by UPSERT)
      expect(getTraderScore(addr, 'weekly')!.prev_rank).toBe(3);

      // After rotation, prev_rank = rank = 1
      rotatePrevRanks();
      expect(getTraderScore(addr, 'weekly')!.prev_rank).toBe(1);
    });
  });

  describe('clearTraderScores', () => {
    it('clears only the specified scope', () => {
      const addr = '0x' + 'a'.repeat(64);
      replaceTraderScores('weekly', [
        { address: addr, totalScore: 10, scoreFromTrades: 5, scoreFromVolume: 3, scoreFromDiversity: 2, scoreFromPnl: 0, tradeCount: 5, volumeQuote: '0', rank: 1 },
      ]);
      replaceTraderScores('alltime', [
        { address: addr, totalScore: 100, scoreFromTrades: 50, scoreFromVolume: 30, scoreFromDiversity: 20, scoreFromPnl: 0, tradeCount: 50, volumeQuote: '0', rank: 1 },
      ]);

      clearTraderScores('weekly');

      expect(getTotalScoreTraders('weekly')).toBe(0);
      expect(getTotalScoreTraders('alltime')).toBe(1);
    });
  });

  describe('getScoreLeaderboard', () => {
    it('returns traders sorted by rank', () => {
      const traders = Array.from({ length: 5 }, (_, i) => ({
        address: '0x' + (i + 1).toString().padStart(64, '0'),
        totalScore: (5 - i) * 10,
        scoreFromTrades: (5 - i) * 5,
        scoreFromVolume: (5 - i) * 3,
        scoreFromDiversity: (5 - i) * 2,
        scoreFromPnl: 0,
        tradeCount: (5 - i) * 10,
        volumeQuote: '0',
        rank: i + 1,
      }));

      replaceTraderScores('weekly', traders);

      const leaderboard = getScoreLeaderboard('weekly', 50);
      expect(leaderboard.length).toBe(5);
      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].total_score).toBe(50);
    });

    it('respects limit', () => {
      const traders = Array.from({ length: 10 }, (_, i) => ({
        address: '0x' + (i + 1).toString().padStart(64, '0'),
        totalScore: (10 - i) * 10,
        scoreFromTrades: 5,
        scoreFromVolume: 3,
        scoreFromDiversity: 2,
        scoreFromPnl: 0,
        tradeCount: 5,
        volumeQuote: '0',
        rank: i + 1,
      }));

      replaceTraderScores('weekly', traders);
      expect(getScoreLeaderboard('weekly', 3).length).toBe(3);
    });
  });

  describe('aggregateDailyTraderStats', () => {
    function insertFill(maker: string, taker: string, poolId: string, quoteQty: string, ts: number) {
      insertTradeFill({
        tx_digest: `tx_${Math.random().toString(36)}`,
        event_seq: '0',
        pool_id: poolId,
        maker_address: maker,
        taker_address: taker,
        maker_order_id: null,
        taker_order_id: null,
        price: '97000000000000',
        base_quantity: '1000000000',
        quote_quantity: quoteQty,
        taker_is_bid: 1,
        timestamp_ms: ts,
      });
    }

    it('groups trades by day and address', () => {
      const trader = '0x' + 'a'.repeat(64);
      const other = '0x' + 'b'.repeat(64);
      const pool = '0x' + '1'.repeat(64);
      const day1 = Date.UTC(2026, 3, 7, 12, 0, 0); // Apr 7
      const day2 = Date.UTC(2026, 3, 8, 12, 0, 0); // Apr 8

      insertFill(trader, other, pool, '1000000000', day1);
      insertFill(trader, other, pool, '2000000000', day1);
      insertFill(trader, other, pool, '3000000000', day2);

      const map = aggregateDailyTraderStats(0, new Set());
      const days = map.get(trader);
      expect(days).toBeTruthy();
      expect(days!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('aggregateUniquePools', () => {
    function insertFill(maker: string, taker: string, poolId: string, quoteQty: string, ts: number) {
      insertTradeFill({
        tx_digest: `tx_${Math.random().toString(36)}`,
        event_seq: '0',
        pool_id: poolId,
        maker_address: maker,
        taker_address: taker,
        maker_order_id: null,
        taker_order_id: null,
        price: '97000000000000',
        base_quantity: '1000000000',
        quote_quantity: quoteQty,
        taker_is_bid: 1,
        timestamp_ms: ts,
      });
    }

    it('counts unique pools per trader', () => {
      const trader = '0x' + 'a'.repeat(64);
      const other = '0x' + 'b'.repeat(64);
      const pool1 = '0x' + '1'.repeat(64);
      const pool2 = '0x' + '2'.repeat(64);

      insertFill(trader, other, pool1, '1000000000', Date.now());
      insertFill(trader, other, pool2, '1000000000', Date.now());
      insertFill(trader, other, pool1, '1000000000', Date.now()); // duplicate pool

      const map = aggregateUniquePools(0, new Set());
      expect(map.get(trader)).toBe(2);
    });
  });
});
