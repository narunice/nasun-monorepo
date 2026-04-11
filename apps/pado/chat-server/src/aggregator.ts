import type { LeaderboardConfig, Period, ScoreScope } from './leaderboard-types.js';
import { PERIOD_MS, SCORE } from './leaderboard-types.js';
import {
  aggregateTraderVolume,
  replaceTraderStats,
  getActiveCompetitions,
  aggregateCompetitionVolume,
  replaceCompetitionResults,
  updateCompetition,
  computeTraderPnl,
  replaceTraderPnlStats,
  replaceTraderScores,
  aggregateDailyTraderStats,
  aggregateUniquePools,
  clearTraderScores,
  rotatePrevRanks,
  getIndexerState,
  setIndexerState,
  generateScoreSnapshot,
  purgeOldScoreSnapshots,
} from './leaderboard-store.js';

// PnL data cached during PnL aggregation, consumed by score aggregation
let cachedPnlByAddress: Map<string, { realizedPnlRaw: number; pnlPercent: number }> = new Map();
let cachedWeeklyPnlByAddress: Map<string, { realizedPnlRaw: number; pnlPercent: number }> = new Map();

let config: LeaderboardConfig | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshotDate: string | null = null;

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];
const AGGREGATION_LIMIT = 500;
const SNAPSHOT_HOUR_KST = 9; // Generate snapshot at 09:00 KST (00:00 UTC)
const SNAPSHOT_RETENTION_DAYS = 180;

/**
 * Run aggregation for all periods.
 * Computes per-trader volume, ranks, and rank changes.
 */
function runAggregation(): void {
  if (!config) return;

  const start = Date.now();

  for (const period of PERIODS) {
    const cutoff = PERIOD_MS[period] > 0 ? Date.now() - PERIOD_MS[period] : 0;

    const traders = aggregateTraderVolume(cutoff, config.excludedAddresses, AGGREGATION_LIMIT);

    const ranked = traders.map((t, index) => ({
      address: t.address,
      volumeQuote: t.volume_quote,
      tradeCount: t.trade_count,
      uniquePools: t.unique_pools,
      lastTradeAt: t.last_trade_at,
      rank: index + 1,
    }));

    replaceTraderStats(period, ranked);
  }

  // Aggregate PnL rankings
  runPnlAggregation();

  // Aggregate scores (weekly + alltime)
  runScoreAggregation();

  // Aggregate active competitions
  runCompetitionAggregation();

  const elapsed = Date.now() - start;
  if (elapsed > 1000) {
    console.log(`[Aggregator] Completed in ${elapsed}ms`);
  }
}

/**
 * Run PnL aggregation for all periods.
 * Uses weighted average cost basis to compute realized PnL per trader.
 */
function runPnlAggregation(): void {
  if (!config) return;

  for (const period of PERIODS) {
    const cutoff = PERIOD_MS[period] > 0 ? Date.now() - PERIOD_MS[period] : 0;

    const traders = computeTraderPnl(cutoff, config.excludedAddresses, AGGREGATION_LIMIT);

    // Cache "all" period PnL data for score aggregation
    if (period === 'all') {
      cachedPnlByAddress = new Map();
      for (const t of traders) {
        cachedPnlByAddress.set(t.address, {
          realizedPnlRaw: t.realizedPnlRaw,
          pnlPercent: t.pnlPercent,
        });
      }
    }

    const ranked = traders.map((t, index) => ({
      address: t.address,
      realizedPnlRaw: t.realizedPnlRaw,
      pnlPercent: t.pnlPercent,
      tradeCount: t.tradeCount,
      rank: index + 1,
    }));

    replaceTraderPnlStats(period, ranked);
  }

  // Cache weekly PnL for score aggregation
  const weekStartMs = getCurrentWeekStartMs();
  const weeklyPnlTraders = computeTraderPnl(weekStartMs, config.excludedAddresses, AGGREGATION_LIMIT);
  cachedWeeklyPnlByAddress = new Map();
  for (const t of weeklyPnlTraders) {
    cachedWeeklyPnlByAddress.set(t.address, {
      realizedPnlRaw: t.realizedPnlRaw,
      pnlPercent: t.pnlPercent,
    });
  }
}

