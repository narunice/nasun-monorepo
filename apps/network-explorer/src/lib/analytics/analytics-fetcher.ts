import type { Checkpoint } from '@mysten/sui/client';
import { suiClient } from '../sui-client';
import { getCachedData, setCachedData } from './analytics-cache';
import { toDayKey, timeRangeToDays, calculateTrend } from './analytics-aggregator';
import type {
  TimeRange,
  DayBoundary,
  TxHistoryData,
  TradingActivityData,
  AnalyticsData,
  AnalyticsSummary,
} from './types';

const DEEPBOOK_PACKAGE = import.meta.env.VITE_DEEPBOOK_PACKAGE || '';

// ===== Binary Search for Checkpoint at Target Time =====

/**
 * Find the checkpoint closest to a target timestamp using binary search.
 * Returns the checkpoint whose timestamp is <= targetMs (or the earliest available).
 * Uses full range [0, latestSeq] — covers up to 2^30 (~1B) checkpoints.
 */
async function findCheckpointAtTime(
  targetMs: number,
  latestSeq: number,
): Promise<Checkpoint> {
  let low = 0;
  let high = latestSeq;
  let bestMatch: Checkpoint | null = null;

  // Binary search — 30 iterations covers up to ~1 billion checkpoints
  for (let i = 0; i < 30; i++) {
    if (low > high) break;

    const mid = Math.floor((low + high) / 2);
    let cp: Checkpoint;
    try {
      cp = await suiClient.getCheckpoint({ id: String(mid) });
    } catch {
      // Checkpoint doesn't exist (before genesis), move right
      low = mid + 1;
      continue;
    }

    const cpTime = Number(cp.timestampMs);

    if (cpTime <= targetMs) {
      bestMatch = cp;
      low = mid + 1; // Try to find a closer one on the right
    } else {
      high = mid - 1; // Too new, go left
    }
  }

  // If no match found (targetMs is before genesis), return earliest checkpoint
  if (!bestMatch) {
    try {
      bestMatch = await suiClient.getCheckpoint({ id: '0' });
    } catch {
      throw new Error('Cannot find any checkpoint on the network');
    }
  }

  return bestMatch;
}

// ===== Fetch Day Boundaries =====

/**
 * Collect checkpoints at each day boundary (0:00 UTC) using binary search.
 */
async function fetchDayBoundaries(timeRange: TimeRange): Promise<DayBoundary[]> {
  const days = timeRangeToDays(timeRange);
  const now = Date.now();

  // Get latest checkpoint info
  const latestSeqStr = await suiClient.getLatestCheckpointSequenceNumber();
  const latestSeq = Number(latestSeqStr);
  const latestCp = await suiClient.getCheckpoint({ id: latestSeqStr });
  const latestTimestampMs = Number(latestCp.timestampMs);

  // "now" boundary — re-appended after dedup to preserve today's partial-day data
  const nowBoundary: DayBoundary = {
    date: toDayKey(now),
    checkpointSeq: latestCp.sequenceNumber,
    networkTotalTx: Number(latestCp.networkTotalTransactions),
    timestampMs: latestTimestampMs,
  };

  // Build target times for each day boundary (0:00 UTC) and search in parallel
  const targets: { targetMs: number }[] = [];
  for (let d = 0; d < days; d++) {
    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() - d);
    targetDate.setUTCHours(0, 0, 0, 0);
    const targetMs = targetDate.getTime();
    if (targetMs < latestTimestampMs) {
      targets.push({ targetMs });
    }
  }

  const results = await Promise.all(
    targets.map(({ targetMs }) =>
      findCheckpointAtTime(targetMs, latestSeq)
        .then((cp): DayBoundary => ({
          date: toDayKey(Number(cp.timestampMs)),
          checkpointSeq: cp.sequenceNumber,
          networkTotalTx: Number(cp.networkTotalTransactions),
          timestampMs: Number(cp.timestampMs),
        }))
        .catch(() => null),
    ),
  );

  const boundaries: DayBoundary[] = results.filter(
    (b): b is DayBoundary => b !== null,
  );

  // Deduplicate by date (keep the one closest to midnight)
  const deduped = new Map<string, DayBoundary>();
  for (const b of boundaries) {
    const existing = deduped.get(b.date);
    if (!existing || b.timestampMs < existing.timestampMs) {
      deduped.set(b.date, b);
    }
  }

  // Sort ascending, then re-append "now" as the final boundary
  // This ensures today's midnight-to-now partial data is captured
  const sorted = Array.from(deduped.values()).sort((a, b) => a.timestampMs - b.timestampMs);
  if (sorted.length === 0 || nowBoundary.timestampMs > sorted[sorted.length - 1].timestampMs) {
    sorted.push(nowBoundary);
  }

  return sorted;
}

