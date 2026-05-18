/**
 * Prediction Market Auto-Discovery
 *
 * Queries MarketCreated events emitted by the prediction package to build a
 * live market list, eliminating the need for manual PREDICTION_KEEPER_MARKETS /
 * PREDICTION_LP_MARKETS env-var maintenance.
 *
 * Usage:
 *   const ids = await discoverMarketIds(client, packageId);
 *   const ids = await discoverMarketIds(client, [packageIdV2, packageIdV1]);
 *
 * Pass an array to dual-scan across an upgrade boundary. Sui pins an event's
 * type tag to the package that emitted it (NOT the upgrade-stable original
 * package id), so after a contract upgrade events from prior publishes remain
 * queryable only at those prior package ids. Callers should list the current
 * publish first; results are deduplicated across packages.
 */

import type { SuiClient } from '@mysten/sui/client';
import type { EventId } from '@mysten/sui/client';
import { withRetry } from './retry.js';

// Safety cap: stop paginating after this many market IDs (combined across
// all package ids).
const MAX_MARKETS = 500;
const PAGE_SIZE = 50;

/**
 * Return all market IDs created by the given package id(s), newest first per
 * package. Deduplicates across pages and across packages.
 *
 * Each page fetch is wrapped in withRetry so a transient RPC 503 mid-pagination
 * does not abort discovery and lose the cursor. Without this, a single 503
 * cascades into PM2 restart bursts (root cause of 200+ restart counts).
 */
export async function discoverMarketIds(
  client: SuiClient,
  packageIds: string | string[],
): Promise<string[]> {
  const pkgs = (Array.isArray(packageIds) ? packageIds : [packageIds]).filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const pkg of pkgs) {
    if (ids.length >= MAX_MARKETS) break;
    const eventType = `${pkg}::prediction_market::MarketCreated`;
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
  }

  return ids;
}
