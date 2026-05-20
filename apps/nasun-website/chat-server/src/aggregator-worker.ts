/**
 * Aggregator Worker Thread.
 *
 * Runs the leaderboard aggregation cycle (volume/PnL/points/competition/weekly) in
 * a dedicated worker thread to keep the main HTTP/WebSocket event loop responsive.
 *
 * Design (2026-05-14):
 *   - V8 isolation: this module has its own better-sqlite3 connection, its own
 *     identity/banned caches, its own cycle interval. Main thread keeps separate
 *     identity/banned caches for leaderboard-api hot reads.
 *   - WAL + busy_timeout: indexer (main) writes fills/order_events; this worker
 *     writes trader_stats/points/competition. WAL allows concurrent readers and
 *     serializes writers; busy_timeout=5000 in initLeaderboardStore covers the
 *     overlap window.
 *   - Identity/banned refresh: this worker independently refreshes its own copies
 *     on the original intervals. Cost: 2x backend fetches at 1h/5min — trivial.
 *   - Shutdown: main posts {type:'shutdown'} → we clearInterval + closeLeaderboardStore.
 *
 * Replaces the in-process runAggregation that previously blocked the main event
 * loop for 22.7s every 60s (2026-05-13 incident — see project memory).
 */

import { parentPort, workerData } from 'node:worker_threads';
import type { LeaderboardConfig, Period } from './leaderboard-types.js';
import { PERIOD_MS, POINTS } from './leaderboard-types.js';
import {
  initLeaderboardStore,
  closeLeaderboardStore,
  aggregateTraderVolume,
  aggregateWeeklyTraderVolume,
  getCurrentRanks,
  replaceTraderStats,
  getActiveCompetitions,
  aggregateCompetitionVolume,
  replaceCompetitionResults,
  updateCompetition,
  computeTraderPnl,
  computeTraderPnlMultiPeriod,
  computePredictionPnl,
  getPnlCurrentRanks,
  replaceTraderPnlStats,
  getPointsCurrentRanks,
  replaceTraderPoints,
  setIndexerState,
  getCurrentWeekStart,
  getWeekId,
  getWeeklyCurrentRanks,
  replaceWeeklyTraderScores,
  countWeeklyUniqueTraders,
  setWeeklyParticipantCount,
} from './leaderboard-store.js';
import type { PredictionPnlResult } from './leaderboard-store.js';
import { buildSameIdentityPairs, refreshIdentityCache, getIdentityMap, getSocialBadgesBatch } from './identity-resolver.js';
import { backgroundRefreshBannedCache, getBannedSnapshotSync, refreshBannedCache } from './banned-loader.js';

if (!parentPort) {
  throw new Error('aggregator-worker.ts must be loaded as a worker_thread');
}
if (!workerData) {
  throw new Error('aggregator-worker.ts requires workerData (LeaderboardConfig)');
}

const config: LeaderboardConfig = workerData as LeaderboardConfig;

// PnL data cached during PnL aggregation, consumed by points aggregation
let cachedPnlByAddress: Map<string, { realizedPnlRaw: number; pnlPercent: number }> = new Map();

// Volume data for 'all' period cached during runAggregation, consumed by runPointsAggregation
// to avoid re-running the heaviest full-table scan twice per cycle.
let cachedAllPeriodTraders: ReturnType<typeof aggregateTraderVolume> = [];

// Same-identity wallet pairs for wash-trading detection (refreshed with identity cache)
let sameIdentityPairs: Set<string> = new Set();

let timer: ReturnType<typeof setInterval> | null = null;
let identityInterval: ReturnType<typeof setInterval> | null = null;
let bannedInterval: ReturnType<typeof setInterval> | null = null;

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];
const AGGREGATION_LIMIT = 20000;

const IDENTITY_CACHE_REFRESH_MS = 60 * 60 * 1000; // 1 hour
const BANNED_CACHE_REFRESH_MS = 5 * 60 * 1000;    // 5 minutes

/**
 * Effective exclusion set: static config (team/test wallets) ∪ banned wallets.
 */
function getEffectiveExcludedAddresses(): Set<string> {
  const banned = getBannedSnapshotSync().addresses;
  if (banned.size === 0) return config.excludedAddresses;
  const merged = new Set<string>(config.excludedAddresses);
  for (const a of banned) merged.add(a);
  return merged;
}

