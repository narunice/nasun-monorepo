/**
 * Transaction Helpers
 * Shared utilities for transaction lifecycle management
 */

import { getSuiClient } from './sui-client';

const WAIT_TIMEOUT_MS = 10_000;

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
