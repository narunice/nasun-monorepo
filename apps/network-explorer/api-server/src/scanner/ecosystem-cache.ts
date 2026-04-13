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
import { saveCache, loadCache } from './cache-persist.js';
import { fetchWithOffload } from './fetch-with-offload.js';

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
    const data = await fetchWithOffload<{
      activations: Record<string, Array<{ nftType: string; nftCount: number }>>;
    }>({
      url,
      apiKey,
      label: 'Ecosystem',
      timeoutMs: 30_000,
    });

    if (!data) {
      if (activationsCache.size === 0) {
        tryLoadActivationsFallback();
      }
      activationsCacheLastRefresh = now;
      return;
    }

    applyActivationsData(data.activations);
    saveCache('ecosystem-activations', data);

    activationsCacheLastRefresh = now;
    console.log(`[Ecosystem] Activations cache refreshed: ${activationsCache.size} users`);
  } catch (err) {
    console.error('[Ecosystem] Activations cache refresh error:', err);
    if (activationsCache.size === 0) {
      tryLoadActivationsFallback();
    }
    // Transient error: retry sooner than full interval (catch only, not HTTP errors)
    activationsCacheLastRefresh = now - ACTIVATIONS_CACHE_REFRESH_MS + ACTIVATIONS_ERROR_RETRY_MS;
  }
}

function applyActivationsData(
  activations: Record<string, Array<{ nftType: string; nftCount: number }>>,
): void {
  if (activations && typeof activations === 'object') {
    const newMap = new Map<string, NftActivation[]>();
    for (const [id, acts] of Object.entries(activations)) {
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
}

function tryLoadActivationsFallback(): void {
  const fallback = loadCache<{
    activations: Record<string, Array<{ nftType: string; nftCount: number }>>;
  }>('ecosystem-activations');
  if (fallback?.activations) {
    applyActivationsData(fallback.activations);
    console.warn(`[Ecosystem] Loaded activations from disk fallback: ${activationsCache.size} users`);
  }
}

// --- Per-user Sync ---

// Rate limit: 1 sync per user per 20 seconds
const syncTimestamps = new Map<string, number>();
const SYNC_RATE_LIMIT_MS = 20_000;

/**
 * Fetch a single user's activations from admin-api and update the in-memory cache.
 * Returns the updated activations for the user, or null if rate-limited/error.
 */
export async function updateActivationsForUser(
  identityId: string,
): Promise<NftActivation[] | null> {
  const now = Date.now();
  const lastSync = syncTimestamps.get(identityId) ?? 0;
  if (now - lastSync < SYNC_RATE_LIMIT_MS) {
    return null; // rate-limited
  }
  syncTimestamps.set(identityId, now);

  const baseUrl = process.env.ECOSYSTEM_ACTIVATIONS_URL;
  const apiKey = process.env.ECOSYSTEM_ACTIVATIONS_API_KEY;
  if (!baseUrl) return null;

  // Derive single-user URL from the bulk endpoint URL
  // e.g., https://api.nasun.io/internal/ecosystem-activations -> .../ecosystem-activations/{id}
  // Do not encode the colon in identityId (e.g. "ap-northeast-2:uuid")
  // as API Gateway treats %3A as invalid format
  const singleUserUrl = `${baseUrl}/${identityId}`;

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['x-api-key'] = apiKey;

    const res = await fetch(singleUserUrl, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[Ecosystem] Per-user sync failed for ${identityId}: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      activations: Array<{ nftType: string; nftCount: number }>;
    };

    const acts: NftActivation[] = (data.activations || []).map((a) => ({
      nftType: a.nftType,
      status: 'ACTIVE',
      nftCount: a.nftCount ?? 1,
    }));

    // Update only this user's entry in the cache
    if (acts.length > 0) {
      activationsCache.set(identityId, acts);
    } else {
      activationsCache.delete(identityId);
    }

    console.log(`[Ecosystem] Per-user sync: ${identityId} -> ${acts.length} activations`);
    return acts;
  } catch (err) {
    console.error(`[Ecosystem] Per-user sync error for ${identityId}:`, err);
    return null;
  }
}

// --- Materialized View Refresh ---

let lastMatviewRefresh = 0;
let refreshInFlight = false;

/**
 * Refresh the ecosystem matview.
 *
 * Concurrency: a process-local `refreshInFlight` flag + MIN_INTERVAL time guard
 * together serialize refresh attempts within the single-fork scanner. A prior
 * implementation used `pg_try_advisory_lock` across the pool, but postgres.js
 * would route lock acquire / REFRESH / unlock to three different pooled
 * connections. Session-level advisory locks can only be released from the
 * session that took them, so the lock leaked and every subsequent attempt
 * hit "skipped (lock held)" indefinitely. Dropping the lock is safe because
 * the scanner runs as PM2 fork with `instances: 1`.
 *
 * Throttle-first: `lastMatviewRefresh` is bumped before REFRESH runs so a
 * failing REFRESH cannot trigger a retry storm.
 */
export async function maybeRefreshMatview(force = false): Promise<void> {
  if (!pointsDb) return;

  const now = Date.now();
  if (!force && now - lastMatviewRefresh < MATVIEW_REFRESH_MIN_INTERVAL_MS) return;
  if (refreshInFlight) {
    console.log('[Ecosystem] Matview refresh skipped (in-flight)');
    return;
  }

  refreshInFlight = true;
  let started = 0;
  // Reserve a dedicated connection so we can raise statement_timeout above
  // the pool default (30s) without affecting other queries. REFRESH MATERIALIZED
  // VIEW CONCURRENTLY occasionally exceeds 30s under contention with the
  // hourly indexer-db-reinit / 18:00 UTC pg_dump windows, which previously
  // surfaced as "canceling statement due to statement timeout" and caused
  // the matview to fall behind. RESET on the same connection before release
  // so subsequent users of the pooled connection inherit defaults.
  const conn = await pointsDb.reserve();
  try {
    started = Date.now();
    lastMatviewRefresh = started;
    await conn`SET statement_timeout = '5min'`;
    await conn`REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores`;
    const ms = Date.now() - started;
    console.log(`[Ecosystem] Materialized view refreshed in ${ms}ms`);
  } catch (err) {
    const ms = started > 0 ? Date.now() - started : 0;
    console.error(`[Ecosystem] Matview refresh error after ${ms}ms:`, err);
  } finally {
    try {
      await conn`RESET statement_timeout`;
    } catch {
      // best-effort; if the connection is dead the pool will discard it
    }
    conn.release();
    refreshInFlight = false;
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
