/**
 * useMyTradeHistory: user-scoped fill history for a single market.
 *
 * Mirrors useRecentFills but filters by user (taker OR maker). v1 uses a single
 * descending page (limit 200), no cursor. Promote to indexer when users start
 * exceeding 200 fills.
 *
 * `OrderFilled.is_bid` is the maker's perspective (Move emits is_bid=false on
 * place_buy_taker → maker was on the ask side → taker BOUGHT). We normalize to
 * `isBuy` from the user's perspective so green=buy, red=sell regardless of side.
 */

import { useQuery } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import { ORDER_FILLED_EVENT } from '../constants';
import type { TradeHistoryRow } from '../types';

const PAGE_LIMIT = 200;

async function fetchMyTradeHistory(
  marketId: string,
  owner: string,
): Promise<TradeHistoryRow[]> {
  const client = getSuiClient();
  const page = await client.queryEvents({
    query: { MoveEventType: ORDER_FILLED_EVENT },
    limit: PAGE_LIMIT,
    order: 'descending',
  });

  const ownerLc = owner.toLowerCase();
  const rows: TradeHistoryRow[] = [];
  for (const event of page.data) {
    const j = event.parsedJson as Record<string, unknown> | null;
    if (!j) continue;
    if (String(j.market_id ?? '').toLowerCase() !== marketId.toLowerCase()) continue;

    const taker = String(j.taker ?? '').toLowerCase();
    const maker = String(j.maker ?? '').toLowerCase();
    const isUserTaker = taker === ownerLc;
    const isUserMaker = maker === ownerLc;
    if (!isUserTaker && !isUserMaker) continue;

    const isBid = Boolean(j.is_bid ?? false);
    // Maker perspective: is_bid=true means maker had a buy resting → fill
    // direction depends on which side the user occupies.
    const isBuy = isUserTaker ? !isBid : isBid;

    rows.push({
      marketId: String(j.market_id),
      orderId: Number(j.order_id ?? 0),
      isYes: Boolean(j.is_yes ?? false),
      isTaker: isUserTaker,
      isBuy,
      priceBps: Number(j.price ?? 0),
      fillShares: BigInt(String(j.fill_shares ?? 0)),
      cost: BigInt(String(j.cost ?? 0)),
      timestamp: Number(event.timestampMs ?? 0),
      txDigest: event.id?.txDigest,
    });
  }
  return rows;
}

export function useMyTradeHistory(
  marketId: string | undefined,
  owner: string | undefined,
) {
  return useQuery<TradeHistoryRow[]>({
    queryKey: ['prediction', 'my-trade-history', marketId, owner],
    queryFn: () => fetchMyTradeHistory(marketId!, owner!),
    enabled: !!marketId && !!owner,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}
