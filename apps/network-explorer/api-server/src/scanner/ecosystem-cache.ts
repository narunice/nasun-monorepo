/**
 * Ecosystem Cache Module
 *
 * Manages two caches used by ecosystem score calculation:
 * 1. NFT activations cache (fetched from admin API)
 * 2. Materialized view refresh state
 *
 * Shared between scanner (triggers refresh) and routes (reads data).
 */

import { pointsDb } from '../db.js';
import {
  ACTIVATIONS_CACHE_REFRESH_MS,
  ACTIVATIONS_ERROR_RETRY_MS,
  MATVIEW_REFRESH_MIN_INTERVAL_MS,
  MATVIEW_REFRESH_MAX_STALE_MS,
  calculateMultiplier,
  type NftActivation,
} from '../config/ecosystem.js';

// --- Activations Cache ---

// identityId -> NftActivation[]
let activationsCache = new Map<string, NftActivation[]>();
let activationsCacheLastRefresh = 0;

export function getActivationsForUser(identityId: string): NftActivation[] {
  return activationsCache.get(identityId) || [];
}

export function getMultiplierForUser(identityId: string): number {
  return calculateMultiplier(getActivationsForUser(identityId));
}

export function getActivationsCacheSize(): number {
  return activationsCache.size;
}

export function getActivationsCacheMap(): Map<string, NftActivation[]> {
  return activationsCache;
}

export async function maybeRefreshActivationsCache(): Promise<void> {
  const now = Date.now();
  if (now - activationsCacheLastRefresh < ACTIVATIONS_CACHE_REFRESH_MS) return;

  const url = process.env.ECOSYSTEM_ACTIVATIONS_URL;
  const apiKey = process.env.ECOSYSTEM_ACTIVATIONS_API_KEY;

  if (!url) {
    if (activationsCache.size === 0) {
      console.warn('[Ecosystem] ECOSYSTEM_ACTIVATIONS_URL not set, no activations loaded');
    }
    activationsCacheLastRefresh = now;
    return;
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[Ecosystem] Activations cache refresh failed: ${res.status}`);
      activationsCacheLastRefresh = now;
      return;
    }

    const data = (await res.json()) as {
      activations: Record<string, Array<{ nftType: string; nftCount: number }>>;
    };

    if (data.activations && typeof data.activations === 'object') {
      const newMap = new Map<string, NftActivation[]>();
      for (const [id, acts] of Object.entries(data.activations)) {
        if (Array.isArray(acts)) {
          newMap.set(
            id,
            acts.map((a) => ({
              nftType: a.nftType,
              status: 'ACTIVE',
              nftCount: a.nftCount ?? 1,
            })),
          );
        }
      }
      activationsCache = newMap;
    }

    activationsCacheLastRefresh = now;
    console.log(`[Ecosystem] Activations cache refreshed: ${activationsCache.size} users`);
  } catch (err) {
    console.error('[Ecosystem] Activations cache refresh error:', err);
    // Transient error: retry sooner than full interval (catch only, not HTTP errors)
    activationsCacheLastRefresh = now - ACTIVATIONS_CACHE_REFRESH_MS + ACTIVATIONS_ERROR_RETRY_MS;
  }
}

// --- Materialized View Refresh ---

let lastMatviewRefresh = 0;
// Advisory lock ID for pg_try_advisory_lock (arbitrary stable number)
const MATVIEW_ADVISORY_LOCK_ID = 8675309;

export async function maybeRefreshMatview(force = false): Promise<void> {
  if (!pointsDb) return;

  const now = Date.now();
  const elapsed = now - lastMatviewRefresh;

  // Skip if within minimum interval (unless forced)
  if (!force && elapsed < MATVIEW_REFRESH_MIN_INTERVAL_MS) return;

  try {
    // Try to acquire advisory lock (non-blocking, prevents concurrent refreshes across PM2 workers)
    const [lockResult] = await pointsDb`
      SELECT pg_try_advisory_lock(${MATVIEW_ADVISORY_LOCK_ID}) as acquired
    `;

    if (!lockResult?.acquired) {
      // Another worker is refreshing, skip
      return;
    }

    try {
      await pointsDb`
        REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores
      `;
      lastMatviewRefresh = Date.now();
      console.log('[Ecosystem] Materialized view refreshed');
    } finally {
      // Always release the lock
      await pointsDb`
        SELECT pg_advisory_unlock(${MATVIEW_ADVISORY_LOCK_ID})
      `;
    }
  } catch (err) {
    console.error('[Ecosystem] Matview refresh error:', err);
  }
}

/**
 * Check if matview is stale (beyond max stale time).
 * Called by scanner to decide if a forced refresh is needed.
 */
export function isMatviewStale(): boolean {
  if (lastMatviewRefresh === 0) return true;
  return Date.now() - lastMatviewRefresh > MATVIEW_REFRESH_MAX_STALE_MS;
}

export function getMatviewStatus(): {
  lastRefresh: string | null;
  stale: boolean;
  activationsCacheSize: number;
} {
  return {
    lastRefresh: lastMatviewRefresh > 0 ? new Date(lastMatviewRefresh).toISOString() : null,
    stale: isMatviewStale(),
    activationsCacheSize: activationsCache.size,
  };
}
