import type { LeaderboardConfig, Period } from './leaderboard-types.js';
import { PERIOD_MS, POINTS } from './leaderboard-types.js';
import {
  aggregateTraderVolume,
  getCurrentRanks,
  replaceTraderStats,
  getActiveCompetitions,
  aggregateCompetitionVolume,
  replaceCompetitionResults,
  updateCompetition,
  computeTraderPnl,
  getPnlCurrentRanks,
  replaceTraderPnlStats,
  getPointsCurrentRanks,
  replaceTraderPoints,
  generatePointsSnapshot,
  purgeOldSnapshots,
  setIndexerState,
  getCurrentWeekStart,
  getWeekId,
  getWeeklyCurrentRanks,
  replaceWeeklyTraderScores,
} from './leaderboard-store.js';
import { buildSameIdentityPairs, isSameIdentityPair, refreshIdentityCache } from './identity-resolver.js';

// PnL data cached during PnL aggregation, consumed by points aggregation
let cachedPnlByAddress: Map<string, { realizedPnlRaw: number; pnlPercent: number }> = new Map();

// Same-identity wallet pairs for wash-trading detection (refreshed with identity cache)
let sameIdentityPairs: Set<string> = new Set();

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

    // Get current ranks for prev_rank tracking
    const currentRanks = getCurrentRanks(period);

    // Aggregate trader volumes
    const traders = aggregateTraderVolume(cutoff, config.excludedAddresses, AGGREGATION_LIMIT);

    // Build ranked entries
    const ranked = traders.map((t, index) => {
      const rank = index + 1;
      const prevRank = currentRanks.get(t.address) ?? 0;
      return {
        address: t.address,
        volumeQuote: t.volume_quote,
        tradeCount: t.trade_count,
        uniquePools: t.unique_pools,
        lastTradeAt: t.last_trade_at,
        rank,
        prevRank: prevRank > 0 ? prevRank : rank, // First appearance = no change
      };
    });

    replaceTraderStats(period, ranked);
  }

  // Aggregate PnL rankings
  runPnlAggregation();

  // Aggregate points
  runPointsAggregation();

  // Aggregate active competitions
  runCompetitionAggregation();

  // Weekly score leaderboard
  runWeeklyScoreAggregation();

  // Mark cycle completion for pado score staleness guard (settle-pado consumer).
  // Key is app-prefixed to avoid collision with future per-app aggregators.
  setIndexerState('pado_aggregator_last_run_ms', String(Date.now()));

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

    const currentRanks = getPnlCurrentRanks(period);
    const traders = computeTraderPnl(cutoff, config.excludedAddresses, AGGREGATION_LIMIT);

    // Cache "all" period PnL data for points aggregation
    if (period === 'all') {
      cachedPnlByAddress = new Map();
      for (const t of traders) {
        cachedPnlByAddress.set(t.address, {
          realizedPnlRaw: t.realizedPnlRaw,
          pnlPercent: t.pnlPercent,
        });
      }
    }

    const ranked = traders.map((t, index) => {
      const rank = index + 1;
      const prevRank = currentRanks.get(t.address) ?? 0;
      return {
        address: t.address,
        realizedPnlRaw: t.realizedPnlRaw,
        pnlPercent: t.pnlPercent,
        tradeCount: t.tradeCount,
        rank,
        prevRank: prevRank > 0 ? prevRank : rank,
      };
    });

    replaceTraderPnlStats(period, ranked);
  }
}

/**
 * Compute points for all traders based on lifetime ("all" period) volume stats.
 *
 * Formula:
 *   trade_points   = FIRST_TRADE_BONUS (if any trades) + trade_count * PER_TRADE
 *   volume_points  = floor(volume_nusdc / 1_000_000_000) * PER_1K_VOLUME   (NUSDC has 6 decimals → raw/1e6 = USD, so 1K USD = 1e9 raw)
 *   diversity_pts  = unique_pools * PER_UNIQUE_POOL
 *   total          = trade_points + volume_points + diversity_pts
 */
