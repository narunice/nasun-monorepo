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

async function fetchRecentFills(marketId: string): Promise<RecentFill[]> {
  const client = getSuiClient();
  const page = await client.queryEvents({
    query: { MoveEventType: ORDER_FILLED_EVENT },
    limit: PAGE_LIMIT,
    order: 'descending',
  });

  const fills: RecentFill[] = [];
  for (const event of page.data) {
    const j = event.parsedJson as Record<string, unknown> | null;
    if (!j || j.market_id !== marketId) continue;
    const cost = BigInt(String(j.cost ?? 0));
    if (cost < DUST_COST_THRESHOLD) continue;
    fills.push({
      marketId: String(j.market_id),
      orderId: Number(j.order_id ?? 0),
      taker: String(j.taker ?? ''),
      maker: String(j.maker ?? ''),
      isYes: Boolean(j.is_yes ?? false),
      isBid: Boolean(j.is_bid ?? false),
      price: Number(j.price ?? 0),
      fillShares: BigInt(String(j.fill_shares ?? 0)),
      cost,
      timestamp: Number(event.timestampMs ?? 0),
    });
  }
  return fills;
}

export function useRecentFills(marketId: string | undefined) {
  return useQuery({
    queryKey: ['prediction', 'recent-fills', marketId],
    queryFn: () => fetchRecentFills(marketId!),
    enabled: !!marketId,
    // Tightened so a freshly invalidated query (after user trade) refetches
    // immediately instead of returning the cached pre-trade snapshot.
    staleTime: 2_000,
    refetchInterval: 6_000,
  });
}
