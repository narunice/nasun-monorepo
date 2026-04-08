/**
 * Disk-based cache persistence for scanner caches.
 *
 * Prevents registeredWallets=0 on cold start when Lambda is simultaneously down.
 * After each successful cache refresh, the data is saved to disk (gzipped JSON).
 * On startup, if the Lambda call fails, the scanner loads from the persisted file
 * so it can continue scoring with stale-but-valid data.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { gzipSync, gunzipSync } from 'zlib';
import { join } from 'path';

// Resolve cache directory relative to the api-server working directory.
// On node-3 this resolves to ~/explorer-api/.cache/
const CACHE_DIR = join(process.cwd(), '.cache');

function ensureCacheDir(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${key}.json.gz`);
}

/**
 * Persist cache data to disk (gzipped JSON).
 * Runs synchronously to guarantee write before next scan cycle.
 * Errors are caught and logged (non-fatal).
 */
export function saveCache(key: string, data: unknown): void {
  try {
    ensureCacheDir();
    const json = JSON.stringify(data);
    const compressed = gzipSync(Buffer.from(json, 'utf-8'));
    writeFileSync(cachePath(key), compressed);
  } catch (err) {
    console.error(`[CachePersist] Failed to save ${key}:`, (err as Error).message);
  }
}

/**
 * Load cached data from disk. Returns null if file doesn't exist or is corrupt.
 */
export function loadCache<T = unknown>(key: string): T | null {
  try {
    const compressed = readFileSync(cachePath(key));
    const json = gunzipSync(compressed).toString('utf-8');
    return JSON.parse(json) as T;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    console.error(`[CachePersist] Failed to load ${key}:`, (err as Error).message);
    return null;
  }
}
