/**
 * AER analytics service - pure synchronous functions operating on AERRecord[].
 * No I/O; all aggregation happens in-memory.
 */

import type { AERRecord, TierLevel } from '../types/aer';
import { TIER_NAMES, STATUS_NAMES } from '../types/aer';
import type {
  AERSummary,
  GroupByDimension,
  TimeGranularity,
  SpendingTimelineEntry,
  TrustProfile,
} from '../types/analytics';

/**
 * Compute a comprehensive summary of AER records.
 * Uses single-pass accumulation for efficiency.
 */
export function summarize(records: AERRecord[]): AERSummary {
  if (records.length === 0) {
    return {
      totalRecords: 0,
      totalPaymentNusdc: 0,
      totalPaymentNasun: 0,
      avgPaymentNusdc: 0,
      avgExecutionTimeMs: 0,
      medianExecutionTimeMs: 0,
      statusDistribution: {},
      tierDistribution: {},
      modelDistribution: {},
      executorDistribution: {},
      budgetFundedCount: 0,
      directFundedCount: 0,
      budgetFundedPercentage: 0,
      teeVerifiedCount: 0,
      teeVerifiedPercentage: 0,
      earliestSettledAt: null,
      latestSettledAt: null,
    };
  }

  let totalPaymentNusdc = 0;
  let totalPaymentNasun = 0;
  let totalExecTime = 0;
  let budgetFundedCount = 0;
  let teeVerifiedCount = 0;
  let earliest = Infinity;
  let latest = -Infinity;

  const statusDist: Record<string, number> = {};
  const tierDist: Record<string, number> = {};
  const modelDist: Record<string, number> = {};
  const executorDist: Record<string, number> = {};
  const execTimes: number[] = [];

  for (const r of records) {
    // Payment by token type
    if (r.paymentToken === 0) {
      totalPaymentNusdc += r.paymentAmount;
    } else {
      totalPaymentNasun += r.paymentAmount;
    }

    totalExecTime += r.executionTimeMs;
    execTimes.push(r.executionTimeMs);

    // Distributions
    const statusKey = STATUS_NAMES[r.status] || String(r.status);
    statusDist[statusKey] = (statusDist[statusKey] || 0) + 1;

    const tierKey = TIER_NAMES[r.executorTier];
    tierDist[tierKey] = (tierDist[tierKey] || 0) + 1;

    modelDist[r.modelName] = (modelDist[r.modelName] || 0) + 1;
    executorDist[r.executor] = (executorDist[r.executor] || 0) + 1;

    // Budget vs direct
    if (r.budgetId !== null) {
      budgetFundedCount++;
    }

    // TEE
    if (r.teeVerified) {
      teeVerifiedCount++;
    }

    // Time range
    if (r.settledAt > 0) {
      if (r.settledAt < earliest) earliest = r.settledAt;
      if (r.settledAt > latest) latest = r.settledAt;
    }
  }

  // Median execution time
  execTimes.sort((a, b) => a - b);
  const mid = Math.floor(execTimes.length / 2);
  const medianExecutionTimeMs =
    execTimes.length % 2 === 0
      ? (execTimes[mid - 1] + execTimes[mid]) / 2
      : execTimes[mid];

  const n = records.length;

  return {
    totalRecords: n,
    totalPaymentNusdc,
    totalPaymentNasun,
    avgPaymentNusdc: n > 0 ? totalPaymentNusdc / n : 0,
    avgExecutionTimeMs: n > 0 ? totalExecTime / n : 0,
    medianExecutionTimeMs,
    statusDistribution: statusDist,
    tierDistribution: tierDist,
    modelDistribution: modelDist,
    executorDistribution: executorDist,
    budgetFundedCount,
    directFundedCount: n - budgetFundedCount,
    budgetFundedPercentage: (budgetFundedCount / n) * 100,
    teeVerifiedCount,
    teeVerifiedPercentage: (teeVerifiedCount / n) * 100,
    earliestSettledAt: earliest === Infinity ? null : earliest,
    latestSettledAt: latest === -Infinity ? null : latest,
  };
}

/**
 * Group records by a specified dimension.
 * Returns a Map where keys are the dimension values and values are record arrays.
 */
export function groupBy(
  records: AERRecord[],
  dimension: GroupByDimension,
): Map<string, AERRecord[]> {
  const groups = new Map<string, AERRecord[]>();

  for (const r of records) {
    let key: string;
    switch (dimension) {
      case 'executor':
        key = r.executor;
        break;
      case 'initiator':
        key = r.initiator;
        break;
      case 'authorizer':
        key = r.authorizer;
        break;
      case 'modelName':
        key = r.modelName;
        break;
      case 'status':
        key = r.statusName;
        break;
      case 'executorTier':
        key = r.executorTierName;
        break;
      case 'paymentToken':
        key = r.paymentToken === 0 ? 'NUSDC' : 'NASUN';
        break;
      case 'budgetId':
        key = r.budgetId ?? 'direct';
        break;
    }

    const group = groups.get(key);
    if (group) {
      group.push(r);
    } else {
      groups.set(key, [r]);
    }
  }

  return groups;
}

