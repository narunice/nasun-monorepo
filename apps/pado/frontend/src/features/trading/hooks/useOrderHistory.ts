/**
 * useOrderHistory Hook
 * Fetches past OrderPlaced + OrderCanceled + OrderFilled(taker) events via queryEvents RPC
 * Merges into a unified personal order history
 *
 * Uses Sender filter to fetch only the user's events, then classifies by event type
 * client-side. Supports cursor-based pagination via useInfiniteQuery.
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { SuiEvent, EventId } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { NETWORK_CONFIG } from '../../../config/network';
import { useMarket } from '../context/MarketContext';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

/** Safely convert unknown RPC value to BigInt, defaulting to 0n on invalid input */
function safeBigInt(value: unknown): bigint {
  const str = String(value || '0');
  if (!/^\d+$/.test(str)) return 0n;
  return BigInt(str);
}

export type OrderStatus = 'placed' | 'partial' | 'filled' | 'canceled';
export type OrderType = 'limit' | 'market';

export interface OrderHistoryItem {
  orderId: string;
  type: OrderType;
  price: number;
  quantity: number;
  executedQuantity: number;
  isBid: boolean;
  status: OrderStatus;
  timestamp: number;
  txDigest: string;
}

interface RawEventJson {
  balance_manager_id?: string;
  maker_balance_manager_id?: string;
  taker_balance_manager_id?: string;
  pool_id?: string;
  order_id?: string;
  maker_order_id?: string;
  taker_order_id?: string;
  price?: string;
  placed_quantity?: string;
  original_quantity?: string;
  base_quantity?: string;
  quantity?: string;
  is_bid?: boolean;
  taker_is_bid?: boolean;
  [key: string]: unknown;
}

interface OrderHistoryPage {
  orders: OrderHistoryItem[];
  nextCursor: EventId | null | undefined;
  hasNextPage: boolean;
}

const DEEPBOOK_PACKAGE = NETWORK_CONFIG.deepbookPackage;
const ORDER_PLACED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderPlaced`;
const ORDER_CANCELED_TYPE = `${DEEPBOOK_PACKAGE}::order::OrderCanceled`;
const ORDER_FILLED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderFilled`;

