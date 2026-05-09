/**
 * useMyMarketFills — user-scoped OrderFilled feed for a single market.
 *
 * Filtering by Sender at the RPC level guarantees the user's own fills are
 * never crowded out by dust noise on other markets, no matter how saturated
 * the global feed is. Used alongside `useRecentFills` (market-wide shared
 * cache) and merged in the component to render a single chronological feed.
 *
 * Dust filter is intentionally NOT applied here: even a small partial fill
 * from the user is meaningful to surface ("did my order fill?"). The
 * combined merge in RecentTradesFeed handles dedup by `txDigest:eventSeq`.
 */

import { useQuery } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import { ORDER_FILLED_EVENT } from '../constants';
import type { RecentFill } from '../types';

const PAGE_LIMIT = 50;

async function fetchMyMarketFills(marketId: string, owner: string): Promise<RecentFill[]> {
  const client = getSuiClient();
  // The `Sender` filter returns every event from the user's transactions
  // including non-OrderFilled types (OrderPlaced, MintPosition, etc.) and
  // events from other markets. Filter both in JS.
  const page = await client.queryEvents({
    query: { Sender: owner },
    limit: PAGE_LIMIT,
    order: 'descending',
  });

  const fills: RecentFill[] = [];
  for (const event of page.data) {
    if (event.type !== ORDER_FILLED_EVENT) continue;
    const j = event.parsedJson as Record<string, unknown> | null;
    if (!j || j.market_id !== marketId) continue;
    fills.push({
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
    });
  }
  return fills;
}

export function useMyMarketFills(marketId: string | undefined, owner: string | undefined) {
  return useQuery({
    queryKey: ['prediction', 'my-fills', marketId, owner],
    queryFn: () => fetchMyMarketFills(marketId!, owner!),
    enabled: !!marketId && !!owner,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