/**
 * Compute scores for all traders with daily caps.
 * Runs for both 'weekly' and 'alltime' scopes.
 */
function runScoreAggregation(): void {
  if (!config) return;

  const weekStartMs = getCurrentWeekStartMs();

  // Weekly boundary check + reset
  const savedWeekStart = getIndexerState('current_week_start');
  if (!savedWeekStart || parseInt(savedWeekStart) < weekStartMs) {
    clearTraderScores('weekly');
    setIndexerState('current_week_start', String(weekStartMs));
  }

  // prev_rank 24h rotation
  const lastRotation = getIndexerState('last_rank_rotation');
  const ROTATION_INTERVAL = 24 * 60 * 60 * 1000;
  if (!lastRotation || (Date.now() - parseInt(lastRotation)) >= ROTATION_INTERVAL) {
    rotatePrevRanks();
    setIndexerState('last_rank_rotation', String(Date.now()));
  }

  computeAndStoreScores('weekly', weekStartMs);
  computeAndStoreScores('alltime', 0);
}

function computeAndStoreScores(scope: ScoreScope, cutoffMs: number): void {
  if (!config) return;

  const dailyStatsMap = aggregateDailyTraderStats(cutoffMs, config.excludedAddresses);
  const uniquePoolsMap = aggregateUniquePools(cutoffMs, config.excludedAddresses);
  const pnlMap = scope === 'weekly' ? cachedWeeklyPnlByAddress : cachedPnlByAddress;

  const allAddresses = new Set([...dailyStatsMap.keys(), ...uniquePoolsMap.keys(), ...pnlMap.keys()]);
  if (allAddresses.size === 0) return;

  const scoreData: Array<{
    address: string; totalScore: number; scoreFromTrades: number;
    scoreFromVolume: number; scoreFromDiversity: number; scoreFromPnl: number;
    tradeCount: number; volumeQuote: string;
  }> = [];

  for (const address of allAddresses) {
    const days = dailyStatsMap.get(address) ?? [];
    let tradeScore = 0, volumeScore = 0, totalTrades = 0, totalVolume = 0n;

    for (const day of days) {
      const cappedTrades = Math.min(day.trade_count, SCORE.DAILY_TRADE_CAP);
      tradeScore += cappedTrades * SCORE.PER_TRADE;

      const volumeUsd = Number(BigInt(day.volume_raw) / BigInt(1_000_000));
      const cappedVolumeUsd = Math.min(volumeUsd, SCORE.DAILY_VOLUME_CAP_USD);
      volumeScore += Math.floor(cappedVolumeUsd / 2000) * SCORE.PER_2K_VOLUME;

      totalTrades += day.trade_count;
      totalVolume += BigInt(day.volume_raw);
    }

    const diversityScore = (uniquePoolsMap.get(address) ?? 0) * SCORE.PER_UNIQUE_POOL;

    let pnlScore = 0;
    const pnlData = pnlMap.get(address);
    if (pnlData) {
      if (pnlData.realizedPnlRaw > 0) {
        pnlScore += Math.floor(pnlData.realizedPnlRaw / 1_000_000_000) * SCORE.PER_1K_PROFIT;
      }
      const returnScore = Math.floor(pnlData.pnlPercent / 5) * SCORE.PER_5PCT_RETURN;
      pnlScore += Math.max(0, returnScore);
    }

    scoreData.push({
      address,
      totalScore: tradeScore + volumeScore + diversityScore + pnlScore,
      scoreFromTrades: tradeScore,
      scoreFromVolume: volumeScore,
      scoreFromDiversity: diversityScore,
      scoreFromPnl: pnlScore,
      tradeCount: totalTrades,
      volumeQuote: String(totalVolume),
    });
  }

  scoreData.sort((a, b) => b.totalScore - a.totalScore);
  const ranked = scoreData.slice(0, AGGREGATION_LIMIT).map((t, i) => ({
    ...t,
    rank: i + 1,
  }));

  replaceTraderScores(scope, ranked);
}

