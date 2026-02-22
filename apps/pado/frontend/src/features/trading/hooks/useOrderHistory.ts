/**
 * useOrderHistory Hook
 *
 * Primary: Chat Server API (/api/orders/:address) — indexed, fast
 * Fallback: RPC queryEvents (useSenderEvents) — when API unavailable
 *
 * Merges OrderPlaced + OrderCanceled + OrderFilled into unified order history.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SuiEvent } from '@mysten/sui/client';
import { NETWORK_CONFIG } from '../../../config/network';
import {
  fetchOrderHistoryFromApi, isTradeApiAvailable,
  type ApiOrderEvent, type ApiOrderFill,
} from '../../../lib/pado-api';
import { useMarket } from '../context/MarketContext';
import { useSenderEvents } from './useSenderEvents';

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

// ===== API-based processing =====

function processOrderHistoryFromApi(
  events: ApiOrderEvent[],
  fills: ApiOrderFill[],
  poolId: string,
  quoteDecimals: number,
  baseDecimals: number,
): OrderHistoryItem[] {
  // Separate placed and canceled events (already filtered by address on server)
  const placedEvents = events.filter(e => e.event_type === 'placed' && e.pool_id === poolId);
  const canceledEvents = events.filter(e => e.event_type === 'canceled' && e.pool_id === poolId);
  const poolFills = fills.filter(f => f.pool_id === poolId);

  // Collect canceled order IDs
  const canceledOrderIds = new Set<string>();
  for (const e of canceledEvents) {
    canceledOrderIds.add(e.order_id);
  }

  // Collect maker fills: maker_order_id -> total executed qty (raw bigint)
  const makerFillQtyMap = new Map<string, bigint>();
  for (const fill of poolFills) {
    if (!fill.is_maker || !fill.maker_order_id) continue;
    const fillQty = safeBigInt(fill.base_quantity);
    const prev = makerFillQtyMap.get(fill.maker_order_id) || 0n;
    makerFillQtyMap.set(fill.maker_order_id, prev + fillQty);
  }

  // Track placed order IDs to avoid duplicating as market orders
  const placedOrderIds = new Set<string>();

  // Build limit orders from placed events
  const orders: OrderHistoryItem[] = [];
  for (const event of placedEvents) {
    const orderId = event.order_id;
    placedOrderIds.add(orderId);

    const rawQuantity = safeBigInt(event.quantity);
    const quantity = Number(rawQuantity) / Math.pow(10, baseDecimals);
    const rawExecuted = makerFillQtyMap.get(orderId) || 0n;
    const executedQuantity = Number(rawExecuted) / Math.pow(10, baseDecimals);

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
      price: Number(safeBigInt(event.price)) / Math.pow(10, quoteDecimals),
      quantity,
      executedQuantity,
      isBid: !!event.is_bid,
      status,
      timestamp: event.timestamp_ms,
      txDigest: event.tx_digest,
    });
  }

  // Build market orders from taker fills
  const takerOrderMap = new Map<string, {
    totalQuantity: bigint;
    weightedPrice: bigint;
    isBid: boolean;
    timestamp: number;
    txDigest: string;
  }>();

  for (const fill of poolFills) {
    if (!fill.is_taker) continue;
    const takerOrderId = fill.taker_order_id || fill.tx_digest; // fallback grouping key

    // Skip if this order was already captured via OrderPlaced
    if (placedOrderIds.has(takerOrderId)) continue;

    const fillQty = safeBigInt(fill.base_quantity);
    const fillPrice = safeBigInt(fill.price);

    const existing = takerOrderMap.get(takerOrderId);
    if (existing) {
      existing.totalQuantity += fillQty;
      existing.weightedPrice += fillPrice * fillQty;
      if (fill.timestamp_ms < existing.timestamp) {
        existing.timestamp = fill.timestamp_ms;
        existing.txDigest = fill.tx_digest;
      }
    } else {
      takerOrderMap.set(takerOrderId, {
        totalQuantity: fillQty,
        weightedPrice: fillPrice * fillQty,
        isBid: !!fill.taker_is_bid,
        timestamp: fill.timestamp_ms,
        txDigest: fill.tx_digest,
      });
    }
  }

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

  orders.sort((a, b) => b.timestamp - a.timestamp);
  return orders;
}

// ===== RPC-based processing (fallback) =====

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

const DEEPBOOK_PACKAGE = NETWORK_CONFIG.deepbookPackage;
const ORDER_PLACED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderPlaced`;
const ORDER_CANCELED_TYPE = `${DEEPBOOK_PACKAGE}::order::OrderCanceled`;
const ORDER_FILLED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderFilled`;

function processOrderHistoryFromRpc(
  events: SuiEvent[],
  poolId: string,
  balanceManagerId: string,
  quoteDecimals: number,
  baseDecimals: number,
): OrderHistoryItem[] {
  const placedEvents: SuiEvent[] = [];
  const canceledEvents: SuiEvent[] = [];
  const filledEvents: SuiEvent[] = [];

  for (const event of events) {
    if (event.type === ORDER_PLACED_TYPE) placedEvents.push(event);
    else if (event.type === ORDER_CANCELED_TYPE) canceledEvents.push(event);
    else if (event.type === ORDER_FILLED_TYPE) filledEvents.push(event);
  }

  const canceledOrderIds = new Set<string>();
  for (const event of canceledEvents) {
    const json = event.parsedJson as RawEventJson | undefined;
    if (!json) continue;
    if (json.balance_manager_id !== balanceManagerId) continue;
    if (json.pool_id !== poolId) continue;
    if (json.order_id) canceledOrderIds.add(String(json.order_id));
  }

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

  const placedOrderIds = new Set<string>();
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
    if (placedOrderIds.has(takerOrderId)) continue;

    const fillQty = safeBigInt(json.base_quantity || json.quantity);
    const fillPrice = safeBigInt(json.price);
    const timestamp = Number(event.timestampMs) || Date.now();

    const existing = takerOrderMap.get(takerOrderId);
    if (existing) {
      existing.totalQuantity += fillQty;
      existing.weightedPrice += fillPrice * fillQty;
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

  orders.sort((a, b) => b.timestamp - a.timestamp);
  return orders;
}

// ===== Deduplication helper =====

function deduplicateOrders(orders: OrderHistoryItem[]): OrderHistoryItem[] {
  const orderMap = new Map<string, OrderHistoryItem>();
  for (const order of orders) {
    const existing = orderMap.get(order.orderId);
    if (!existing || order.executedQuantity > existing.executedQuantity) {
      orderMap.set(order.orderId, order);
    }
  }
  return Array.from(orderMap.values()).sort((a, b) => b.timestamp - a.timestamp);
}

// ===== Main Hook =====

/**
 * Fetch order history for the current user.
 * Uses Chat Server API when available, falls back to RPC.
 */
