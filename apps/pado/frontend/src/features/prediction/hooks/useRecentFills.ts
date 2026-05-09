/**
 * useRecentFills (round-7 R7-C3 minimal replacement for §2.8 IndexedDB indexer)
 *
 * In-memory polling: query `OrderFilled` descending, limit 50, filter by marketId.
 * No persistence, no cross-tab sync, no retention. Lives entirely in TanStack
 * Query cache. Promote to a persistent indexer in v1.1 once history-on-refresh
 * matters to real users.
 */

import { useQuery } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import { ORDER_FILLED_EVENT } from '../constants';
import type { RecentFill } from '../types';

// Bumped from 50 → 250: prediction-arb sweeps + LP repositioning generate
// many small dust fills. A 50-event window can push a real user trade out
// before it's seen. 250 covers ~5-10 minutes of cross-market activity.
const PAGE_LIMIT = 250;
// Dust filter: skip fills below 0.5 NUSDC notional. These are
// arb/maker-vs-maker leftovers that clutter the feed.
const DUST_COST_THRESHOLD = 500_000n; // 0.5 NUSDC at 6 decimals

function parseFill(event: { parsedJson: unknown; timestampMs?: string | null }): RecentFill | null {
  const j = event.parsedJson as Record<string, unknown> | null;
  if (!j) return null;
  return {
    marketId: String(j.market_id),
    orderId: Number(j.order_id ?? 0),
    taker: String(j.taker ?? ''),
    maker: String(j.maker ?? ''),
    isYes: Boolean(j.is_yes ?? false),
    isBid: Boolean(j.is_bid ?? false),
    price: Number(j.price ?? 0),
    fillShares: BigInt(String(j.fill_shares ?? 0)),
    cost: BigInt(String(j.cost ?? 0)),
    timestamp: Number(event.timestampMs ?? 0),
  };
}

async function fetchRecentFills(marketId: string, owner?: string): Promise<RecentFill[]> {
  const client = getSuiClient();

  // 1) Market-wide window (post dust filter), and 2) user's own fills (no dust
  // filter so even a small partial fill from the user shows up). Merge + dedup.
  // Filtering by Sender at the RPC level guarantees the user's trades survive
  // even when the global feed is saturated by arb/LP dust on other markets.
  const promises: Promise<{ data: { parsedJson: unknown; timestampMs?: string | null; id: { txDigest: string; eventSeq: string } }[] }>[] = [
    client.queryEvents({
      query: { MoveEventType: ORDER_FILLED_EVENT },
      limit: PAGE_LIMIT,
      order: 'descending',
    }),
  ];
  if (owner) {
    promises.push(
      client.queryEvents({
        query: { Sender: owner },
        limit: 50,
        order: 'descending',
      }),
    );
  }

  const results = await Promise.all(promises);
  const seen = new Set<string>();
  const fills: RecentFill[] = [];

  // Market-wide pass — apply dust filter.
  for (const event of results[0].data) {
    const j = event.parsedJson as Record<string, unknown> | null;
    if (!j || j.market_id !== marketId) continue;
    const cost = BigInt(String(j.cost ?? 0));
    if (cost < DUST_COST_THRESHOLD) continue;
    const key = `${event.id.txDigest}:${event.id.eventSeq}`;
    if (seen.has(key)) continue;
    const fill = parseFill(event);
    if (!fill) continue;
    seen.add(key);
    fills.push(fill);
  }

  // User-fills pass — no dust filter; ensures own trades always appear.
  if (owner && results[1]) {
    for (const event of results[1].data) {
      const j = event.parsedJson as Record<string, unknown> | null;
      if (!j || j.market_id !== marketId) continue;
      // Sender query may include non-OrderFilled events from the same tx.
      // Filter to OrderFilled only (presence of fill_shares is the signal).
      if (j.fill_shares === undefined) continue;
      const key = `${event.id.txDigest}:${event.id.eventSeq}`;
      if (seen.has(key)) continue;
      const fill = parseFill(event);
      if (!fill) continue;
      seen.add(key);
      fills.push(fill);
    }
  }

  // Re-sort merged set by timestamp desc (own fills may be newer than the
  // dust-filtered global window).
  fills.sort((a, b) => b.timestamp - a.timestamp);
  return fills;
}

export function useRecentFills(marketId: string | undefined, owner?: string) {
  return useQuery({
    queryKey: ['prediction', 'recent-fills', marketId, owner ?? null],
    queryFn: () => fetchRecentFills(marketId!, owner),
    enabled: !!marketId,
    // Tightened so a freshly invalidated query (after user trade) refetches
    // immediately instead of returning the cached pre-trade snapshot.
    staleTime: 2_000,
    refetchInterval: 6_000,
  });
}
