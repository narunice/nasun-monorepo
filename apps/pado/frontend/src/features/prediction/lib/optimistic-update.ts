/**
 * optimistic-update — post-trade UI freshness without waiting on the indexer.
 *
 * After a successful prediction trade tx, the user expects three panels to
 * update immediately: Recent Trades, My Positions, and Yes/No %. Two of the
 * three (RecentTrades, MyPositions) read from Sui's event index and
 * owned-objects index respectively, both of which lag 5-15s post-confirmation.
 * The existing `invalidateMarketScoped` (0s + 5s) refetches against those
 * indexes and ends up caching the *pre-trade* state, which then sits stale
 * until the 60s safety poll. Users perceive this as "UI doesn't update until
 * I reload."
 *
 * Fix: the tx receipt already has every piece of information needed to
 * reconstruct the rows that *will* show up once the indexer catches up.
 * Synthesize them locally and prepend to the cache with a `_pending` flag,
 * then dedupe naturally when the real refetch lands. For Position NFTs we
 * also poll the per-object index (much faster than owned-objects) to swap
 * pending rows for real ones in 1-3s.
 */

import type { QueryClient } from '@tanstack/react-query';
import type {
  SuiClient,
  SuiTransactionBlockResponse,
  SuiObjectChange,
  SuiEvent,
} from '@mysten/sui/client';

import { ORDER_FILLED_EVENTS, POSITION_TYPES } from '../constants';
import type { Position, RecentFill } from '../types';

/** Eviction window: pending rows that the indexer never confirms are wiped. */
const PENDING_EVICTION_MS = 10_000;

/** Per-object polling schedule (ms). 300, 600, 1200, 2400 — total ~4.5s. */
const OBJECT_POLL_DELAYS = [300, 600, 1200, 2400] as const;

/**
 * Build a unique dedupe key for an OrderFilled row. marketId is included
 * because order_id is scoped to a single market and can repeat across
 * markets. taker/maker disambiguate the two events Move emits for both
 * sides of a single fill (each side has its own row when one wallet is on
 * both sides, but in practice taker !== maker).
 */
function fillKey(f: Pick<RecentFill, 'marketId' | 'orderId' | 'maker' | 'taker'>): string {
  return `${f.marketId}|${f.orderId}|${f.maker}|${f.taker}`;
}

export function parseFillsFromEvents(events: SuiEvent[] | null | undefined, marketId: string): RecentFill[] {
  if (!events) return [];
  const out: RecentFill[] = [];
  for (const ev of events) {
    if (!ORDER_FILLED_EVENTS.includes(ev.type)) continue;
    const j = ev.parsedJson as Record<string, unknown> | null;
    if (!j || j.market_id !== marketId) continue;
    // Drop zero-fill bookkeeping events (cost=0 fill_shares=0) — same rule as
    // useMyMarketFills. Without this, the optimistic feed gets noisier than
    // the real one would be after the indexer catches up.
    // Per-event try/catch: a single malformed event must not prevent valid
    // events in the same receipt from producing optimistic rows.
    try {
      const cost = BigInt(String(j.cost ?? 0));
      if (cost === 0n) continue;
      out.push({
        marketId: String(j.market_id),
        orderId: Number(j.order_id ?? 0),
        taker: String(j.taker ?? ''),
        maker: String(j.maker ?? ''),
        isYes: Boolean(j.is_yes ?? false),
        isBid: Boolean(j.is_bid ?? false),
        price: Number(j.price ?? 0),
        fillShares: BigInt(String(j.fill_shares ?? 0)),
        cost,
        timestamp: Number(ev.timestampMs ?? Date.now()),
        _pending: true,
      });
    } catch {
      // Skip malformed event; other events in the receipt are unaffected.
    }
  }
  return out;
}

/**
 * Inspect objectChanges for newly-created Position NFTs owned by `myAddress`
 * in this market. Returns objectIds only — we synthesize the row shape from
 * the OrderFilled events because objectChanges does not include parsed
 * Position fields.
 */
function parseNewPositionIds(
  changes: SuiObjectChange[] | null | undefined,
  myAddress: string,
): string[] {
  if (!changes) return [];
  const lc = myAddress.toLowerCase();
  const ids: string[] = [];
  for (const c of changes) {
    if (c.type !== 'created') continue;
    if (!POSITION_TYPES.includes(c.objectType)) continue;
    const owner = c.owner;
    const addressOwner = typeof owner === 'object' && owner && 'AddressOwner' in owner
      ? owner.AddressOwner
      : null;
    if (!addressOwner || addressOwner.toLowerCase() !== lc) continue;
    ids.push(c.objectId);
  }
  return ids;
}