/** Get current week's Monday UTC 00:00 timestamp */
function getCurrentWeekStartMs(): number {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff, 0, 0, 0, 0
  ));
  return monday.getTime();
}

/**
 * Aggregate results for active competitions and auto-transition statuses.
 */
function runCompetitionAggregation(): void {
  if (!config) return;

  const now = Date.now();
  const competitions = getActiveCompetitions();

  for (const comp of competitions) {
    // Auto-transition: upcoming -> active
    if (comp.status === 'upcoming' && now >= comp.start_ms && now <= comp.end_ms) {
      updateCompetition(comp.id, { status: 'active' });
      comp.status = 'active';
      console.log(`[Aggregator] Competition "${comp.title}" is now active`);
    }

    // Auto-transition: active -> ended
    if (comp.status === 'active' && now > comp.end_ms) {
      updateCompetition(comp.id, { status: 'ended' });
      console.log(`[Aggregator] Competition "${comp.title}" has ended`);
    }

    // Aggregate results for active competitions
    if (comp.status === 'active') {
      const traders = aggregateCompetitionVolume(
        comp.start_ms,
        Math.min(now, comp.end_ms),
        config.excludedAddresses,
        AGGREGATION_LIMIT,
      );

      const ranked = traders.map((t, index) => ({
        address: t.address,
        volumeQuote: t.volume_quote,
        tradeCount: t.trade_count,
        rank: index + 1,
      }));

      replaceCompetitionResults(comp.id, ranked);
    }
  }
}

/**
 * Check if it's time to generate a daily snapshot and do so if needed.
 * Runs at SNAPSHOT_HOUR_KST (09:00 KST). Idempotent via date key.
 */
function checkDailySnapshot(): void {
  // Use KST (UTC+9) for date calculation
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  const kstHour = kstDate.getUTCHours();
  const today = kstDate.toISOString().slice(0, 10); // YYYY-MM-DD in KST

  // Only trigger at or after the snapshot hour, and only once per date
  if (kstHour < SNAPSHOT_HOUR_KST) return;
  if (lastSnapshotDate === today) return;

  try {
    const count = generateScoreSnapshot(today);
    lastSnapshotDate = today;

    if (count > 0) {
      console.log(`[Snapshot] Generated daily points snapshot for ${today}: ${count} traders`);

      // Purge old snapshots periodically (only when a new snapshot is created)
      const purged = purgeOldScoreSnapshots(SNAPSHOT_RETENTION_DAYS);
      if (purged > 0) {
        console.log(`[Snapshot] Purged ${purged} old snapshot entries (>${SNAPSHOT_RETENTION_DAYS} days)`);
      }
    } else {
      console.log(`[Snapshot] Snapshot for ${today} already exists, skipped`);
    }
  } catch (err) {
    console.error('[Snapshot] Error generating daily snapshot:', (err as Error).message);
  }
}

export function startAggregator(cfg: LeaderboardConfig): void {
  config = cfg;

  console.log(`[Aggregator] Starting (interval: ${cfg.aggregationIntervalMs}ms)`);

  // Run immediately on start
  try {
    runAggregation();
    console.log('[Aggregator] Initial aggregation complete');
  } catch (err) {
    console.error('[Aggregator] Initial aggregation error:', (err as Error).message);
  }

  // Check for daily snapshot on startup
  checkDailySnapshot();

  // Schedule periodic runs
  timer = setInterval(() => {
    try {
      runAggregation();
    } catch (err) {
      console.error('[Aggregator] Error:', (err as Error).message);
    }
  }, cfg.aggregationIntervalMs);

  // Check for daily snapshot every 10 minutes
  snapshotTimer = setInterval(checkDailySnapshot, 10 * 60 * 1000);
}

export function stopAggregator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  console.log('[Aggregator] Stopped');
}