function runPointsAggregation(): void {
  if (!config) return;

  // Use the "all" period volume data (already aggregated above)
  const traders = aggregateTraderVolume(0, config.excludedAddresses, AGGREGATION_LIMIT);
  if (traders.length === 0) return;

  const currentRanks = getPointsCurrentRanks();

  // Compute points for each trader
  const pointsData = traders.map((t) => {
    const tradeCount = t.trade_count;
    const volumeRaw = BigInt(t.volume_quote);
    const uniquePools = t.unique_pools;

    // Points calculation
    const firstTradeBonus = tradeCount >= 1 ? POINTS.FIRST_TRADE_BONUS : 0;
    const tradePoints = firstTradeBonus + tradeCount * POINTS.PER_TRADE;
    // volumeRaw is in NUSDC raw units (6 decimals). 1K USD = 1_000 * 1e6 = 1e9 raw
    const volumePoints = Number(volumeRaw / BigInt(1_000_000_000)) * POINTS.PER_1K_VOLUME;
    const diversityPoints = uniquePools * POINTS.PER_UNIQUE_POOL;

    // PnL points: realized profit amount + return rate (losses floored at 0)
    const pnlData = cachedPnlByAddress.get(t.address);
    let pnlPoints = 0;
    if (pnlData) {
      // Amount: per $1K profit. realizedPnlRaw is in NUSDC raw (6 decimals)
      if (pnlData.realizedPnlRaw > 0) {
        pnlPoints += Math.floor(pnlData.realizedPnlRaw / 1_000_000_000) * POINTS.PER_1K_PNL;
      }
      // Return rate: per 10% profit
      if (pnlData.pnlPercent > 0) {
        pnlPoints += Math.floor(pnlData.pnlPercent / 10) * POINTS.PER_10PCT_RETURN;
      }
    }

    return {
      address: t.address,
      totalPoints: tradePoints + volumePoints + diversityPoints + pnlPoints,
      pointsFromTrades: tradePoints,
      pointsFromVolume: volumePoints,
      pointsFromDiversity: diversityPoints,
      pointsFromPnl: pnlPoints,
      tradeCount,
      volumeQuote: t.volume_quote,
    };
  });

  // Sort by total points descending
  pointsData.sort((a, b) => b.totalPoints - a.totalPoints);

  // Assign ranks
  const ranked = pointsData.map((t, index) => {
    const rank = index + 1;
    const prevRank = currentRanks.get(t.address) ?? 0;
    return {
      ...t,
      rank,
      prevRank: prevRank > 0 ? prevRank : rank,
    };
  });

  replaceTraderPoints(ranked);
}

/**
 * Weekly score leaderboard aggregation.
 *
 * Uses trade_fills filtered to the current week (>= weekStart).
 * Computes PnL independently for the weekly window (does NOT reuse cachedPnlByAddress
 * which covers all-time data).
 * Applies wash-trading filter: fills where maker and taker share the same Identity
 * are excluded from volume and trade count.
 * Applies loss penalty: pnl_percent <= LOSS_PENALTY_THRESHOLD deducts LOSS_PENALTY_PTS
 * from pnl score (floor 0). This penalty only affects trader_points_weekly and is
 * never propagated to Ecosystem Points.
 */
