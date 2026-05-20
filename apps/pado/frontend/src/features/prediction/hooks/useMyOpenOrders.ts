/**
 * useMyOpenOrders (round-7 R7-C3 — replaces deferred §2.9 event-derived approach)
 *
 * Strategy:
 * 1. Query `OrderPlaced` events filtered by sender (single descending page, limit 50).
 * 2. For each candidate (price, order_id, side), check the on-chain Table to see
 *    whether the order still exists and how many shares remain.
 *
 * Trade-offs vs the §2.9 spec:
 *   - No event-stream reconciliation across cancelled / filled.
 *   - Bounded by 50 most recent placements per user — sufficient for v1.
 *   - 30s polling, no IDB.
 *
 * Critical for v1 because Limit mode is enabled and users must be able to cancel
 * resting orders.
 */

import { useQuery } from '@tanstack/react-query';
import { bcs } from '@mysten/sui/bcs';
import { deriveDynamicFieldID } from '@mysten/sui/utils';
import { getSuiClient } from '../../../lib/sui-client';
import { ORDER_PLACED_EVENTS } from '../constants';
import type { Order } from '../types';

const PAGE_LIMIT = 50;

interface OpenOrderRow {
  marketId: string;
  isYes: boolean;
  isBid: boolean;
  priceBps: number;
  orderId: number;
  amount: bigint;
  lockedNusdc: bigint;
  costBasis: bigint;
  timestamp: number;
}

async function fetchMyOpenOrders(marketId: string, owner: string): Promise<OpenOrderRow[]> {
  const client = getSuiClient();

  // Step 1: discover candidate orders via OrderPlaced events. Sender filter is
  // not part of the event query API; we paginate descending and filter by maker.
  //
  // 2026-05-20 v5 cutover: walks both legacy and v5 OrderPlaced streams.
  const pages = await Promise.all(
    ORDER_PLACED_EVENTS.map((eventType) =>
      client.queryEvents({
        query: { MoveEventType: eventType },
        limit: PAGE_LIMIT * 4, // overscan since we filter by owner client-side
        order: 'descending',
      }),
    ),
  );
  const allEvents = pages.flatMap((p) => p.data);

  const candidates: Array<{ priceBps: number; orderId: number; isYes: boolean; isBid: boolean }> = [];
  for (const event of allEvents) {
    const j = event.parsedJson as Record<string, unknown> | null;
    if (!j) continue;
    // OrderPlaced event emits `user` (not `owner`) per the Move struct definition.
    const eventMarketId = String(j.market_id ?? '');
    const eventUser = String(j.user ?? '');
    if (eventMarketId.toLowerCase() !== marketId.toLowerCase()) continue;
    if (eventUser.toLowerCase() !== owner.toLowerCase()) continue;
    candidates.push({
      priceBps: Number(j.price ?? 0),
      orderId: Number(j.order_id ?? 0),
      isYes: Boolean(j.is_yes ?? false),
      isBid: Boolean(j.is_bid ?? false),
    });
  }

  if (candidates.length === 0) return [];

  // Step 2: read the market object once and walk dynamic fields by candidate price.
  // Each candidate maps to one (table, price) lookup, deduped by (side, price).
  const marketObj = await client.getObject({ id: marketId, options: { showContent: true } });
  if (!marketObj.data?.content || marketObj.data.content.dataType !== 'moveObject') return [];
  const fields = marketObj.data.content.fields as Record<string, unknown>;

  const tableId = (side: 'yes_bids' | 'yes_asks' | 'no_bids' | 'no_asks'): string | undefined => {
    const t = fields[side] as { fields?: { id?: { id?: string } } } | undefined;
    return t?.fields?.id?.id;
  };

  // Group candidates by (side, price) so we make one dynamic-field call per price level.
  const byKey = new Map<string, { side: 'yes_bids' | 'yes_asks' | 'no_bids' | 'no_asks'; price: number; orderIds: Set<number> }>();
  for (const c of candidates) {
    const side =
      c.isYes && c.isBid ? 'yes_bids' :
      c.isYes && !c.isBid ? 'yes_asks' :
      !c.isYes && c.isBid ? 'no_bids' :
      'no_asks';
    const key = `${side}:${c.priceBps}`;
    if (!byKey.has(key)) byKey.set(key, { side, price: c.priceBps, orderIds: new Set() });
    byKey.get(key)!.orderIds.add(c.orderId);
  }

  // Derive dynamic field IDs locally from (parentId, type, key) and batch
  // the reads into one multiGetObjects RPC instead of N getDynamicFieldObject.
  const u64KeyType = { u64: true as const };
  type Resolved = { group: typeof byKey extends Map<string, infer V> ? V : never; objectId: string };
  const resolved: Resolved[] = [];
  for (const group of byKey.values()) {
    const tid = tableId(group.side);
    if (!tid) continue;
    const keyBytes = bcs.u64().serialize(BigInt(group.price)).toBytes();
    const objectId = deriveDynamicFieldID(tid, u64KeyType, keyBytes);
    resolved.push({ group, objectId });
  }

  const out: OpenOrderRow[] = [];
  if (resolved.length === 0) return out;

  const objects = await client.multiGetObjects({
    ids: resolved.map((r) => r.objectId),
    options: { showContent: true },
  });

  for (let i = 0; i < resolved.length; i++) {
    const { group } = resolved[i];
    const obj = objects[i];
    if (!obj?.data?.content || obj.data.content.dataType !== 'moveObject') continue;
    const value = obj.data.content.fields as Record<string, unknown>;
    const orders = value.value as Array<Record<string, unknown>> | undefined;
    if (!orders) continue;

    const isBid = group.side.endsWith('_bids');
    const isYes = group.side.startsWith('yes_');
    for (const raw of orders) {
      // Sui SDK wraps nested Move struct fields inside an inner `fields` object.
      const o = ((raw as { fields?: Record<string, unknown> }).fields ?? raw);
      const orderId = Number(o.order_id ?? 0);
      const ownerInBook = String(o.owner ?? '');
      if (ownerInBook.toLowerCase() !== owner.toLowerCase()) continue;
      if (!group.orderIds.has(orderId)) continue;
      out.push({
        marketId,
        isYes,
        isBid,
        priceBps: group.price,
        orderId,
        amount: BigInt(String(o.amount ?? 0)),
        lockedNusdc: BigInt(String(o.locked_nusdc ?? 0)),
        costBasis: BigInt(String(o.cost_basis ?? 0)),
        timestamp: Number(o.timestamp ?? 0),
      });
    }
  }

  // Newest first.
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out;
}

export function useMyOpenOrders(marketId: string | undefined, owner: string | undefined) {
  return useQuery<OpenOrderRow[]>({
    queryKey: ['prediction', 'my-orders', marketId, owner],
    queryFn: () => fetchMyOpenOrders(marketId!, owner!),
    enabled: !!marketId && !!owner,
    // Bridge invalidates on user's own OrderPlaced / OrderCancelled /
    // OrderFilled (own order filled = amount changes). 60s safety net.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export type { OpenOrderRow };
// Re-export Order for convenience (callers that already import from hooks).
export type { Order };
