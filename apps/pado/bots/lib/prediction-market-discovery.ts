/**
 * Prediction Market Auto-Discovery (via create_market transactions)
 *
 * Returns market IDs by scanning `create_market` transactions, NOT MarketCreated
 * events. The devnet fullnode prunes transaction events after ~2 epochs (~4h),
 * so queryEvents(MarketCreated) throws "Could not find the referenced
 * transaction events" once markets age out — which silently stalled the keeper /
 * lp / arb bots (discovery returned 0 markets, so nothing got resolved or
 * quoted, and closed markets sat unsettled). queryTransactionBlocks degrades
 * gracefully (pruned txs come back with empty effects instead of a throw) and
 * the created shared Market object is in each create tx's effects.
 *
 * Tx-index retention is short too, so only recently-created markets are
 * recoverable on-chain; older markets need a durable indexer or longer fullnode
 * retention.
 *
 * `packageIds` are the package(s) the create_market calls TARGET (the latest
 * published id), not the event-emitter originalId. On a fresh genesis the two
 * coincide. Pass an array to scan multiple package families; results dedupe.
 *
 * Usage:
 *   const ids = await discoverMarketIds(client, packageId);
 *   const ids = await discoverMarketIds(client, [packageIdV2, packageIdV1]);
 */

import type { SuiClient } from '@mysten/sui/client';
import { withRetry } from './retry.js';

/**
 * Indexer-backed market list (explorer-api). Preferred over the create_market
 * tx scan below: the fullnode prunes transaction history, so that scan silently
 * decays to 0 as markets age (2026-08-09: keeper/lp/arb all went blind for four
 * days while 50 markets were live). The indexer reads the current object set,
 * which pruning does not touch.
 *
 * The default is the public URL so a local run works out of the box. On the
 * box itself, `EXPLORER_API_URL=http://127.0.0.1:3200/api/v1` in bots/.env
 * keeps discovery on the loopback, off Cloudflare, and out of the public rate
 * limit. `.env` is deliberately not synced by the deploy script, so that key
 * has to be set on the host when a box is (re)provisioned.
 */
const EXPLORER_API_URL = process.env.EXPLORER_API_URL || 'https://explorer.nasun.io/api/v1';

async function fetchMarketIdsFromIndexer(packageIds: string[]): Promise<string[]> {
  const res = await fetch(`${EXPLORER_API_URL}/prediction/markets`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`market list HTTP ${res.status}`);
  const data = (await res.json()) as { markets?: Array<{ id?: unknown; type?: unknown }> };
  if (!Array.isArray(data.markets)) throw new Error('market list: malformed response');

  const valid = data.markets.filter(
    (m): m is { id: string; type: string } =>
      typeof m.id === 'string' && /^0x[0-9a-f]{64}$/i.test(m.id) && typeof m.type === 'string',
  );

  // Type tags carry the ORIGINAL package id while `packageIds` are the call
  // targets (latest publish). They coincide on a fresh genesis but diverge
  // after an upgrade, so a strict filter could drop every market and reproduce
  // the very blindness this path exists to prevent. Filter when it matches
  // something, otherwise fail open with the full list; callers dispatch per
  // market type anyway.
  const wanted = packageIds.map((p) => p.toLowerCase());
  const matched = valid.filter((m) =>
    wanted.some((p) => m.type.toLowerCase().startsWith(`${p}::`)),
  );
  if (wanted.length > 0 && matched.length === 0 && valid.length > 0) {
    console.warn(
      `discoverMarketIds: no market type matched ${wanted.join(', ')}; using all ${valid.length} indexed markets`,
    );
  }
  const chosen = matched.length > 0 ? matched : valid;
  return chosen.map((m) => m.id.toLowerCase());
}

// Safety cap: stop paginating after this many market IDs (combined across
// all package ids).
const MAX_MARKETS = 500;
const PAGE_SIZE = 50;

/**
 * Return market IDs created by the given package id(s), newest first per
 * package. Deduplicates across pages and across packages.
 *
 * Each page fetch is wrapped in withRetry so a transient RPC 503 mid-pagination
 * does not abort discovery and lose the cursor. A non-transient failure (e.g. a
 * cursor that walks into pruned tx history) ends that package's scan with the
 * ids already collected rather than crash-looping the bot.
 */
export async function discoverMarketIds(
  client: SuiClient,
  packageIds: string | string[],
): Promise<string[]> {
  const pkgs = (Array.isArray(packageIds) ? packageIds : [packageIds]).filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  try {
    const fromIndexer = await fetchMarketIdsFromIndexer(pkgs);
    if (fromIndexer.length > 0) return fromIndexer;
    console.warn('discoverMarketIds: indexer returned no markets, falling back to tx scan');
  } catch (error) {
    console.warn(
      `discoverMarketIds: indexer unavailable (${error instanceof Error ? error.message : String(error)}), falling back to tx scan`,
    );
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const pkg of pkgs) {
    if (ids.length >= MAX_MARKETS) break;
    let cursor: string | null | undefined = null;

    while (ids.length < MAX_MARKETS) {
      let page: Awaited<ReturnType<typeof client.queryTransactionBlocks>>;
      try {
        page = await withRetry(
          () =>
            client.queryTransactionBlocks({
              filter: {
                MoveFunction: {
                  package: pkg,
                  module: 'prediction_market',
                  function: 'create_market',
                },
              },
              options: { showEffects: true },
              cursor: cursor ?? null,
              limit: PAGE_SIZE,
              order: 'descending',
            }),
          { maxRetries: 4, baseDelayMs: 2000, label: 'discoverMarketIds.queryTxBlocks' },
        );
      } catch (error) {
        // End this package's scan with what we have instead of aborting the
        // keeper/lp/arb loop (a cursor into pruned history can still surface here).
        console.warn(
          `discoverMarketIds: queryTransactionBlocks failed for ${pkg}: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }

      for (const tx of page.data) {
        const marketRef = (tx.effects?.created ?? []).find(
          (c) => c.owner && typeof c.owner === 'object' && 'Shared' in c.owner,
        );
        const id = marketRef?.reference.objectId;
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
