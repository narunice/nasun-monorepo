/**
 * useMyTrades Hook
 *
 * Primary: Chat Server API (/api/trades/:address?pool=X) — indexed, fast
 * Fallback: RPC queryEvents (useSenderEvents) — when API unavailable
 *
 * Shows each fill as a separate row (1 fill = 1 row).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { isTradeApiAvailable } from '../../../lib/pado-api';
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

// ===== API types =====

interface ApiTradeResponse {
  trades: Array<{
    id: number;
    tx_digest: string;
    event_seq: string;
    pool_id: string;
    price: string;
    base_quantity: string;
    quote_quantity: string;
    taker_is_bid: number;
    side: 'buy' | 'sell';
    role: 'maker' | 'taker';
    timestamp_ms: number;
  }>;
  nextCursor: number | null;
  hasMore: boolean;
}

// ===== API fetch =====

const API_TIMEOUT_MS = 5000;

async function fetchMyTradesFromApi(
  address: string,
  pool: string,
): Promise<ApiTradeResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) throw new Error('chatHttpUrl not configured');

  const params = new URLSearchParams();
  params.set('pool', pool);
  params.set('limit', '100');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${baseUrl}/api/trades/${encodeURIComponent(address)}?${params}`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<ApiTradeResponse>;
  } finally {
    clearTimeout(timeout);
  }
}

// ===== Helpers =====

function safeBigInt(value: string): bigint {
  if (!/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

// ===== RPC types =====

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

// ===== Main Hook =====

/**
 * Fetch personal trade fills for the current user.
 * Uses Chat Server API when available, falls back to RPC.
 */
export function useMyTrades(
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
    queryKey: ['my-trades-api', senderAddress, poolId],
    queryFn: () => fetchMyTradesFromApi(senderAddress!, poolId),
    enabled: !!senderAddress && apiAvailable,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  // RPC source (fallback)
  const rpcQuery = useSenderEvents(
    !apiAvailable || apiQuery.isError ? senderAddress : undefined,
  );

  // Process API data
  const apiTrades = useMemo(() => {
    if (!apiQuery.data) return undefined;

    return apiQuery.data.trades.map((t): MyTradeItem => {
      const isBid = t.side === 'buy';
      return {
        id: `${t.tx_digest}_${t.event_seq}`,
        price: Number(safeBigInt(t.price)) / Math.pow(10, quoteDecimals),
        quantity: Number(safeBigInt(t.base_quantity)) / Math.pow(10, baseDecimals),
        isBid,
        role: t.role as 'maker' | 'taker',
        timestamp: t.timestamp_ms,
        txDigest: t.tx_digest,
      };
    });
  }, [apiQuery.data, quoteDecimals, baseDecimals]);

  // Process RPC data (fallback)
  const rpcTrades = useMemo(() => {
    if (!rpcQuery.data || !balanceManagerId) return undefined;

    const seen = new Set<string>();
    const trades: MyTradeItem[] = [];

    for (const page of rpcQuery.data.pages) {
      for (const event of page.events) {
        if (event.type !== ORDER_FILLED_TYPE) continue;
        const json = event.parsedJson as RawFilledJson | undefined;
        if (!json) continue;
        if (json.pool_id !== poolId) continue;

        const isMaker = json.maker_balance_manager_id === balanceManagerId;
        const isTaker = json.taker_balance_manager_id === balanceManagerId;
        if (!isMaker && !isTaker) continue;

        const takerIsBid = Boolean(json.taker_is_bid ?? json.is_bid);
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
  }, [rpcQuery.data, balanceManagerId, poolId, quoteDecimals, baseDecimals]);

  // Use API data when available, fallback to RPC
  const useApi = apiAvailable && !apiQuery.isError;

  return {
    data: useApi ? apiTrades : rpcTrades,
    isLoading: useApi ? apiQuery.isLoading : rpcQuery.isLoading,
    fetchNextPage: useApi ? undefined : rpcQuery.fetchNextPage,
    hasNextPage: useApi
      ? (apiQuery.data?.hasMore ?? false)
      : (rpcQuery.hasNextPage ?? false),
    isFetchingNextPage: useApi ? false : rpcQuery.isFetchingNextPage,
  };
}
