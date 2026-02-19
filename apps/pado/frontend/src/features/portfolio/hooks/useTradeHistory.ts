/**
 * useTradeHistory Hook
 * Fetch user's trading history from on-chain OrderFilled events across all pools
 * Supports cursor-based pagination via useInfiniteQuery.
 */

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventId } from '@mysten/sui/client';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getSuiClient } from '../../../lib/sui-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { NETWORK_CONFIG, POOLS } from '../../../config/network';
import { getStoredBalanceManagerId } from '../../../lib/unified-margin';

export interface UserTrade {
  id: string;
  poolId: string;
  poolName: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  total: number;
  fee: number;
  timestamp: number;
  txDigest: string;
}

export interface TradeStats {
  totalTrades: number;
  totalVolume: number;
  buyTrades: number;
  sellTrades: number;
  buyVolume: number;
  sellVolume: number;
  avgTradeSize: number;
  lastTradeTime: number | null;
}

interface UseTradeHistoryResult {
  trades: UserTrade[];
  stats: TradeStats;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  fetchNextPage: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

const EMPTY_STATS: TradeStats = {
  totalTrades: 0,
  totalVolume: 0,
  buyTrades: 0,
  sellTrades: 0,
  buyVolume: 0,
  sellVolume: 0,
  avgTradeSize: 0,
  lastTradeTime: null,
};

interface RawFilledJson {
  pool_id?: string;
  maker_balance_manager_id?: string;
  taker_balance_manager_id?: string;
  price?: string;
  base_quantity?: string;
  quantity?: string;
  taker_is_bid?: boolean;
  [key: string]: unknown;
}

interface TradeHistoryPage {
  trades: UserTrade[];
  nextCursor: EventId | null | undefined;
  hasNextPage: boolean;
}

const POOL_CONFIGS = [
  {
    pool: POOLS.NBTC_NUSDC,
    name: 'NBTC/NUSDC',
    takerFeeBps: POOLS.NBTC_NUSDC.takerFeeBps,
    makerFeeBps: POOLS.NBTC_NUSDC.makerFeeBps,
  },
  {
    pool: POOLS.NASUN_NUSDC,
    name: 'NSN/NUSDC',
    takerFeeBps: POOLS.NASUN_NUSDC.takerFeeBps,
    makerFeeBps: POOLS.NASUN_NUSDC.makerFeeBps,
  },
  {
    pool: POOLS.NETH_NUSDC,
    name: 'NETH/NUSDC',
    takerFeeBps: POOLS.NETH_NUSDC.takerFeeBps,
    makerFeeBps: POOLS.NETH_NUSDC.makerFeeBps,
  },
  {
    pool: POOLS.NSOL_NUSDC,
    name: 'NSOL/NUSDC',
    takerFeeBps: POOLS.NSOL_NUSDC.takerFeeBps,
    makerFeeBps: POOLS.NSOL_NUSDC.makerFeeBps,
  },
];

const DEEPBOOK_PACKAGE = NETWORK_CONFIG.deepbookPackage;
const ORDER_FILLED_TYPE = `${DEEPBOOK_PACKAGE}::order_info::OrderFilled`;

function safeBigInt(value: unknown): bigint {
  const str = String(value || '0');
  if (!/^\d+$/.test(str)) return 0n;
  return BigInt(str);
}

async function fetchRealTradesPage(
  balanceManagerId: string,
  senderAddress: string,
  cursor: EventId | null,
): Promise<TradeHistoryPage> {
  const client = getSuiClient();

  // Sender filter only — Nasun RPC does not support compound All filters.
  // Filter by OrderFilled type client-side.
  const result = await client.queryEvents({
    query: { Sender: senderAddress },
    limit: 200,
    order: 'descending',
    cursor: cursor ?? undefined,
  });

  const trades: UserTrade[] = [];

  for (const event of result.data) {
    if (event.type !== ORDER_FILLED_TYPE) continue;
    const json = event.parsedJson as RawFilledJson | undefined;
    if (!json) continue;

    const isMaker = json.maker_balance_manager_id === balanceManagerId;
    const isTaker = json.taker_balance_manager_id === balanceManagerId;
    if (!isMaker && !isTaker) continue;

    // Find matching pool config
    const poolConfig = POOL_CONFIGS.find((c) => c.pool.id === json.pool_id);
    if (!poolConfig) continue;

    const { pool, name } = poolConfig;
    const baseDecimals = pool.baseToken.decimals;
    const quoteDecimals = pool.quoteToken.decimals;

    const takerIsBid = Boolean(json.taker_is_bid);
    const isBid = isTaker ? takerIsBid : !takerIsBid;

    const price = Number(safeBigInt(json.price)) / Math.pow(10, quoteDecimals);
    const qty = Number(safeBigInt(json.base_quantity || json.quantity)) / Math.pow(10, baseDecimals);
    const total = price * qty;

    // Calculate fee based on role
    const feeBps = isTaker ? poolConfig.takerFeeBps : poolConfig.makerFeeBps;
    const fee = total * feeBps / 10000;

    trades.push({
      id: `${event.id?.txDigest || ''}_${event.id?.eventSeq || '0'}`,
      poolId: String(json.pool_id || ''),
      poolName: name,
      side: isBid ? 'buy' : 'sell',
      price,
      quantity: qty,
      total,
      fee: Math.round(fee * 100) / 100,
      timestamp: Number(event.timestampMs) || Date.now(),
      txDigest: event.id?.txDigest || '',
    });
  }

  return {
    trades: trades.sort((a, b) => b.timestamp - a.timestamp),
    nextCursor: result.nextCursor,
    hasNextPage: result.hasNextPage,
  };
}

export function useTradeHistory(): UseTradeHistoryResult {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const adaptiveInterval = useAdaptiveInterval(15_000);

  const activeAddress = isZkConnected
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  const balanceManagerId = activeAddress ? getStoredBalanceManagerId(activeAddress) : null;

  const query = useInfiniteQuery({
    queryKey: ['tradeHistory', balanceManagerId, activeAddress],
    queryFn: ({ pageParam }) =>
      fetchRealTradesPage(balanceManagerId!, activeAddress!, pageParam),
    initialPageParam: null as EventId | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.nextCursor : undefined,
    enabled: !!balanceManagerId && !!activeAddress && !!DEEPBOOK_PACKAGE,
    refetchInterval: adaptiveInterval,
    staleTime: 10_000,
  });

  // Flatten pages + deduplicate
  const safeTrades = useMemo(() => {
    if (!query.data) return [];
    const seen = new Set<string>();
    return query.data.pages
      .flatMap((page) => page.trades)
      .filter((trade) => {
        if (seen.has(trade.id)) return false;
        seen.add(trade.id);
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [query.data]);

  // Calculate statistics from real trades
  const stats = useMemo<TradeStats>(() => {
    if (safeTrades.length === 0) return EMPTY_STATS;

    const buyTrades = safeTrades.filter((t) => t.side === 'buy');
    const sellTrades = safeTrades.filter((t) => t.side === 'sell');
    const buyVolume = buyTrades.reduce((sum, t) => sum + t.total, 0);
    const sellVolume = sellTrades.reduce((sum, t) => sum + t.total, 0);
    const totalVolume = buyVolume + sellVolume;

    return {
      totalTrades: safeTrades.length,
      totalVolume,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      buyVolume,
      sellVolume,
      avgTradeSize: totalVolume / safeTrades.length,
      lastTradeTime: Math.max(...safeTrades.map((t) => t.timestamp)),
    };
  }, [safeTrades]);

  return {
    trades: safeTrades,
    stats,
    isLoading: query.isLoading,
    error: query.error ? 'Failed to load trade history' : null,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
