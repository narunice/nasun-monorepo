/**
 * Prediction Market Auto-Discovery
 *
 * Queries MarketCreated events emitted by the prediction package to build a
 * live market list, eliminating the need for manual PREDICTION_KEEPER_MARKETS /
 * PREDICTION_LP_MARKETS env-var maintenance.
 *
 * Usage:
 *   const ids = await discoverMarketIds(client, packageId);
 */

import type { SuiClient } from '@mysten/sui/client';
import type { EventId } from '@mysten/sui/client';
import { withRetry } from './retry.js';

// Safety cap: stop paginating after this many market IDs.
const MAX_MARKETS = 500;
const PAGE_SIZE = 50;

/**
 * Return all market IDs created by `packageId`, newest first.
 * Deduplicates across pages (safe if the same event appears twice).
 *
 * Each page fetch is wrapped in withRetry so a transient RPC 503 mid-pagination
 * does not abort discovery and lose the cursor. Without this, a single 503
 * cascades into PM2 restart bursts (root cause of 200+ restart counts).
 */
export async function discoverMarketIds(
  client: SuiClient,
  packageId: string,
): Promise<string[]> {
  const eventType = `${packageId}::prediction_market::MarketCreated`;
  const ids: string[] = [];
  const seen = new Set<string>();
  let cursor: EventId | null | undefined = null;

  while (ids.length < MAX_MARKETS) {
    const page = await withRetry(
      () =>
        client.queryEvents({
          query: { MoveEventType: eventType },
          cursor: cursor ?? null,
          limit: PAGE_SIZE,
          order: 'descending',
        }),
      { maxRetries: 4, baseDelayMs: 2000, label: 'discoverMarketIds.queryEvents' },
    );

    for (const event of page.data) {
      const parsed = event.parsedJson as { market_id?: string } | undefined;
      const id = parsed?.market_id;
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return ids;
}
