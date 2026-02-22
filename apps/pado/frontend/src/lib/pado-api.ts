/**
 * Pado Trade API Client
 *
 * HTTP client for chat-server trade history and cost basis endpoints.
 * Reuses existing NETWORK_CONFIG.chatHttpUrl (no new env vars needed).
 */

import { NETWORK_CONFIG, POOLS } from '../config/network';
import type { UserTrade } from '../features/portfolio/hooks/useTradeHistory';
import type { CostBasisEntry } from '../features/portfolio/hooks/useCostBasis';
import type { TokenSymbol } from './prices';

// ===== Types =====

interface ApiTradeFill {
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
}

interface TradesApiResponse {
  trades: ApiTradeFill[];
  nextCursor: number | null;
  hasMore: boolean;
}

interface CostBasisApiEntry {
  pool_id: string;
  total_bought: number;
  total_sold: number;
  avg_buy_price: number;
  realized_pnl: number;
  holding_qty: number;
}

interface CostBasisApiResponse {
  entries: CostBasisApiEntry[];
  total_realized_pnl: number;
}

// ===== Pool Config Lookup =====

const POOL_CONFIGS = [
  {
    pool: POOLS.NBTC_NUSDC,
    name: 'NBTC/NUSDC',
    baseSymbol: 'NBTC' as TokenSymbol,
  },
  {
    pool: POOLS.NASUN_NUSDC,
    name: 'NSN/NUSDC',
    baseSymbol: 'NSN' as TokenSymbol,
  },
  {
    pool: POOLS.NETH_NUSDC,
    name: 'NETH/NUSDC',
    baseSymbol: 'NETH' as TokenSymbol,
  },
  {
    pool: POOLS.NSOL_NUSDC,
    name: 'NSOL/NUSDC',
    baseSymbol: 'NSOL' as TokenSymbol,
  },
];

const poolConfigMap = new Map(
  POOL_CONFIGS.map((c) => [c.pool.id, c]),
);

// ===== HTTP Helpers =====

const API_TIMEOUT_MS = 5000;

async function apiFetch<T>(path: string): Promise<T> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) throw new Error('chatHttpUrl not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

// ===== Trade History =====

export interface TradeHistoryPage {
  trades: UserTrade[];
  nextCursor: number | null;
  hasMore: boolean;
}

function safeBigInt(value: string): bigint {
  if (!/^\d+$/.test(value)) return 0n;
  return BigInt(value);
}

function adaptTradeFill(fill: ApiTradeFill): UserTrade | null {
  const config = poolConfigMap.get(fill.pool_id);
  if (!config) return null;

  const { pool, name } = config;
  const baseDecimals = pool.baseToken.decimals;
  const quoteDecimals = pool.quoteToken.decimals;

  const price = Number(safeBigInt(fill.price)) / Math.pow(10, quoteDecimals);
  const qty = Number(safeBigInt(fill.base_quantity)) / Math.pow(10, baseDecimals);
  const total = price * qty;

  const feeBps = fill.role === 'taker' ? pool.takerFeeBps : pool.makerFeeBps;
  const fee = total * feeBps / 10000;

  return {
    id: `${fill.tx_digest}_${fill.event_seq}`,
    poolId: fill.pool_id,
    poolName: name,
    side: fill.side,
    price,
    quantity: qty,
    total,
    fee: Math.round(fee * 100) / 100,
    timestamp: fill.timestamp_ms,
    txDigest: fill.tx_digest,
  };
}

export async function fetchTradeHistoryFromApi(
  address: string,
  cursor: number | null,
  pool?: string,
): Promise<TradeHistoryPage> {
  const params = new URLSearchParams();
  params.set('limit', '50');
  if (cursor != null) params.set('cursor', String(cursor));
  if (pool) params.set('pool', pool);

  const data = await apiFetch<TradesApiResponse>(
    `/api/trades/${encodeURIComponent(address)}?${params}`,
  );

  const trades = data.trades
    .map(adaptTradeFill)
    .filter((t): t is UserTrade => t !== null);

  return {
    trades,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
  };
}

// ===== Cost Basis =====

export function adaptCostBasisEntry(
  entry: CostBasisApiEntry,
  getCurrentPrice: (symbol: TokenSymbol) => number,
): CostBasisEntry | null {
  const config = poolConfigMap.get(entry.pool_id);
  if (!config) return null;

  const currentPrice = getCurrentPrice(config.baseSymbol);
  const unrealizedPnl = entry.holding_qty > 0
    ? (currentPrice - entry.avg_buy_price) * entry.holding_qty
    : 0;

  return {
    symbol: config.baseSymbol,
    totalBought: entry.total_bought,
    totalSold: entry.total_sold,
    avgBuyPrice: entry.avg_buy_price,
    realizedPnl: entry.realized_pnl,
    unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
    holdingQty: entry.holding_qty,
  };
}

export async function fetchCostBasisFromApi(
  address: string,
  getCurrentPrice: (symbol: TokenSymbol) => number,
): Promise<CostBasisEntry[]> {
  const data = await apiFetch<CostBasisApiResponse>(
    `/api/trades/${encodeURIComponent(address)}/cost-basis`,
  );

  return data.entries
    .map((entry) => adaptCostBasisEntry(entry, getCurrentPrice))
    .filter((e): e is CostBasisEntry => e !== null);
}

// ===== Order History =====

export interface ApiOrderEvent {
  tx_digest: string;
  event_seq: string;
  event_type: 'placed' | 'canceled';
  pool_id: string;
  order_id: string;
  price: string;
  quantity: string;
  is_bid: number;
  timestamp_ms: number;
}

export interface ApiOrderFill {
  tx_digest: string;
  event_seq: string;
  pool_id: string;
  maker_order_id: string | null;
  taker_order_id: string | null;
  price: string;
  base_quantity: string;
  quote_quantity: string;
  taker_is_bid: number;
  timestamp_ms: number;
  is_maker: boolean;
  is_taker: boolean;
}

interface OrderHistoryApiResponse {
  events: ApiOrderEvent[];
  fills: ApiOrderFill[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface OrderHistoryPage {
  events: ApiOrderEvent[];
  fills: ApiOrderFill[];
  nextCursor: number | null;
  hasMore: boolean;
}

export async function fetchOrderHistoryFromApi(
  address: string,
  pool?: string,
  cursor?: number | null,
): Promise<OrderHistoryPage> {
  const params = new URLSearchParams();
  params.set('limit', '100');
  if (cursor != null) params.set('cursor', String(cursor));
  if (pool) params.set('pool', pool);

  const data = await apiFetch<OrderHistoryApiResponse>(
    `/api/orders/${encodeURIComponent(address)}?${params}`,
  );

  return {
    events: data.events,
    fills: data.fills,
    nextCursor: data.nextCursor,
    hasMore: data.hasMore,
  };
}

// ===== Feature Detection =====

export function isTradeApiAvailable(): boolean {
  return !!NETWORK_CONFIG.chatHttpUrl;
}
