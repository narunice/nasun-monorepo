/**
 * useMyTrades Hook
 * Fetches personal trade fills (OrderFilled events) filtered by user's balanceManagerId
 * Shows each fill as a separate row (1 fill = 1 row)
 *
 * Uses shared useSenderEvents hook to avoid duplicate queryEvents RPC calls
 * with useOrderHistory.
 */

import { useMemo } from 'react';
import { NETWORK_CONFIG } from '../../../config/network';
import { useMarket } from '../context/MarketContext';
import { useSenderEvents } from './useSenderEvents';

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

const DEEPBOOK_PACKAGE = NETWORK_CONFIG.deepbookPackage;
const ORDER_FILLED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderFilled`;

/**
 * Fetch personal trade fills for the current user's BalanceManager
 */
export function useMyTrades(
  balanceManagerId: string | null,
  senderAddress: string | undefined,
) {
  const { currentPool } = useMarket();
  const poolId = currentPool.id as string;
  const quoteDecimals = currentPool.quoteToken.decimals;
  const baseDecimals = currentPool.baseToken.decimals;

  const query = useSenderEvents(senderAddress);

  // Process raw events into trade items
  const allTrades = useMemo(() => {
    if (!query.data || !balanceManagerId) return undefined;

    const seen = new Set<string>();
    const trades: MyTradeItem[] = [];

    for (const page of query.data.pages) {
      for (const event of page.events) {
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

        const id = (event.id?.txDigest || '') + String(json.maker_order_id || '') + (isMaker ? 'm' : 't');
        if (seen.has(id)) continue;
        seen.add(id);

        trades.push({
          id,
          price: Number(BigInt(String(json.price || 0))) / Math.pow(10, quoteDecimals),
          quantity: Number(BigInt(String(json.base_quantity || json.quantity || 0))) / Math.pow(10, baseDecimals),
          isBid,
          role: isTaker ? 'taker' : 'maker',
          timestamp: Number(event.timestampMs) || Date.now(),
          txDigest: event.id?.txDigest || '',
        });
      }
    }

    return trades;
  }, [query.data, balanceManagerId, poolId, quoteDecimals, baseDecimals]);

  return {
    data: allTrades,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
