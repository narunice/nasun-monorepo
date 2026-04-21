/**
 * Price Tracker — per-pool market state tracking and alert detection.
 *
 * Tracks price baselines (EWMA), 5-minute volume windows, and consecutive
 * trade direction for each pool. Returns PriceAlerts when thresholds are met.
 */

import type { TradeFillData } from './leaderboard-types.js';

// ===== Types =====

export interface PoolState {
  baselinePrice: number;
  lastPrice: number;
  volume5m: number;
  prevVolume5m: number;
  volumeEntries: { ts: number; amount: number }[];
  consecutiveBuys: number;
  consecutiveSells: number;
  lastUpdateMs: number;
  lastVolumeRotationMs: number;
  fillCount: number;
}

export type AlertType = 'price_move' | 'volume_spike' | 'momentum';

export interface PriceAlert {
  type: AlertType;
  poolId: string;
  data: Record<string, number | string>;
}

// ===== Configuration =====

const VOLUME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const EWMA_ALPHA = 0.1; // Smoothing factor for baseline price

// Alert thresholds
const PRICE_MOVE_THRESHOLD = 0.03;     // 3% from baseline
const VOLUME_SPIKE_MULTIPLIER = 3;     // 3x above previous window
const MOMENTUM_CONSECUTIVE = 15;       // 15 consecutive same-direction trades (raised from 5 to reduce noise from LP bot fills)

// Per-alert-type cooldown (ms)
const COOLDOWNS: Record<AlertType, number> = {
  price_move: 5 * 60 * 1000,   // 5 minutes
  volume_spike: 10 * 60 * 1000, // 10 minutes
  momentum: 10 * 60 * 1000,     // 10 minutes (raised from 3 to reduce repetitive messages)
};

// ===== State =====

const pools = new Map<string, PoolState>();
const cooldownMap = new Map<string, number>(); // "type:poolId" -> lastAlertMs

// ===== Internal Helpers =====

function cooldownKey(type: AlertType, poolId: string): string {
  return `${type}:${poolId}`;
}

function isOnCooldown(type: AlertType, poolId: string, now: number): boolean {
  const key = cooldownKey(type, poolId);
  const lastAlert = cooldownMap.get(key);
  if (!lastAlert) return false;
  return (now - lastAlert) < COOLDOWNS[type];
}

function markAlerted(type: AlertType, poolId: string, now: number): void {
  cooldownMap.set(cooldownKey(type, poolId), now);
}

function pruneVolumeWindow(entries: { ts: number; amount: number }[], cutoff: number): void {
  const idx = entries.findIndex((e) => e.ts >= cutoff);
  if (idx === -1) entries.length = 0;
  else if (idx > 0) entries.splice(0, idx);
}

// ===== Public API =====

/**
 * Update pool state with a new trade fill and return any triggered alerts.
 */
