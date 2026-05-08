/**
 * Banned-users cache for chat-server.
 *
 * Pulls the active ban list from the explorer api-server's internal endpoint
 * (`GET /api/v1/internal/banned-users/`) and keeps it in memory with a 5-minute
 * TTL. The aggregator unions banned addresses into excludedAddresses before
 * ranking, and the leaderboard API filters banned rows out of responses for
 * older snapshots that were ranked before the ban took effect.
 *
 * Refresh behavior:
 *   - Lazy: getBannedSet() refreshes on first call after TTL expires.
 *   - On-demand: refreshBannedCache() is hit by the
 *     POST /api/pado/internal/banned-cache/refresh endpoint (called by the
 *     ban-users CLI right after a write) so admins don't have to wait the TTL.
 */

const BANNED_USERS_URL = process.env.BANNED_USERS_URL || '';
const BANNED_USERS_KEY = process.env.BANNED_USERS_API_KEY || process.env.WALLET_MAPPINGS_API_KEY || '';

const TTL_MS = 5 * 60 * 1000;

interface BannedSnapshot {
  addresses: Set<string>;   // lowercased Sui wallet addresses
  identityIds: Set<string>; // banned Cognito identity IDs
  loadedAt: number;
}

let cache: BannedSnapshot | null = null;
let refreshPromise: Promise<void> | null = null;

async function loadBanned(): Promise<{ addresses: Set<string>; identityIds: Set<string> }> {
  if (!BANNED_USERS_URL) {
    return { addresses: new Set(), identityIds: new Set() };
  }

  const headers: Record<string, string> = {};
  if (BANNED_USERS_KEY) headers['X-Internal-Auth'] = BANNED_USERS_KEY;

  const res = await fetch(BANNED_USERS_URL, {
    headers,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`banned-users fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { addresses?: string[]; identityIds?: string[] };
  const addresses = new Set<string>();
  for (const a of data.addresses ?? []) addresses.add(a.toLowerCase());
  const identityIds = new Set<string>(data.identityIds ?? []);
  return { addresses, identityIds };
}

export async function refreshBannedCache(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { addresses, identityIds } = await loadBanned();
      cache = { addresses, identityIds, loadedAt: Date.now() };
      console.log(
        `[banned-loader] Cache refreshed: ${addresses.size} addresses, ${identityIds.size} identities`,
      );
    } catch (err) {
      console.warn('[banned-loader] refresh failed:', (err as Error).message);
      // Keep stale cache rather than wiping. Empty cache fails-open
      // (banned users would briefly reappear), but holding stale data is the
      // safer default.
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function ensureFresh(): Promise<BannedSnapshot> {
  if (!cache || Date.now() - cache.loadedAt > TTL_MS) {
    await refreshBannedCache();
  }
  return cache ?? { addresses: new Set(), identityIds: new Set(), loadedAt: 0 };
}

/**
 * Get the current banned-address set. Returns a snapshot — callers must not
 * mutate it. Always returns within ~15s (fetch timeout); on failure returns
 * the previous snapshot or an empty Set.
 */
export async function getBannedAddresses(): Promise<Set<string>> {
  const snap = await ensureFresh();
  return snap.addresses;
}

export async function getBannedIdentityIds(): Promise<Set<string>> {
  const snap = await ensureFresh();
  return snap.identityIds;
}

/**
 * Synchronous read of the last-loaded snapshot. Returns empty sets if the
 * cache has never loaded. Use this in hot paths where async fetch isn't
 * acceptable; pair with a separate background refresh.
 */
export function getBannedSnapshotSync(): { addresses: Set<string>; identityIds: Set<string> } {
  if (!cache) return { addresses: new Set(), identityIds: new Set() };
  return { addresses: cache.addresses, identityIds: cache.identityIds };
}

/**
 * Trigger a background refresh without blocking. Used during server startup
 * and on a periodic timer so the synchronous accessor stays fresh.
 */
export function backgroundRefreshBannedCache(): void {
  refreshBannedCache().catch(() => {
    /* errors already logged in refreshBannedCache */
  });
}