/**
 * Compute spending timeline bucketized by time granularity.
 * Records are placed into time buckets and spending is aggregated per bucket.
 */
export function spendingTimeline(
  records: AERRecord[],
  granularity: TimeGranularity,
): SpendingTimelineEntry[] {
  if (records.length === 0) return [];

  const msPerBucket = granularity === 'hour' ? 3_600_000 : granularity === 'day' ? 86_400_000 : 604_800_000;

  // Find time range
  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const r of records) {
    if (r.settledAt > 0) {
      if (r.settledAt < minTime) minTime = r.settledAt;
      if (r.settledAt > maxTime) maxTime = r.settledAt;
    }
  }

  if (minTime === Infinity) return [];

  // Align to bucket boundaries
  const bucketStart = Math.floor(minTime / msPerBucket) * msPerBucket;
  const bucketEnd = Math.floor(maxTime / msPerBucket) * msPerBucket + msPerBucket;

  // Guard against excessive bucket count (crafted timestamps)
  const MAX_BUCKETS = 10_000;
  const bucketCount = Math.ceil((bucketEnd - bucketStart) / msPerBucket);
  if (bucketCount > MAX_BUCKETS) {
    return [];
  }

  // Build bucket map
  const bucketMap = new Map<number, { totalSpent: number; count: number }>();
  for (let t = bucketStart; t < bucketEnd; t += msPerBucket) {
    bucketMap.set(t, { totalSpent: 0, count: 0 });
  }

  // Fill buckets
  for (const r of records) {
    if (r.settledAt <= 0) continue;
    const bucket = Math.floor(r.settledAt / msPerBucket) * msPerBucket;
    const entry = bucketMap.get(bucket);
    if (entry) {
      entry.totalSpent += r.paymentAmount;
      entry.count++;
    }
  }

  // Convert to array
  const timeline: SpendingTimelineEntry[] = [];
  for (const [start, { totalSpent, count }] of bucketMap) {
    timeline.push({
      periodStart: start,
      periodEnd: start + msPerBucket,
      totalSpent,
      recordCount: count,
      avgPayment: count > 0 ? totalSpent / count : 0,
    });
  }

  return timeline.sort((a, b) => a.periodStart - b.periodStart);
}

/**
 * Compute trust profile - executor diversity, TEE rate, tier distribution.
 */
export function trustProfile(records: AERRecord[]): TrustProfile {
  if (records.length === 0) {
    return {
      totalRecords: 0,
      teeVerifiedPercentage: 0,
      avgExecutorTier: 0,
      avgExecutorReputation: 0,
      executorDiversity: 0,
      tierDistribution: [],
      topExecutors: [],
    };
  }

  const n = records.length;
  let teeCount = 0;
  let totalTier = 0;
  let totalReputation = 0;

  // Track per-executor stats
  const executorMap = new Map<string, { count: number; totalReputation: number }>();
  const tierCounts = new Map<TierLevel, number>();

  for (const r of records) {
    if (r.teeVerified) teeCount++;
    totalTier += r.executorTier;
    totalReputation += r.executorReputation;

    // Executor stats
    const exec = executorMap.get(r.executor);
    if (exec) {
      exec.count++;
      exec.totalReputation += r.executorReputation;
    } else {
      executorMap.set(r.executor, {
        count: 1,
        totalReputation: r.executorReputation,
      });
    }

    // Tier distribution
    tierCounts.set(r.executorTier, (tierCounts.get(r.executorTier) || 0) + 1);
  }

  // Build tier distribution
  const tierDistribution = ([0, 1, 2, 3] as TierLevel[])
    .filter((tier) => tierCounts.has(tier))
    .map((tier) => {
      const count = tierCounts.get(tier)!;
      return {
        tier,
        count,
        percentage: (count / n) * 100,
      };
    });

  // Build top executors (sorted by count desc)
  const topExecutors = Array.from(executorMap.entries())
    .map(([address, stats]) => ({
      address,
      count: stats.count,
      avgReputation: stats.totalReputation / stats.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalRecords: n,
    teeVerifiedPercentage: (teeCount / n) * 100,
    avgExecutorTier: totalTier / n,
    avgExecutorReputation: totalReputation / n,
    executorDiversity: executorMap.size,
    tierDistribution,
    topExecutors,
  };
}