/**
 * Aggregate this tx's user-side fills into a single synthesized Position row.
 *
 * Why one row per (marketId, isYes) and not one per fill: the Move contract
 * mints a separate Position object per maker level walked, but a
 * place_buy_taker that sweeps N levels emits N OrderFilled events and creates
 * N Position objects. Showing N pending rows would flicker into one row (or
 * however many objects the refetch returns) once the indexer catches up,
 * which is jarring. Aggregating to (marketId, isYes) is closer to the steady
 * state — the indexer will return *several* objects but they sum to the same
 * shares/costBasis as our synthesized row, and the dedupe by objectId below
 * cleanly replaces the optimistic aggregate row with the real per-object rows
 * once they arrive.
 *
 * Trade-off: during the pending window the UI shows the buy as one row instead
 * of many. That matches user mental model ("I bought N shares"), so we keep it.
 */
function synthesizePositionsForUser(
  fills: RecentFill[],
  newPositionIds: string[],
  myAddress: string,
): Position[] {
  const lc = myAddress.toLowerCase();
  const mineByYes = new Map<boolean, { shares: bigint; costBasis: bigint }>();
  for (const f of fills) {
    const taker = f.taker.toLowerCase();
    if (taker !== lc) continue; // we only synthesize positions for the taker, not the maker
    const cur = mineByYes.get(f.isYes) ?? { shares: 0n, costBasis: 0n };
    cur.shares += f.fillShares;
    cur.costBasis += f.cost;
    mineByYes.set(f.isYes, cur);
  }
  if (mineByYes.size === 0 || newPositionIds.length === 0) return [];

  // Use the first new objectId as the synthetic row's id. Real positions
  // arriving later have their own ids and dedupe-merge per id.
  const out: Position[] = [];
  let idIdx = 0;
  for (const [isYes, agg] of mineByYes.entries()) {
    const id = newPositionIds[idIdx] ?? `optimistic:${Date.now()}:${idIdx}`;
    idIdx++;
    out.push({
      id,
      marketId: fills[0]?.marketId ?? '',
      isYes,
      shares: agg.shares,
      costBasis: agg.costBasis,
      _pending: true,
    });
  }
  return out;
}

