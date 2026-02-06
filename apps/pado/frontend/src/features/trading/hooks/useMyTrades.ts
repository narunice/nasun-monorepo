/**
 * useMyTrades Hook
 * Fetches personal trade fills (OrderFilled events) filtered by user's balanceManagerId
 * Shows each fill as a separate row (1 fill = 1 row)
 */

import { useQuery } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import { NETWORK_CONFIG } from '../../../config/network';
import { useMarket } from '../context/MarketContext';

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

async function fetchMyTrades(
  poolId: string,
  balanceManagerId: string,
  quoteDecimals: number,
  baseDecimals: number,
): Promise<MyTradeItem[]> {
  const client = getSuiClient();

  const result = await client.queryEvents({
    query: { MoveEventType: ORDER_FILLED_TYPE },
    limit: 50,
    order: 'descending',
  });

  const trades: MyTradeItem[] = [];

  for (const event of result.data) {
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

  return trades;
}

/**
 * Fetch personal trade fills for the current user's BalanceManager
 */
export function useMyTrades(
  balanceManagerId: string | null,
  refetchInterval = 10000,
) {
  const { currentPool } = useMarket();
  const poolId = currentPool.id as string;

  return useQuery<MyTradeItem[]>({
    queryKey: ['myTrades', balanceManagerId, poolId],
    queryFn: () =>
      fetchMyTrades(
        poolId,
        balanceManagerId!,
        currentPool.quoteToken.decimals,
        currentPool.baseToken.decimals,
      ),
    enabled: !!balanceManagerId && !!DEEPBOOK_PACKAGE && !!poolId,
    refetchInterval,
    staleTime: 5000,
  });
}