function runAggregation(): void {
  const start = Date.now();
  const phaseTimes: Record<string, number> = {};
  const volumePerPeriod: Record<string, number> = {};

  for (const period of PERIODS) {
    const periodStart = Date.now();
    const cutoff = PERIOD_MS[period] > 0 ? Date.now() - PERIOD_MS[period] : 0;

    const currentRanks = getCurrentRanks(period);
    const traders = aggregateTraderVolume(cutoff, getEffectiveExcludedAddresses(), AGGREGATION_LIMIT);

    if (period === 'all') {
      cachedAllPeriodTraders = traders;
    }

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
        prevRank: prevRank > 0 ? prevRank : rank,
      };
    });

    replaceTraderStats(period, ranked);
    volumePerPeriod[period] = Date.now() - periodStart;
  }
  phaseTimes.volume = Object.values(volumePerPeriod).reduce((a, b) => a + b, 0);

  const pnlStart = Date.now();
  runPnlAggregation();
  phaseTimes.pnl = Date.now() - pnlStart;

  const pointsStart = Date.now();
  runPointsAggregation();
  phaseTimes.points = Date.now() - pointsStart;

  const compStart = Date.now();
  runCompetitionAggregation();
  phaseTimes.competition = Date.now() - compStart;

  // Weekly score runs async (DynamoDB social-badge fetch). Sync portion still
  // counts toward cycle elapsed; async portion logs separately on completion.
  const weeklyStart = Date.now();
  const weeklyPromise = runWeeklyScoreAggregation();
  phaseTimes.weeklySync = Date.now() - weeklyStart;
  weeklyPromise
    .then(() => {
      const wElapsed = Date.now() - weeklyStart;
      if (wElapsed > 5000) {
        console.log(`[Aggregator] Weekly score completed in ${wElapsed}ms (sync_portion=${phaseTimes.weeklySync}ms)`);
      }
    })
    .catch((err: unknown) => {
      console.error('[Aggregator] Weekly score aggregation error:', (err as Error).message);
    });

  // Mark cycle completion for pado score staleness guard (settle-pado consumer).
  setIndexerState('pado_aggregator_last_run_ms', String(Date.now()));

  const elapsed = Date.now() - start;
  if (elapsed > 1000) {
    const volumeBreakdown = Object.entries(volumePerPeriod)
      .map(([p, ms]) => `${p}=${ms}ms`).join(' ');
    const measured = (phaseTimes.volume ?? 0) + (phaseTimes.pnl ?? 0) +
      (phaseTimes.points ?? 0) + (phaseTimes.competition ?? 0) + (phaseTimes.weeklySync ?? 0);
    const unmeasured = elapsed - measured;
    console.log(
      `[Aggregator] Completed in ${elapsed}ms ` +
      `(volume=${phaseTimes.volume}ms [${volumeBreakdown}], ` +
      `pnl=${phaseTimes.pnl}ms, points=${phaseTimes.points}ms, ` +
      `comp=${phaseTimes.competition}ms, weeklySync=${phaseTimes.weeklySync}ms, ` +
      `other=${unmeasured}ms)`,
    );
  }
  // 80%-of-interval overlap warning is no longer load-bearing now that the
  // cycle runs on a worker thread (main event loop is unaffected); keep the
  // log so operators still see a signal if cycles back up.
  if (elapsed > config.aggregationIntervalMs * 0.8) {
    console.warn(
      `[Aggregator] Cycle elapsed ${elapsed}ms is over 80% of interval ` +
      `${config.aggregationIntervalMs}ms — next cycle may overlap or lag.`,
    );
  }
}

