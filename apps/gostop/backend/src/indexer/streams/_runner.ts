/**
 * Shared paged-cursor runner. Wraps the repetitive scaffolding (read cursor,
 * page through queryEvents, persist cursor, idempotent retry) so each stream
 * handler only writes the row-mapping logic.
 *
 * Cursor / page invariants are documented in apps/gostop/docs/game-result-schema.md §6.
 */

import { eventType, type StreamDef, type StreamKey } from '../../config/contracts.js';
import { readCursor, writeCursor } from '../../db/cursor.js';
import { queryEventsByType, type EventCursor, type SuiEventEnvelope } from '../../rpc.js';

export const PAGE_SIZE = 50;
export const MAX_PAGES_PER_TICK = 20;

/**
 * Process events for a single stream until either:
 *   - the cursor catches up (empty page or hasNextPage=false), or
 *   - MAX_PAGES_PER_TICK pages have been processed (yield to other streams).
 *
 * The handler receives each page's envelopes and returns the count of rows
 * effectively persisted (used for log breadcrumbs only — not for control flow).
 *
 * Cursor advancement happens AFTER the handler resolves for each page. If the
 * handler throws, the cursor is not advanced and the same page replays on the
 * next tick. Handlers therefore MUST be idempotent (ON CONFLICT DO NOTHING or
 * explicit UPSERT).
 */
export async function runStream<T>(
  def: StreamDef,
  handler: (envelopes: SuiEventEnvelope<T>[]) => Promise<number>
): Promise<number> {
  const cursor = await readCursor(def.key);
  let rpcCursor: EventCursor | null =
    cursor.lastTx && cursor.lastSeq !== null
      ? { txDigest: cursor.lastTx, eventSeq: String(cursor.lastSeq) }
      : null;

  const tag = eventType(def.originalPackageId, def.module, def.eventName);
  let total = 0;

  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    const res = await queryEventsByType<T>(tag, rpcCursor, PAGE_SIZE, false);
    if (res.data.length === 0) break;

    total += await handler(res.data);

    const last = res.data[res.data.length - 1];
    rpcCursor = res.nextCursor ?? { txDigest: last.id.txDigest, eventSeq: last.id.eventSeq };
    await writeCursor(
      def.key,
      last.id.txDigest,
      Number(last.id.eventSeq),
      last.timestampMs ? Number(last.timestampMs) : Date.now()
    );

    if (!res.hasNextPage) break;
  }

  return total;
}

/** Helper: lowercase + assume Sui-normalized 32-byte address from RPC. */
export function normalizeAddr(a: string): string {
  return a.toLowerCase();
}

/** Helper: cursor key list of all streams for diagnostic dumps. */
export type AnyStreamKey = StreamKey;
