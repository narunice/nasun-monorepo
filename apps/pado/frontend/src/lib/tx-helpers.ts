/**
 * Transaction Helpers
 * Shared utilities for transaction lifecycle management
 */

import { getSuiClient } from './sui-client';

const WAIT_TIMEOUT_MS = 10_000;

const OBJECT_VERSION_ERROR_RE = /ObjectVersionUnavailableForConsumption|not available for consumption/i;

/**
 * Retry a transaction factory on ObjectVersionUnavailableForConsumption errors.
 *
 * Each retry re-invokes the factory so that fresh object/coin versions are
 * fetched before rebuilding the transaction. Simply retrying a pre-built tx
 * would not help because the stale version is baked into the bytes.
 *
 * @param factory Function that fetches fresh objects, builds, and executes a tx
 * @param maxRetries Maximum number of additional attempts (default: 2)
 * @param delayMs Delay in ms between attempts (default: 500)
 */
export async function withTxRetry<T>(
  factory: () => Promise<T>,
  maxRetries = 2,
  delayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await factory();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!OBJECT_VERSION_ERROR_RE.test(msg) || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/**
 * Wait for a transaction to be indexed by the RPC node.
 * Call this after executeTransactionBlock() succeeds, before
 * invalidating balance caches, to ensure fresh data is available.
 *
 * Timeout is non-fatal — the transaction has already succeeded;
 * the worst case is that balance updates on the next polling cycle.
 */
export async function waitForTxIndexing(digest: string): Promise<void> {
  try {
    await getSuiClient().waitForTransaction({ digest, timeout: WAIT_TIMEOUT_MS });
  } catch {
    // Timeout acceptable — balance will update on next poll
  }
}