function runPnlAggregation(): void {
  // Spot PnL: single union-all scan that buckets all PERIODS via CASE WHEN
  // aggregates, replacing N per-period computeTraderPnl calls. wash filter
  // intentionally NOT passed to preserve equivalence with the prior per-call
  // path which also omitted it (weekly path at line 358 keeps wash filter
  // separately). This is the 2026-05-19 incident's structural fix — the
  // function existed (leaderboard-store.ts:1635) but had never been wired in.
  const now = Date.now();
  const excluded = getEffectiveExcludedAddresses();
  const periodCutoffs = PERIODS.map((period) => ({
    period,
    cutoffMs: PERIOD_MS[period] > 0 ? now - PERIOD_MS[period] : 0,
  }));
  const spotByPeriod = computeTraderPnlMultiPeriod(periodCutoffs, excluded, AGGREGATION_LIMIT);

  for (const period of PERIODS) {
    const cutoff = PERIOD_MS[period] > 0 ? now - PERIOD_MS[period] : 0;

    const currentRanks = getPnlCurrentRanks(period);

    const spotTraders = spotByPeriod.get(period) ?? [];
    const predictionMap = computePredictionPnl(cutoff, now, excluded, sameIdentityPairs);

    interface CombinedPnl { realizedPnlRaw: number; spotCostBasis: number; predCostBasis: number; tradeCount: number; spotPnlPercent: number; }
    const combined = new Map<string, CombinedPnl>();

    for (const t of spotTraders) {
      const spotCostBasis = t.pnlPercent !== 0
        ? Math.abs(t.realizedPnlRaw / (t.pnlPercent / 100))
        : 0;
      combined.set(t.address, {
        realizedPnlRaw: t.realizedPnlRaw,
        spotCostBasis,
        predCostBasis: 0,
        tradeCount: t.tradeCount,
        spotPnlPercent: t.pnlPercent,
      });
    }

    for (const [address, pred] of predictionMap) {
      const predCostBasis = pred.pnlPercent !== 0
        ? Math.abs(pred.realizedPnlRaw / (pred.pnlPercent / 100))
        : 0;
      const existing = combined.get(address);
      if (existing) {
        existing.realizedPnlRaw += pred.realizedPnlRaw;
        existing.predCostBasis = predCostBasis;
      } else {
        combined.set(address, {
          realizedPnlRaw: pred.realizedPnlRaw,
          spotCostBasis: 0,
          predCostBasis,
          tradeCount: 0,
          spotPnlPercent: 0,
        });
      }
    }

    if (period === 'all') {
      cachedPnlByAddress = new Map();
      for (const t of spotTraders) {
        cachedPnlByAddress.set(t.address, {
          realizedPnlRaw: t.realizedPnlRaw,
          pnlPercent: t.pnlPercent,
        });
      }
    }

    const merged = [...combined.entries()].map(([address, c]) => {
      const totalCost = c.spotCostBasis + c.predCostBasis;
      const pnlPercent = totalCost > 0
        ? Math.round((c.realizedPnlRaw / totalCost) * 10000) / 100
        : 0;
      return {
        address,
        realizedPnlRaw: Math.round(c.realizedPnlRaw),
        pnlPercent,
        tradeCount: c.tradeCount,
      };
    });

    merged.sort((a, b) => b.realizedPnlRaw - a.realizedPnlRaw);
    const top = merged.slice(0, AGGREGATION_LIMIT);

    const ranked = top.map((t, index) => {
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

function runPointsAggregation(): void {
  const traders = cachedAllPeriodTraders;
  if (traders.length === 0) return;

  const currentRanks = getPointsCurrentRanks();

  const pointsData = traders.map((t) => {
    const tradeCount = t.trade_count;
    const volumeRaw = BigInt(t.volume_quote);
    const uniquePools = t.unique_pools;

    const firstTradeBonus = tradeCount >= 1 ? POINTS.FIRST_TRADE_BONUS : 0;
    const tradePoints = firstTradeBonus + tradeCount * POINTS.PER_TRADE;
    const volumePoints = Number(volumeRaw / BigInt(500_000_000)) * POINTS.PER_500_VOLUME;
    const diversityPoints = uniquePools * POINTS.PER_UNIQUE_POOL;

    const pnlData = cachedPnlByAddress.get(t.address);
    let pnlPoints = 0;
    if (pnlData) {
      if (pnlData.realizedPnlRaw > 0) {
        pnlPoints += Math.floor(pnlData.realizedPnlRaw / 10_000_000) * POINTS.PER_10_PNL;
      }
      if (pnlData.pnlPercent > 0) {
        pnlPoints += Math.floor(pnlData.pnlPercent / 5) * POINTS.PER_5PCT_RETURN;
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

  // Deterministic tiebreaker chain (alltime points): totalPoints desc →
  // volume desc → trade count desc → address asc.
  pointsData.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const av = BigInt(a.volumeQuote), bv = BigInt(b.volumeQuote);
    if (bv !== av) return bv > av ? 1 : -1;
    if (b.tradeCount !== a.tradeCount) return b.tradeCount - a.tradeCount;
    return a.address < b.address ? -1 : a.address > b.address ? 1 : 0;
  });

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

async function runWeeklyScoreAggregation(): Promise<void> {
  if (POINTS.DAILY_TRADE_CAP < 1) {
    throw new Error(`DAILY_TRADE_CAP must be >= 1, got ${POINTS.DAILY_TRADE_CAP}. Check leaderboard-types.ts POINTS config.`);
  }

  const weekStart = getCurrentWeekStart();
  const weekId = getWeekId(weekStart);

  const rawTraders = aggregateWeeklyTraderVolume(weekStart, getEffectiveExcludedAddresses(), POINTS.DAILY_TRADE_CAP, AGGREGATION_LIMIT, sameIdentityPairs);
  if (rawTraders.length === 0) return;

  const fullIdentityMap = await getIdentityMap();
  const identityMap = new Map<string, string>();
  for (const t of rawTraders) {
    const addr = t.address.toLowerCase();
    const id = fullIdentityMap.get(addr);
    if (id) identityMap.set(addr, id);
  }
  const traders = rawTraders.filter((t) => identityMap.has(t.address.toLowerCase()));
  if (traders.length === 0) return;

  const weeklyPnlList = computeTraderPnl(weekStart, getEffectiveExcludedAddresses(), AGGREGATION_LIMIT, sameIdentityPairs);
  const weeklyPnlMap = new Map<string, { realizedPnlRaw: number; pnlPercent: number }>();
  for (const t of weeklyPnlList) {
    weeklyPnlMap.set(t.address, { realizedPnlRaw: t.realizedPnlRaw, pnlPercent: t.pnlPercent });
  }

  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const predictionPnlMap = computePredictionPnl(
    weekStart,
    weekEnd,
    getEffectiveExcludedAddresses(),
    sameIdentityPairs,
  );

  const prevWeekStart = getCurrentWeekStart() - 7 * 24 * 60 * 60 * 1000;
  const prevWeekId = getWeekId(prevWeekStart);
  const baselineRanks = getWeeklyCurrentRanks(prevWeekId);

  const scored = traders.map((t) => {
    const tradeCount = t.trade_count;
    const volumeRaw = BigInt(t.volume_quote);
    const uniquePools = t.unique_pools;

    const firstTradeBonus = tradeCount >= 1 ? POINTS.FIRST_TRADE_BONUS : 0;
    const tradePoints = firstTradeBonus + tradeCount * POINTS.PER_TRADE;
    // Hybrid volume scoring: linear up to VOLUME_LINEAR_SOFT_CAP_USD (preserves
    // mid-tier resolution), then log10 above (whales keep earning small
    // increments instead of slamming into a hard cliff). Final ceiling
    // WEEKLY_VOLUME_SCORE_CAP guarantees a bounded contribution.
    const softCapRaw = BigInt(POINTS.VOLUME_LINEAR_SOFT_CAP_USD) * BigInt(1_000_000); // USD → 6-dec NUSDC raw
    const linearMaxScore = POINTS.VOLUME_LINEAR_SOFT_CAP_USD / 500 * POINTS.PER_500_VOLUME;
    let rawVolumePoints: number;
    if (volumeRaw <= softCapRaw) {
      rawVolumePoints = Number(volumeRaw / BigInt(500_000_000)) * POINTS.PER_500_VOLUME;
    } else {
      const ratio = Number(volumeRaw) / Number(softCapRaw);
      rawVolumePoints = linearMaxScore + Math.floor(POINTS.VOLUME_LOG_K * Math.log10(ratio));
    }
    const volumePoints = Math.min(rawVolumePoints, POINTS.WEEKLY_VOLUME_SCORE_CAP);
    const diversityPoints = uniquePools * POINTS.PER_UNIQUE_POOL;

    const pnlData = weeklyPnlMap.get(t.address);
    let pnlScore = 0;
    if (pnlData) {
      if (pnlData.realizedPnlRaw > 0) {
        pnlScore += Math.floor(pnlData.realizedPnlRaw / 10_000_000) * POINTS.PER_10_PNL;
      }
      if (pnlData.pnlPercent > 0) {
        pnlScore += Math.floor(pnlData.pnlPercent / 5) * POINTS.PER_5PCT_RETURN;
      }
      const tier = POINTS.LOSS_PENALTY_TIERS.find((t) => pnlData.pnlPercent <= t.threshold);
      if (tier) {
        pnlScore = Math.max(0, pnlScore - tier.penalty);
      }
      // Weekly spot PnL cap: prevents a single large profitable trade from
      // dominating the leaderboard. Mirrors the volume cap pattern.
      pnlScore = Math.min(pnlScore, POINTS.WEEKLY_SPOT_PNL_SCORE_CAP);
    }

    const predPnl: PredictionPnlResult | undefined = predictionPnlMap.get(t.address);
    let predictionPnlScore = 0;
    if (predPnl) {
      // Prediction PnL scoring: raw-profit term only.
      // The percent-return term was removed because binary markets at low odds
      // (e.g. price=1bp) produce arbitrarily large % returns from a single hit,
      // turning the leaderboard into a lottery instead of a trading skill metric.
      if (predPnl.realizedPnlRaw > 0) {
        if (Math.abs(predPnl.realizedPnlRaw) >= Number.MAX_SAFE_INTEGER) {
          console.warn(`[Aggregator] prediction PnL near IEEE-754 limit address=${t.address} raw=${predPnl.realizedPnlRaw}`);
        }
        predictionPnlScore += Math.floor(predPnl.realizedPnlRaw / 10_000_000) * POINTS.PER_10_PNL;
      }
      if (predPnl.realizedPnlRaw < 0 && predPnl.marketLossesRaw.length > 0) {
        let lossPenalty = 0;
        for (const lossRaw of predPnl.marketLossesRaw) {
          const lossUsd = lossRaw / 1_000_000;
          const tier = POINTS.PREDICTION_LOSS_PENALTY_TIERS_USD.find((t) => lossUsd >= t.lossUsdAtLeast);
          if (tier) lossPenalty += tier.penalty;
        }
        lossPenalty = Math.min(lossPenalty, POINTS.WEEKLY_PREDICTION_LOSS_PENALTY_CAP);
        predictionPnlScore = Math.max(0, predictionPnlScore - lossPenalty);
      }
      // Symmetric weekly cap on positive prediction score. Loss penalty already
      // capped at WEEKLY_PREDICTION_LOSS_PENALTY_CAP; gain side must be bounded
      // too, otherwise a single long-shot hit dominates the leaderboard.
      predictionPnlScore = Math.min(predictionPnlScore, POINTS.WEEKLY_PREDICTION_GAIN_SCORE_CAP);
    }

    return {
      address: t.address,
      totalScore: tradePoints + volumePoints + diversityPoints + pnlScore + predictionPnlScore,
      scoreFromTrades: tradePoints,
      scoreFromVolume: volumePoints,
      scoreFromDiversity: diversityPoints,
      scoreFromPnl: pnlScore,
      scoreFromPredictionPnl: predictionPnlScore,
      tradeCount,
      volumeQuote: t.volume_quote,
      predictionVolumeQuote: predPnl ? String(predPnl.volumeQuoteRaw) : '0',
      predictionUniqueMarkets: predPnl ? predPnl.marketCount : 0,
      predictionRealizedPnl: predPnl ? String(predPnl.realizedPnlRaw) : '0',
    };
  });

  // Deterministic tiebreaker chain so ranks are unique even on identical totalScore.
  // Order: totalScore desc → spot volume desc → prediction realized PnL desc
  //        → prediction volume desc → trade count desc → address asc.
  // Uses BigInt for the NUSDC-raw string fields to avoid IEEE-754 loss.
  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const av = BigInt(a.volumeQuote), bv = BigInt(b.volumeQuote);
    if (bv !== av) return bv > av ? 1 : -1;
    const ap = BigInt(a.predictionRealizedPnl), bp = BigInt(b.predictionRealizedPnl);
    if (bp !== ap) return bp > ap ? 1 : -1;
    const apv = BigInt(a.predictionVolumeQuote), bpv = BigInt(b.predictionVolumeQuote);
    if (bpv !== apv) return bpv > apv ? 1 : -1;
    if (b.tradeCount !== a.tradeCount) return b.tradeCount - a.tradeCount;
    return a.address < b.address ? -1 : a.address > b.address ? 1 : 0;
  });

  const ranked = scored.map((t, index) => {
    const rank = index + 1;
    const prevRank = baselineRanks.get(t.address) ?? 0;
    return { ...t, rank, prevRank };
  });

  const identityIds = [...new Set(identityMap.values())];
  const badgesByIdentity = identityIds.length > 0
    ? await getSocialBadgesBatch(identityIds)
    : new Map<string, { xHandle: string | null; hasGoogle: boolean; hasTelegram: boolean }>();

  const rankedWithBadges = ranked.map((t) => {
    const identityId = identityMap.get(t.address);
    const badge = identityId ? badgesByIdentity.get(identityId) : undefined;
    return {
      ...t,
      xHandle: badge?.xHandle ?? null,
      hasGoogle: badge?.hasGoogle ?? false,
      hasTelegram: badge?.hasTelegram ?? false,
    };
  });

  replaceWeeklyTraderScores(weekId, rankedWithBadges);

  const prevWeekParticipants = countWeeklyUniqueTraders(
    prevWeekStart,
    weekStart,
    getEffectiveExcludedAddresses(),
  );
  setWeeklyParticipantCount(prevWeekId, prevWeekParticipants);
}

function runCompetitionAggregation(): void {
  const now = Date.now();
  const competitions = getActiveCompetitions();

  for (const comp of competitions) {
    if (comp.status === 'upcoming' && now >= comp.start_ms && now <= comp.end_ms) {
      updateCompetition(comp.id, { status: 'active' });
      comp.status = 'active';
      console.log(`[Aggregator] Competition "${comp.title}" is now active`);
    }

    if (comp.status === 'active' && now > comp.end_ms) {
      updateCompetition(comp.id, { status: 'ended' });
      console.log(`[Aggregator] Competition "${comp.title}" has ended`);
    }

    if (comp.status === 'active') {
      const traders = aggregateCompetitionVolume(
        comp.start_ms,
        Math.min(now, comp.end_ms),
        getEffectiveExcludedAddresses(),
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

// ===== Worker bootstrap =====

initLeaderboardStore(config);
console.log(`[Aggregator/worker] Started (interval ${config.aggregationIntervalMs}ms, db ${config.leaderboardDbPath})`);

// Identity cache: initial load + hourly refresh.
refreshIdentityCache().then(async () => {
  sameIdentityPairs = await buildSameIdentityPairs();
  console.log(`[Aggregator/worker] Identity pairs loaded: ${sameIdentityPairs.size} pairs`);
}).catch((err: Error) => {
  console.error('[Aggregator/worker] Identity cache load failed:', err.message);
});

identityInterval = setInterval(async () => {
  try {
    await refreshIdentityCache();
    sameIdentityPairs = await buildSameIdentityPairs();
  } catch (err) {
    console.error('[Aggregator/worker] Identity cache refresh error:', (err as Error).message);
  }
}, IDENTITY_CACHE_REFRESH_MS);

// Banned cache: retry-on-failure startup, then 5-minute interval.
let bannedCacheLoaded = false;
const startupBannedRefresh = async (): Promise<void> => {
  if (bannedCacheLoaded) return;
  try {
    await refreshBannedCache();
    bannedCacheLoaded = true;
  } catch {
    setTimeout(startupBannedRefresh, 30_000);
  }
};
void startupBannedRefresh();

bannedInterval = setInterval(() => {
  bannedCacheLoaded = true;
  backgroundRefreshBannedCache();
}, BANNED_CACHE_REFRESH_MS);

// Initial run + periodic cycle.
try {
  runAggregation();
  console.log('[Aggregator/worker] Initial aggregation complete');
} catch (err) {
  console.error('[Aggregator/worker] Initial aggregation error:', (err as Error).message);
}

timer = setInterval(() => {
  try {
    runAggregation();
  } catch (err) {
    console.error('[Aggregator/worker] Error:', (err as Error).message);
  }
}, config.aggregationIntervalMs);

// Main-thread messages.
parentPort.on('message', (msg: { type?: string }) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'shutdown') {
    if (timer) { clearInterval(timer); timer = null; }
    if (identityInterval) { clearInterval(identityInterval); identityInterval = null; }
    if (bannedInterval) { clearInterval(bannedInterval); bannedInterval = null; }
    try { closeLeaderboardStore(); } catch { /* ignore */ }
    console.log('[Aggregator/worker] Shutdown complete');
    process.exit(0);
  } else if (msg.type === 'refresh-banned') {
    backgroundRefreshBannedCache();
  } else if (msg.type === 'invalidate-identity') {
    // Trigger a fresh fetch on the next cycle (cache TTL would otherwise hold)
    refreshIdentityCache().catch(() => { /* logged inside */ });
  }
});
