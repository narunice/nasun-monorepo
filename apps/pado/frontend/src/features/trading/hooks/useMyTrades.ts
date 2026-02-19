/**
 * useMyTrades Hook
 * Fetches personal trade fills (OrderFilled events) filtered by user's balanceManagerId
 * Shows each fill as a separate row (1 fill = 1 row)
 *
 * Uses Sender filter to fetch only the user's events, then filters by OrderFilled type
 * client-side. Supports cursor-based pagination via useInfiniteQuery.
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventId } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { NETWORK_CONFIG } from '../../../config/network';
import { useMarket } from '../context/MarketContext';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

export interface MyTradeItem {
  id: string;
  price: number;
  quantity: number;
  isBid: boolean;
  role: 'maker' | 'taker';
  timestamp: number;
  txDigest: string;
}

interface RawFilledJson {
  pool_id?: string;
  maker_balance_manager_id?: string;
  taker_balance_manager_id?: string;
  maker_order_id?: string;
  taker_order_id?: string;
  price?: string;
  base_quantity?: string;
  quantity?: string;
  taker_is_bid?: boolean;
  is_bid?: boolean;
  [key: string]: unknown;
}

interface MyTradesPage {
  trades: MyTradeItem[];
  nextCursor: EventId | null | undefined;
  hasNextPage: boolean;
}

const DEEPBOOK_PACKAGE = NETWORK_CONFIG.deepbookPackage;
const ORDER_FILLED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderFilled`;

async function fetchMyTradesPage(
  poolId: string,
  balanceManagerId: string,
  senderAddress: string,
  quoteDecimals: number,
  baseDecimals: number,
  cursor: EventId | null,
): Promise<MyTradesPage> {
  const client = getSuiClient();

  // Query all events from this user, filter by OrderFilled type client-side
  const result = await client.queryEvents({
    query: { Sender: senderAddress },
    limit: 200,
    order: 'descending',
    cursor: cursor ?? undefined,
  });

  const trades: MyTradeItem[] = [];

  for (const event of result.data) {
    if (event.type !== ORDER_FILLED_TYPE) continue;
    const json = event.parsedJson as RawFilledJson | undefined;
    if (!json) continue;
    if (json.pool_id !== poolId) continue;

    const isMaker = json.maker_balance_manager_id === balanceManagerId;
    const isTaker = json.taker_balance_manager_id === balanceManagerId;
    if (!isMaker && !isTaker) continue;

    const takerIsBid = Boolean(json.taker_is_bid ?? json.is_bid);
    // If I'm the taker, my side is takerIsBid. If I'm the maker, my side is opposite.
    const isBid = isTaker ? takerIsBid : !takerIsBid;

    trades.push({
      id: (event.id?.txDigest || '') + String(json.maker_order_id || '') + (isMaker ? 'm' : 't'),
      price: Number(BigInt(String(json.price || 0))) / Math.pow(10, quoteDecimals),
      quantity: Number(BigInt(String(json.base_quantity || json.quantity || 0))) / Math.pow(10, baseDecimals),
      isBid,
      role: isTaker ? 'taker' : 'maker',
      timestamp: Number(event.timestampMs) || Date.now(),
      txDigest: event.id?.txDigest || '',
    });
  }

  return {
    trades,
    nextCursor: result.nextCursor,
    hasNextPage: result.hasNextPage,
  };
}

/**
 * Fetch personal trade fills for the current user's BalanceManager
 */
export function useMyTrades(
  balanceManagerId: string | null,
  senderAddress: string | undefined,
  refetchInterval = 10000,
) {
  const { currentPool } = useMarket();
  const adaptiveInterval = useAdaptiveInterval(refetchInterval);
  const poolId = currentPool.id as string;

  const query = useInfiniteQuery({
    queryKey: ['myTrades', balanceManagerId, senderAddress, poolId],
    queryFn: ({ pageParam }) =>
      fetchMyTradesPage(
        poolId,
        balanceManagerId!,
        senderAddress!,
        currentPool.quoteToken.decimals,
        currentPool.baseToken.decimals,
        pageParam,
      ),
    initialPageParam: null as EventId | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.nextCursor : undefined,
    enabled: !!balanceManagerId && !!senderAddress && !!DEEPBOOK_PACKAGE && !!poolId,
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
  });

  // Flatten pages + deduplicate
  const allTrades = useMemo(() => {
    if (!query.data) return undefined;
    const seen = new Set<string>();
    return query.data.pages
      .flatMap((page) => page.trades)
      .filter((trade) => {
        if (seen.has(trade.id)) return false;
        seen.add(trade.id);
        return true;
      });
  }, [query.data]);

  return {
    data: allTrades,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