export function useOrderHistory(
  balanceManagerId: string | null,
  senderAddress: string | undefined,
) {
  const { currentPool } = useMarket();
  const poolId = currentPool.id as string;
  const quoteDecimals = currentPool.quoteToken.decimals;
  const baseDecimals = currentPool.baseToken.decimals;
  const apiAvailable = isTradeApiAvailable();

  // API source (primary)
  const apiQuery = useQuery({
    queryKey: ['order-history-api', senderAddress, poolId],
    queryFn: () => fetchOrderHistoryFromApi(senderAddress!, poolId),
    enabled: !!senderAddress && apiAvailable,
    refetchInterval: 10_000,
    staleTime: 5000,
    retry: 1,
  });

  // RPC source (fallback when API fails or unavailable)
  const rpcQuery = useSenderEvents(
    !apiAvailable || apiQuery.isError ? senderAddress : undefined,
  );

  // Process API data
  const apiOrders = useMemo(() => {
    if (!apiQuery.data) return undefined;
    const orders = processOrderHistoryFromApi(
      apiQuery.data.events,
      apiQuery.data.fills,
      poolId,
      quoteDecimals,
      baseDecimals,
    );
    return deduplicateOrders(orders);
  }, [apiQuery.data, poolId, quoteDecimals, baseDecimals]);

  // Process RPC data (fallback)
  const rpcOrders = useMemo(() => {
    if (!rpcQuery.data || !balanceManagerId) return undefined;
    const allEvents: SuiEvent[] = [];
    for (const page of rpcQuery.data.pages) {
      allEvents.push(...page.events);
    }
    const orders = processOrderHistoryFromRpc(allEvents, poolId, balanceManagerId, quoteDecimals, baseDecimals);
    return deduplicateOrders(orders);
  }, [rpcQuery.data, balanceManagerId, poolId, quoteDecimals, baseDecimals]);

  // Use API data when available, fallback to RPC
  const useApi = apiAvailable && !apiQuery.isError;

  return {
    data: useApi ? apiOrders : rpcOrders,
    isLoading: useApi ? apiQuery.isLoading : rpcQuery.isLoading,
    fetchNextPage: useApi ? undefined : rpcQuery.fetchNextPage,
    hasNextPage: useApi ? (apiQuery.data?.hasMore ?? false) : (rpcQuery.hasNextPage ?? false),
    isFetchingNextPage: useApi ? false : rpcQuery.isFetchingNextPage,
  };
}