async function fetchOrderHistoryPage(
  poolId: string,
  balanceManagerId: string,
  senderAddress: string,
  quoteDecimals: number,
  baseDecimals: number,
  cursor: EventId | null,
): Promise<OrderHistoryPage> {
  const client = getSuiClient();

  // Query all events from this user, then classify by type client-side.
  // Sender filter ensures only user's events are returned (not LP Bot noise).
  const result = await client.queryEvents({
    query: { Sender: senderAddress },
    limit: 200,
    order: 'descending',
    cursor: cursor ?? undefined,
  });

  // Classify events by type
  const placedEvents: SuiEvent[] = [];
  const canceledEvents: SuiEvent[] = [];
  const filledEvents: SuiEvent[] = [];

  for (const event of result.data) {
    if (event.type === ORDER_PLACED_TYPE) placedEvents.push(event);
    else if (event.type === ORDER_CANCELED_TYPE) canceledEvents.push(event);
    else if (event.type === ORDER_FILLED_TYPE) filledEvents.push(event);
  }

  // Collect canceled order IDs for status lookup
  const canceledOrderIds = new Set<string>();
  for (const event of canceledEvents) {
    const json = event.parsedJson as RawEventJson | undefined;
    if (!json) continue;
    if (json.balance_manager_id !== balanceManagerId) continue;
    if (json.pool_id !== poolId) continue;
    if (json.order_id) canceledOrderIds.add(String(json.order_id));
  }

  // Collect maker fills: maker_order_id -> total executed qty (raw)
  const makerFillQtyMap = new Map<string, bigint>();
  for (const event of filledEvents) {
    const json = event.parsedJson as RawEventJson | undefined;
    if (!json) continue;
    if (json.maker_balance_manager_id !== balanceManagerId) continue;
    if (json.pool_id !== poolId) continue;

    const makerOrderId = String(json.maker_order_id || '');
    const fillQty = safeBigInt(json.base_quantity || json.quantity);
    makerFillQtyMap.set(makerOrderId, (makerFillQtyMap.get(makerOrderId) || 0n) + fillQty);
  }

  // Track placed order IDs to avoid duplicating as market orders
  const placedOrderIds = new Set<string>();

  // Build limit orders from OrderPlaced events
  const orders: OrderHistoryItem[] = [];
  for (const event of placedEvents) {
    const json = event.parsedJson as RawEventJson | undefined;
    if (!json) continue;
    if (json.balance_manager_id !== balanceManagerId) continue;
    if (json.pool_id !== poolId) continue;

    const orderId = String(json.order_id || '');
    placedOrderIds.add(orderId);

    const rawQuantity = safeBigInt(json.placed_quantity);
    const quantity = Number(rawQuantity) / Math.pow(10, baseDecimals);
    const rawExecuted = makerFillQtyMap.get(orderId) || 0n;
    const executedQuantity = Number(rawExecuted) / Math.pow(10, baseDecimals);

    // Determine status: canceled > filled > partial > placed
    let status: OrderStatus;
    if (canceledOrderIds.has(orderId)) {
      status = 'canceled';
    } else if (rawExecuted >= rawQuantity && rawQuantity > 0n) {
      status = 'filled';
    } else if (rawExecuted > 0n) {
      status = 'partial';
    } else {
      status = 'placed';
    }

    orders.push({
      orderId,
      type: 'limit',
      price: Number(safeBigInt(json.price)) / Math.pow(10, quoteDecimals),
      quantity,
      executedQuantity,
      isBid: Boolean(json.is_bid),
      status,
      timestamp: Number(event.timestampMs) || Date.now(),
      txDigest: event.id?.txDigest || '',
    });
  }

  // Build market orders from OrderFilled(taker) events
  // Group by taker_order_id to merge partial fills into one order
  const takerOrderMap = new Map<string, {
    totalQuantity: bigint;
    weightedPrice: bigint;
    isBid: boolean;
    timestamp: number;
    txDigest: string;
  }>();

  for (const event of filledEvents) {
    const json = event.parsedJson as RawEventJson | undefined;
    if (!json) continue;
    if (json.taker_balance_manager_id !== balanceManagerId) continue;
    if (json.pool_id !== poolId) continue;

    const takerOrderId = String(json.taker_order_id || '');

    // Skip if this order was already captured via OrderPlaced (limit order that got filled)
    if (placedOrderIds.has(takerOrderId)) continue;

    const fillQty = safeBigInt(json.base_quantity || json.quantity);
    const fillPrice = safeBigInt(json.price);
    const timestamp = Number(event.timestampMs) || Date.now();

    const existing = takerOrderMap.get(takerOrderId);
    if (existing) {
      existing.totalQuantity += fillQty;
      existing.weightedPrice += fillPrice * fillQty;
      // Keep earliest timestamp
      if (timestamp < existing.timestamp) {
        existing.timestamp = timestamp;
        existing.txDigest = event.id?.txDigest || '';
      }
    } else {
      takerOrderMap.set(takerOrderId, {
        totalQuantity: fillQty,
        weightedPrice: fillPrice * fillQty,
        isBid: Boolean(json.taker_is_bid),
        timestamp,
        txDigest: event.id?.txDigest || '',
      });
    }
  }

  // Convert aggregated taker fills to market order entries
  for (const [orderId, data] of takerOrderMap) {
    const avgPrice = data.totalQuantity > 0n
      ? Number(data.weightedPrice / data.totalQuantity) / Math.pow(10, quoteDecimals)
      : 0;

    const qty = Number(data.totalQuantity) / Math.pow(10, baseDecimals);
    orders.push({
      orderId,
      type: 'market',
      price: avgPrice,
      quantity: qty,
      executedQuantity: qty,
      isBid: data.isBid,
      status: 'filled',
      timestamp: data.timestamp,
      txDigest: data.txDigest,
    });
  }

  // Sort by timestamp descending
  orders.sort((a, b) => b.timestamp - a.timestamp);

  return {
    orders,
    nextCursor: result.nextCursor,
    hasNextPage: result.hasNextPage,
  };
}

/**
 * Fetch order history for the current user's BalanceManager
 */
export function useOrderHistory(
  balanceManagerId: string | null,
  senderAddress: string | undefined,
  refetchInterval = 10000,
) {
  const { currentPool } = useMarket();
  const adaptiveInterval = useAdaptiveInterval(refetchInterval);
  const poolId = currentPool.id as string;

  const query = useInfiniteQuery({
    queryKey: ['orderHistory', balanceManagerId, senderAddress, poolId],
    queryFn: ({ pageParam }) =>
      fetchOrderHistoryPage(
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

  // Flatten pages + deduplicate by orderId (prefer entry with higher executedQuantity)
  const allOrders = useMemo(() => {
    if (!query.data) return undefined;
    const orderMap = new Map<string, OrderHistoryItem>();
    for (const page of query.data.pages) {
      for (const order of page.orders) {
        const existing = orderMap.get(order.orderId);
        if (!existing || order.executedQuantity > existing.executedQuantity) {
          orderMap.set(order.orderId, order);
        }
      }
    }
    return Array.from(orderMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [query.data]);

  return {
    data: allOrders,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