export function updatePool(poolId: string, fill: TradeFillData): PriceAlert[] {
  const now = fill.timestampMs;
  let state = pools.get(poolId);

  if (!state) {
    // Initialize pool state on first fill
    state = {
      baselinePrice: fill.price,
      lastPrice: fill.price,
      volume5m: fill.quoteQuantity,
      prevVolume5m: 0,
      volumeEntries: [{ ts: now, amount: fill.quoteQuantity }],
      consecutiveBuys: fill.takerIsBid ? 1 : 0,
      consecutiveSells: fill.takerIsBid ? 0 : 1,
      lastUpdateMs: now,
      lastVolumeRotationMs: now,
      fillCount: 1,
    };
    pools.set(poolId, state);
    return []; // No alerts on first fill
  }

  // Update baseline price with EWMA
  state.baselinePrice = EWMA_ALPHA * fill.price + (1 - EWMA_ALPHA) * state.baselinePrice;
  state.lastPrice = fill.price;

  // Update volume sliding window
  const cutoff = now - VOLUME_WINDOW_MS;
  state.volumeEntries.push({ ts: now, amount: fill.quoteQuantity });
  pruneVolumeWindow(state.volumeEntries, cutoff);
  state.volume5m = state.volumeEntries.reduce((sum, e) => sum + e.amount, 0);

  // Update consecutive trade direction
  if (fill.takerIsBid) {
    state.consecutiveBuys++;
    state.consecutiveSells = 0;
  } else {
    state.consecutiveSells++;
    state.consecutiveBuys = 0;
  }

  state.lastUpdateMs = now;
  state.fillCount++;

  // Check alert conditions
  const alerts: PriceAlert[] = [];

  // 1. Price move: current price vs baseline
  if (!isOnCooldown('price_move', poolId, now) && state.fillCount > 3) {
    const pctChange = (fill.price - state.baselinePrice) / state.baselinePrice;
    if (Math.abs(pctChange) >= PRICE_MOVE_THRESHOLD) {
      alerts.push({
        type: 'price_move',
        poolId,
        data: {
          pctChange: Math.round(pctChange * 1000) / 10, // e.g., 3.2
          fromPrice: state.baselinePrice,
          toPrice: fill.price,
        },
      });
      markAlerted('price_move', poolId, now);
      // Reset baseline after alert to detect next move
      state.baselinePrice = fill.price;
    }
  }

  // 2. Volume spike: current 5m vs previous 5m
  if (!isOnCooldown('volume_spike', poolId, now) && state.prevVolume5m > 0) {
    const ratio = state.volume5m / state.prevVolume5m;
    if (ratio >= VOLUME_SPIKE_MULTIPLIER) {
      alerts.push({
        type: 'volume_spike',
        poolId,
        data: {
          ratio: Math.round(ratio * 10) / 10, // e.g., 3.5
          volume5m: Math.round(state.volume5m),
        },
      });
      markAlerted('volume_spike', poolId, now);
    }
  }

  // 3. Momentum: consecutive trades in same direction
  if (!isOnCooldown('momentum', poolId, now)) {
    const streak = Math.max(state.consecutiveBuys, state.consecutiveSells);
    if (streak >= MOMENTUM_CONSECUTIVE) {
      const direction = state.consecutiveBuys > state.consecutiveSells ? 'buy' : 'sell';
      alerts.push({
        type: 'momentum',
        poolId,
        data: { streak, direction },
      });
      markAlerted('momentum', poolId, now);
      // Reset streak after alert
      state.consecutiveBuys = 0;
      state.consecutiveSells = 0;
    }
  }

  // Rotate volume window baseline every 5 minutes
  if (now - state.lastVolumeRotationMs >= VOLUME_WINDOW_MS) {
    state.prevVolume5m = state.volume5m;
    state.lastVolumeRotationMs = now;
  }

  return alerts;
}

/**
 * Get the current state of a specific pool (for AI summary prompts).
 */
export function getPoolState(poolId: string): PoolState | undefined {
  return pools.get(poolId);
}

/**
 * Get all tracked pool states (for AI summary prompts).
 */
export function getAllPoolStates(): Map<string, PoolState> {
  return pools;
}

/**
 * Check if any pool has had activity (for skipping AI summaries when idle).
 */
export function hasActivity(): boolean {
  const fiveMinAgo = Date.now() - VOLUME_WINDOW_MS;
  for (const state of pools.values()) {
    if (state.lastUpdateMs > fiveMinAgo) return true;
  }
  return false;
}

/**
 * Remove stale entries from cooldownMap and inactive pools.
 * Called periodically to prevent unbounded memory growth.
 */
export function pruneStale(now: number = Date.now()): void {
  const maxCooldown = Math.max(...Object.values(COOLDOWNS));
  for (const [key, lastAlertMs] of cooldownMap) {
    if (now - lastAlertMs > maxCooldown) cooldownMap.delete(key);
  }

  const poolInactivityMs = 60 * 60 * 1000; // 1 hour
  for (const [poolId, state] of pools) {
    if (now - state.lastUpdateMs > poolInactivityMs) pools.delete(poolId);
  }
}

/**
 * Reset all tracker state. For testing only.
 */
export function reset(): void {
  pools.clear();
  cooldownMap.clear();
}
