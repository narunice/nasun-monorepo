/**
 * useRecentFills — market-wide OrderFilled feed (shared across all viewers).
 *
 * No owner argument: the cache key is `marketId` only, so multiple users / tabs
 * viewing the same market hit one shared React Query entry. Per-user fills are
 * fetched separately by `useMyMarketFills` and merged in the component layer.
 *
 * Polling is intentionally slow (60s); freshness comes from
 * `usePredictionEventBridge` invalidating this key on every OrderFilled event.
 * The dust filter drops sub-cent partial fills (LP repositioning / arb noise)
 * that would otherwise crowd out real trades in the visible window.
 */

import { useQuery } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import { ORDER_FILLED_EVENT } from '../constants';
import type { RecentFill } from '../types';

const PAGE_LIMIT = 250;
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
    queryKey: ['prediction', 'market-fills', marketId],
    queryFn: () => fetchRecentFills(marketId!),
    enabled: !!marketId,
    // EventService bridge invalidates on each OrderFilled, so polling is just a
    // safety net for the case where the bridge isn't mounted (e.g. /predict
    // never opened) or the SDK polling missed an event.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