// ===== Public API: Fetch Analytics Data =====

export async function fetchAnalyticsData(timeRange: TimeRange): Promise<AnalyticsData> {
  const cacheKey = `data_${timeRange}`;
  const cached = getCachedData<AnalyticsData>(cacheKey);
  if (cached) return cached;

  const boundaries = await fetchDayBoundaries(timeRange);

  // Calculate daily TX counts from adjacent boundaries
  const txHistory: TxHistoryData[] = [];
  let cumulativeTx = 0;

  for (let i = 1; i < boundaries.length; i++) {
    const prev = boundaries[i - 1];
    const curr = boundaries[i];
    const dailyTx = curr.networkTotalTx - prev.networkTotalTx;
    cumulativeTx += dailyTx;

    txHistory.push({
      date: curr.date,
      dailyTx: Math.max(0, dailyTx),
      cumulativeTx,
    });
  }

  // Build summary from boundaries
  const latest = boundaries[boundaries.length - 1];
  const totalTx = latest?.networkTotalTx ?? 0;

  // Find 24h and 48h boundaries for trend calculation
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const twoDaysAgo = now - 48 * 60 * 60 * 1000;

  let last24hTx = 0;
  let prev24hTx = 0;

  // Find the boundary closest to 24h ago
  const boundary24h = boundaries.reduce<DayBoundary | null>((best, b) => {
    if (b.timestampMs <= oneDayAgo) {
      if (!best || b.timestampMs > best.timestampMs) return b;
    }
    return best;
  }, null);

  // Find the boundary closest to 48h ago
  const boundary48h = boundaries.reduce<DayBoundary | null>((best, b) => {
    if (b.timestampMs <= twoDaysAgo) {
      if (!best || b.timestampMs > best.timestampMs) return b;
    }
    return best;
  }, null);

  if (boundary24h) {
    last24hTx = totalTx - boundary24h.networkTotalTx;
  }
  if (boundary24h && boundary48h) {
    prev24hTx = boundary24h.networkTotalTx - boundary48h.networkTotalTx;
  }

  // Calculate avg TPS from last 24h
  const avgTps = last24hTx > 0 ? Math.round((last24hTx / 86400) * 10) / 10 : 0;

  const summary: AnalyticsSummary = {
    totalTx,
    last24hTx,
    avgTps,
    last24hTrades: 0, // Will be populated by trading activity hook
    trends: {
      tx24h: calculateTrend(last24hTx, prev24hTx),
    },
  };

  const result: AnalyticsData = { summary, txHistory };
  setCachedData(cacheKey, result);
  return result;
}

// ===== Public API: Fetch Trading Activity =====

interface OrderFilledEvent {
  pool_id: string;
  quote_quantity: string;
  timestamp: string;
}

export async function fetchTradingActivity(timeRange: TimeRange): Promise<TradingActivityData[]> {
  if (!DEEPBOOK_PACKAGE) {
    console.warn('[Analytics] VITE_DEEPBOOK_PACKAGE not configured, skipping trading activity');
    return [];
  }

  const cacheKey = `trading_${timeRange}`;
  const cached = getCachedData<TradingActivityData[]>(cacheKey);
  if (cached) return cached;

  const days = timeRangeToDays(timeRange);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const eventType = `${DEEPBOOK_PACKAGE}::order_info::OrderFilled`;

  const dailyMap = new Map<string, { count: number; volumeUsd: number }>();
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined;
  let done = false;

  while (!done) {
    const result = await suiClient.queryEvents({
      query: { MoveEventType: eventType },
      cursor: cursor ?? undefined,
      limit: 50,
      order: 'descending',
    });

    if (result.data.length === 0) {
      done = true;
      break;
    }

    for (const event of result.data) {
      const eventTime = Number(event.timestampMs);
      if (eventTime < cutoffMs) {
        done = true;
        break;
      }

      const json = event.parsedJson as OrderFilledEvent | undefined;
      if (!json) continue;

      const date = toDayKey(eventTime);
      const volumeRaw = BigInt(json.quote_quantity || '0');
      const volumeUsd = Number(volumeRaw) / 1_000_000; // NUSDC has 6 decimals

      const existing = dailyMap.get(date) || { count: 0, volumeUsd: 0 };
      dailyMap.set(date, {
        count: existing.count + 1,
        volumeUsd: existing.volumeUsd + volumeUsd,
      });
    }

    cursor = result.nextCursor ?? null;
    if (!result.hasNextPage || !cursor) done = true;
  }

  const tradingData = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      tradeCount: data.count,
      volumeUsd: Math.round(data.volumeUsd * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  setCachedData(cacheKey, tradingData);
  return tradingData;
}
