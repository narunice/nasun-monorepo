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
} from './leaderboard-store.js';

let config: LeaderboardConfig | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];
const AGGREGATION_LIMIT = 500;

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

    return {
      address: t.address,
      totalPoints: tradePoints + volumePoints + diversityPoints,
      pointsFromTrades: tradePoints,
      pointsFromVolume: volumePoints,
      pointsFromDiversity: diversityPoints,
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

  // Schedule periodic runs
  timer = setInterval(() => {
    try {
      runAggregation();
    } catch (err) {
      console.error('[Aggregator] Error:', (err as Error).message);
    }
  }, cfg.aggregationIntervalMs);
}

export function stopAggregator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log('[Aggregator] Stopped');
}