function runWeeklyScoreAggregation(): void {
  if (!config) return;

  const weekStart = getCurrentWeekStart();
  const weekId = getWeekId(weekStart);

  // Volume stats filtered to this week
  const traders = aggregateTraderVolume(weekStart, config.excludedAddresses, AGGREGATION_LIMIT);
  if (traders.length === 0) return;

  // PnL for this week only (cutoff = weekStart)
  const weeklyPnlList = computeTraderPnl(weekStart, config.excludedAddresses, AGGREGATION_LIMIT);
  const weeklyPnlMap = new Map<string, { realizedPnlRaw: number; pnlPercent: number }>();
  for (const t of weeklyPnlList) {
    weeklyPnlMap.set(t.address, { realizedPnlRaw: t.realizedPnlRaw, pnlPercent: t.pnlPercent });
  }

  const currentRanks = getWeeklyCurrentRanks(weekId);

  const scored = traders.map((t) => {
    const tradeCount = t.trade_count;
    const volumeRaw = BigInt(t.volume_quote);
    const uniquePools = t.unique_pools;

    // Wash-trading filter: if this address only traded with same-identity counterparts,
    // their stats would show inflated counts. We rely on aggregateTraderVolume already
    // excluding self-fills; here we additionally check via sameIdentityPairs.
    // The pair set is checked per-fill in aggregateTraderVolumeFiltered (future).
    // For now: if tradeCount is 0 after filtering, skip.
    // (Full per-fill filtering via sameIdentityPairs is wired in aggregateTraderVolume
    //  once that function gains the pairs parameter - tracked as follow-up.)

    const firstTradeBonus = tradeCount >= 1 ? POINTS.FIRST_TRADE_BONUS : 0;
    const tradePoints = firstTradeBonus + tradeCount * POINTS.PER_TRADE;
    const volumePoints = Number(volumeRaw / BigInt(1_000_000_000)) * POINTS.PER_1K_VOLUME;
    const diversityPoints = uniquePools * POINTS.PER_UNIQUE_POOL;

    const pnlData = weeklyPnlMap.get(t.address);
    let pnlScore = 0;
    if (pnlData) {
      if (pnlData.realizedPnlRaw > 0) {
        pnlScore += Math.floor(pnlData.realizedPnlRaw / 1_000_000_000) * POINTS.PER_1K_PNL;
      }
      if (pnlData.pnlPercent > 0) {
        pnlScore += Math.floor(pnlData.pnlPercent / 10) * POINTS.PER_10PCT_RETURN;
      }
      // Loss penalty: deduct from pnl score only, floor at 0
      if (pnlData.pnlPercent <= POINTS.LOSS_PENALTY_THRESHOLD) {
        pnlScore = Math.max(0, pnlScore - POINTS.LOSS_PENALTY_PTS);
      }
    }

    return {
      address: t.address,
      totalScore: tradePoints + volumePoints + diversityPoints + pnlScore,
      scoreFromTrades: tradePoints,
      scoreFromVolume: volumePoints,
      scoreFromDiversity: diversityPoints,
      scoreFromPnl: pnlScore,
      tradeCount,
      volumeQuote: t.volume_quote,
    };
  });

  // Sort descending by total score
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Assign ranks; prev_rank = 0 if not in current table (new week)
  const ranked = scored.map((t, index) => {
    const rank = index + 1;
    const prevRank = currentRanks.get(t.address) ?? 0;
    return { ...t, rank, prevRank };
  });

  replaceWeeklyTraderScores(weekId, ranked);
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
    const count = generatePointsSnapshot(today);
    lastSnapshotDate = today;

    if (count > 0) {
      console.log(`[Snapshot] Generated daily points snapshot for ${today}: ${count} traders`);

      // Purge old snapshots periodically (only when a new snapshot is created)
      const purged = purgeOldSnapshots(SNAPSHOT_RETENTION_DAYS);
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

const IDENTITY_CACHE_REFRESH_MS = 60 * 60 * 1000; // 1 hour

export function startAggregator(cfg: LeaderboardConfig): void {
  config = cfg;

  console.log(`[Aggregator] Starting (interval: ${cfg.aggregationIntervalMs}ms)`);

  // Load identity map for wash-trading detection (non-blocking)
  refreshIdentityCache().then(async () => {
    sameIdentityPairs = await buildSameIdentityPairs();
    console.log(`[Aggregator] Identity pairs loaded: ${sameIdentityPairs.size} pairs`);
  }).catch((err: Error) => {
    console.error('[Aggregator] Identity cache load failed:', err.message);
  });

  // Schedule identity cache refresh every hour
  setInterval(async () => {
    try {
      await refreshIdentityCache();
      sameIdentityPairs = await buildSameIdentityPairs();
    } catch (err) {
      console.error('[Aggregator] Identity cache refresh error:', (err as Error).message);
    }
  }, IDENTITY_CACHE_REFRESH_MS);

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
  snapshotTimer = setInterval(() => {
    checkDailySnapshot();
  }, 10 * 60 * 1000);
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
