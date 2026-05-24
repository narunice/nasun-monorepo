/**
 * useRecentFills — market-wide OrderFilled feed (shared across all viewers).
 *
 * Cache key is `marketId` only, so multiple users / tabs viewing the same
 * market hit one shared React Query entry. Per-user fills are fetched
 * separately by `useMyMarketFills` and merged in the component layer.
 *
 * Backed by chat-server's `/api/pado/prediction/market-fills/:marketId`, which
 * reads the indexer-populated `trade_fills` table (pool_id='prediction:<id>').
 * This replaces the previous RPC-based scan that walked the latest ~1000
 * OrderFilled events globally and filtered by market_id — markets without
 * fills in that recent window (older or low-traffic) silently returned empty
 * even when they had real trade history.
 *
 * Polling stays slow (60s); freshness comes from `usePredictionEventBridge`
 * invalidating this key on every OrderFilled event.
 */

import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import type { RecentFill } from '../types';

const API_TIMEOUT_MS = 5000;
const FILL_LIMIT = 200;

interface ApiFillRow {
  tx_digest: string;
  event_seq: string;
  market_id: string;
  maker_address: string;
  taker_address: string;
  maker_order_id: string | null;
  price: string;
  fill_shares: string;
  cost: string;
  is_yes: number;
  taker_is_bid: number;
  timestamp_ms: number;
}

interface ApiResponse {
  marketId: string;
  fills: ApiFillRow[];
}

async function fetchRecentFills(marketId: string): Promise<RecentFill[]> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${baseUrl}/api/pado/prediction/market-fills/${encodeURIComponent(marketId)}?limit=${FILL_LIMIT}`,
      { signal: controller.signal },
    );
    if (!res.ok) throw new Error(`market-fills API ${res.status}`);
    const body = (await res.json()) as ApiResponse;

    return body.fills.map((r) => ({
      marketId: r.market_id,
      // maker_order_id is the source-of-truth order_id in the indexer (taker
      // side has no order_id for prediction fills). Numeric parse: empty/null
      // → 0, matching the legacy parsedJson coercion.
      orderId: r.maker_order_id ? Number(r.maker_order_id) : 0,
      taker: r.taker_address,
      maker: r.maker_address,
      isYes: r.is_yes === 1,
      // Indexer stores prediction's `is_bid` (maker side, see indexer.ts
      // comment) in the `taker_is_bid` column for spot-schema parity. The
      // RecentFill.isBid semantics on the client treat this as "maker is_bid"
      // — same value the RPC parsedJson previously produced.
      isBid: r.taker_is_bid === 1,
      price: Number(r.price),
      fillShares: BigInt(r.fill_shares),
      cost: BigInt(r.cost),
      timestamp: r.timestamp_ms,
    }));
  } finally {
    clearTimeout(timeout);
  }
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
