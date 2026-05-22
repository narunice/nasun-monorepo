import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initLeaderboardStore,
  closeLeaderboardStore,
  getLeaderboardDb,
  computePredictionPnl,
  computePredictionPnlMultiPeriod,
} from '../leaderboard-store.js';
import type { LeaderboardConfig } from '../leaderboard-types.js';

let cfg: LeaderboardConfig;
let tempDir: string;

function makeCfg(): LeaderboardConfig {
  tempDir = mkdtempSync(join(tmpdir(), 'pred-pnl-multi-'));
  return {
    leaderboardDbPath: join(tempDir, 'leaderboard.db'),
    deepbookPackage: '0x0',
    rpcUrl: 'http://localhost:0',
    indexerPollIntervalMs: 0,
    aggregationIntervalMs: 60_000,
    excludedAddresses: new Set(),
  };
}

beforeEach(() => {
  cfg = makeCfg();
  initLeaderboardStore(cfg);
});

afterEach(() => {
  closeLeaderboardStore();
  rmSync(tempDir, { recursive: true, force: true });
});

function insertMarket(marketId: string, outcome: 0 | 1, resolvedAtMs: number) {
  getLeaderboardDb()
    .prepare(
      `INSERT INTO prediction_markets (market_id, status, outcome, resolved_at_ms, updated_at)
       VALUES (?, 'resolved', ?, ?, ?)`,
    )
    .run(marketId, outcome, resolvedAtMs, resolvedAtMs);
}

function insertFill(opts: {
  txDigest: string;
  eventSeq: string;
  poolId: string;
  maker: string;
  taker: string;
  baseQty: string;
  quoteQty: string;
  takerIsBid: 0 | 1;
  timestampMs: number;
  isYes: 0 | 1;
}) {
  getLeaderboardDb()
    .prepare(
      `INSERT INTO trade_fills
       (tx_digest, event_seq, pool_id, maker_address, taker_address,
        base_quantity, quote_quantity, price, taker_is_bid, timestamp_ms, is_yes)
       VALUES (?, ?, ?, ?, ?, ?, ?, '0', ?, ?, ?)`,
    )
    .run(
      opts.txDigest,
      opts.eventSeq,
      opts.poolId,
      opts.maker,
      opts.taker,
      opts.baseQty,
      opts.quoteQty,
      opts.takerIsBid,
      opts.timestampMs,
      opts.isYes,
    );
}

describe('computePredictionPnlMultiPeriod', () => {
  it('returns identical per-period results to N single-period calls', () => {
    const now = 1_000_000_000_000;
    const PERIOD_MS = {
      '24h': 24 * 3600 * 1000,
      '7d': 7 * 24 * 3600 * 1000,
      '30d': 30 * 24 * 3600 * 1000,
      all: 0,
    } as const;

    // Three resolved markets across different windows
    insertMarket('m1', 1, now - 1 * 3600 * 1000);          // within 24h
    insertMarket('m2', 0, now - 3 * 24 * 3600 * 1000);     // within 7d, not 24h
    insertMarket('m3', 1, now - 20 * 24 * 3600 * 1000);    // within 30d, not 7d

    // Fills: alice (taker) vs bob (maker) on each market
    insertFill({
      txDigest: 't1', eventSeq: '0', poolId: 'prediction:m1',
      maker: '0xbob', taker: '0xalice',
      baseQty: '1000000', quoteQty: '500000',
      takerIsBid: 1, timestampMs: now - 2 * 3600 * 1000, isYes: 1,
    });
    insertFill({
      txDigest: 't2', eventSeq: '0', poolId: 'prediction:m2',
      maker: '0xbob', taker: '0xalice',
      baseQty: '2000000', quoteQty: '800000',
      takerIsBid: 0, timestampMs: now - 4 * 24 * 3600 * 1000, isYes: 0,
    });
    insertFill({
      txDigest: 't3', eventSeq: '0', poolId: 'prediction:m3',
      maker: '0xbob', taker: '0xalice',
      baseQty: '500000', quoteQty: '300000',
      takerIsBid: 1, timestampMs: now - 21 * 24 * 3600 * 1000, isYes: 1,
    });

    const excluded = new Set<string>();
    const periodCutoffs = (['24h', '7d', '30d', 'all'] as const).map((p) => ({
      period: p,
      cutoffMs: PERIOD_MS[p] > 0 ? now - PERIOD_MS[p] : 0,
    }));

    const multi = computePredictionPnlMultiPeriod(periodCutoffs, now, excluded);

    for (const { period, cutoffMs } of periodCutoffs) {
      const single = computePredictionPnl(cutoffMs, now, excluded);
      const fromMulti = multi.get(period);
      expect(fromMulti, `period=${period}`).toBeDefined();
      // Same address set
      expect(new Set(fromMulti!.keys())).toEqual(new Set(single.keys()));
      // Same per-address payload
      for (const [addr, expected] of single) {
        const actual = fromMulti!.get(addr)!;
        expect(actual.realizedPnlRaw, `period=${period} addr=${addr} realizedPnlRaw`).toBe(expected.realizedPnlRaw);
        expect(actual.pnlPercent, `period=${period} addr=${addr} pnlPercent`).toBe(expected.pnlPercent);
        expect(actual.marketCount, `period=${period} addr=${addr} marketCount`).toBe(expected.marketCount);
        expect(actual.volumeQuoteRaw, `period=${period} addr=${addr} volumeQuoteRaw`).toBe(expected.volumeQuoteRaw);
        expect(actual.marketLossesRaw.slice().sort(), `period=${period} addr=${addr} marketLossesRaw`)
          .toEqual(expected.marketLossesRaw.slice().sort());
      }
    }
  });

  it('returns empty per-period maps when no markets are resolved', () => {
    const now = 1_000_000_000_000;
    const periodCutoffs = [
      { period: '24h', cutoffMs: now - 24 * 3600 * 1000 },
      { period: 'all', cutoffMs: 0 },
    ];
    const multi = computePredictionPnlMultiPeriod(periodCutoffs, now, new Set());
    expect(multi.get('24h')!.size).toBe(0);
    expect(multi.get('all')!.size).toBe(0);
  });
});
