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

const PAGE_LIMIT = 50;

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

export function useRecentFills(marketId: string | undefined) {
  return useQuery({
    queryKey: ['prediction', 'recent-fills', marketId],
    queryFn: () => fetchRecentFills(marketId!),
    enabled: !!marketId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
