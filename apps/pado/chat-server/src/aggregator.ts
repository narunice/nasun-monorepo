import type { LeaderboardConfig, Period } from './leaderboard-types.js';
import { PERIOD_MS } from './leaderboard-types.js';
import {
  aggregateTraderVolume,
  getCurrentRanks,
  replaceTraderStats,
} from './leaderboard-store.js';

let config: LeaderboardConfig | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];

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
    const traders = aggregateTraderVolume(cutoff, config.excludedAddresses, 100);

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

  const elapsed = Date.now() - start;
  if (elapsed > 1000) {
    console.log(`[Aggregator] Completed in ${elapsed}ms`);
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