function dedupePrepend<T>(prev: T[] | undefined, fresh: T[], keyOf: (t: T) => string): T[] {
  const base = prev ?? [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of fresh) {
    const k = keyOf(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  for (const p of base) {
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export interface ApplyOptimisticTradeArgs {
  queryClient: QueryClient;
  client: SuiClient;
  marketId: string;
  myAddress: string;
  receipt: SuiTransactionBlockResponse;
}

/**
 * Synthesize Recent Trades / My Positions / My Fills rows from a successful
 * tx receipt and prepend them into the React Query cache. Schedules a
 * per-object indexer poll to replace pending Position rows with real data,
 * plus a 10s eviction sweep for pending rows the indexer never confirms.
 */
export function applyOptimisticTrade(args: ApplyOptimisticTradeArgs): void {
  const { queryClient, client, marketId, myAddress, receipt } = args;
  const myAddressLc = myAddress.toLowerCase();

  const fills = parseFillsFromEvents(receipt.events, marketId);
  if (fills.length === 0) return; // nothing to optimistically reflect (e.g. limit-only place)

  const myFills = fills.filter(
    (f) => f.taker.toLowerCase() === myAddressLc || f.maker.toLowerCase() === myAddressLc,
  );

  const newPositionIds = parseNewPositionIds(receipt.objectChanges, myAddress);
  const newPositions = synthesizePositionsForUser(fills, newPositionIds, myAddress);

  // Market-wide trades feed.
  queryClient.setQueryData<RecentFill[]>(
    ['prediction', 'market-fills', marketId],
    (prev) => dedupePrepend(prev, fills, fillKey),
  );

  // User-scoped trades feed.
  if (myFills.length > 0) {
    queryClient.setQueryData<RecentFill[]>(
      ['prediction', 'my-fills', marketId, myAddress],
      (prev) => dedupePrepend(prev, myFills, fillKey),
    );
    // Also try the lowercase keying that the bridge uses (defensive — different
    // call sites have used both casings historically).
    queryClient.setQueryData<RecentFill[]>(
      ['prediction', 'my-fills', marketId, myAddressLc],
      (prev) => dedupePrepend(prev, myFills, fillKey),
    );
  }

  // User positions.
  if (newPositions.length > 0) {
    queryClient.setQueryData<Position[]>(
      ['prediction-positions', myAddress],
      (prev) => dedupePrepend(prev, newPositions, (p) => p.id),
    );

    // Per-object index typically catches up before owned-objects. Polling
    // multiGetObjects gives us the *real* Position rows in 1-3s and we
    // overwrite the synthesized aggregate with the canonical per-object rows.
    void pollNewPositionsUntilLive({
      queryClient,
      client,
      myAddress,
      newPositionIds,
      marketId,
    });
  }

  // Eviction: drop rows from THIS batch still flagged `_pending` after the
  // window. Scoped to the specific fill keys / position ids injected above so
  // a rapid second trade's pending rows are not prematurely evicted by this
  // batch's timer. Real rows from the indexer are not flagged so they're safe.
  const batchFillKeys = new Set(fills.map(fillKey));
  const batchMyFillKeys = new Set(myFills.map(fillKey));
  const batchPositionIds = new Set(newPositions.map((p) => p.id));
  setTimeout(
    () => evictPendingRows(queryClient, marketId, myAddress, batchFillKeys, batchMyFillKeys, batchPositionIds),
    PENDING_EVICTION_MS,
  );
}

async function pollNewPositionsUntilLive(opts: {
  queryClient: QueryClient;
  client: SuiClient;
  myAddress: string;
  newPositionIds: string[];
  marketId: string;
}): Promise<void> {
  const { queryClient, client, myAddress, newPositionIds, marketId } = opts;
  if (newPositionIds.length === 0) return;

  const stillMissing = new Set(newPositionIds);

  for (const delay of OBJECT_POLL_DELAYS) {
    await sleep(delay);
    if (stillMissing.size === 0) return;

    const ids = Array.from(stillMissing);
    let results: Awaited<ReturnType<SuiClient['multiGetObjects']>>;
    try {
      results = await client.multiGetObjects({
        ids,
        options: { showContent: true, showType: true },
      });
    } catch {
      continue; // transient RPC error, try next backoff
    }

    const live: Position[] = [];
    for (const r of results) {
      if (!r.data || r.error) continue;
      const content = r.data.content;
      if (!content || content.dataType !== 'moveObject') continue;
      const fields = (content as { fields: Record<string, unknown> }).fields;
      if (!fields) continue;
      const id = r.data.objectId;
      live.push({
        id,
        marketId: String(fields.market_id ?? marketId),
        isYes: Boolean(fields.is_yes ?? true),
        shares: BigInt(String(fields.shares ?? 0)),
        costBasis: BigInt(String(fields.cost_basis ?? 0)),
        // explicitly NOT pending — this is the canonical row
      });
      stillMissing.delete(id);
    }

    if (live.length > 0) {
      queryClient.setQueryData<Position[]>(
        ['prediction-positions', myAddress],
        (prev) => mergeLivePositions(prev, live),
      );
    }
  }

  // Final cleanup: any positions still missing after the poll window — let
  // the regular invalidate / refetch path handle them. Pending eviction
  // (setTimeout above) will remove orphaned synthesized rows.
}

function mergeLivePositions(prev: Position[] | undefined, live: Position[]): Position[] {
  const base = prev ?? [];
  const byId = new Map<string, Position>();
  for (const p of base) byId.set(p.id, p);
  for (const p of live) byId.set(p.id, p); // canonical overrides pending
  return Array.from(byId.values());
}

function evictPendingRows(
  queryClient: QueryClient,
  marketId: string,
  myAddress: string,
  batchFillKeys: Set<string>,
  batchMyFillKeys: Set<string>,
  batchPositionIds: Set<string>,
): void {
  const myAddressLc = myAddress.toLowerCase();
  queryClient.setQueryData<RecentFill[]>(
    ['prediction', 'market-fills', marketId],
    (prev) => prev?.filter((f) => !(f._pending && batchFillKeys.has(fillKey(f)))),
  );
  queryClient.setQueryData<RecentFill[]>(
    ['prediction', 'my-fills', marketId, myAddress],
    (prev) => prev?.filter((f) => !(f._pending && batchMyFillKeys.has(fillKey(f)))),
  );
  queryClient.setQueryData<RecentFill[]>(
    ['prediction', 'my-fills', marketId, myAddressLc],
    (prev) => prev?.filter((f) => !(f._pending && batchMyFillKeys.has(fillKey(f)))),
  );
  queryClient.setQueryData<Position[]>(
    ['prediction-positions', myAddress],
    (prev) => prev?.filter((p) => !(p._pending && batchPositionIds.has(p.id))),
  );
}

// Internal helpers exported for unit testing only.
export const __test = {
  fillKey,
  parseFillsFromEvents,
  parseNewPositionIds,
  synthesizePositionsForUser,
  dedupePrepend,
  mergeLivePositions,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
