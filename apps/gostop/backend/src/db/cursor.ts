import type { StreamKey } from '../config/contracts.js';
import { writer } from './client.js';

export interface Cursor {
  stream: StreamKey;
  lastTx: string | null;
  lastSeq: number | null;
  lastTsMs: number | null;
}

/**
 * Read a stream's last-processed cursor. Returns null fields when the stream
 * has never been processed (first run / fresh deploy).
 */
export async function readCursor(stream: StreamKey): Promise<Cursor> {
  const sql = writer();
  const rows = await sql<
    { last_tx: string | null; last_seq: number | null; last_ts_ms: string | null }[]
  >`
    SELECT last_tx, last_seq, last_ts_ms
    FROM gostop.indexer_cursor
    WHERE stream = ${stream}
  `;
  if (rows.length === 0) {
    return { stream, lastTx: null, lastSeq: null, lastTsMs: null };
  }
  const r = rows[0];
  return {
    stream,
    lastTx: r.last_tx,
    lastSeq: r.last_seq,
    lastTsMs: r.last_ts_ms === null ? null : Number(r.last_ts_ms),
  };
}

/**
 * Persist a cursor advance. Idempotent — caller passes the highest
 * (tx_digest, event_seq, timestamp_ms) observed in the batch.
 *
 * Caveat: Sui event cursors are tuples of (tx_digest, event_seq) — they are
 * NOT lexicographically ordered. The cursor row is therefore a checkpoint
 * for *resuming queryEvents*, not a strict monotonic high-water mark.
 */
export async function writeCursor(
  stream: StreamKey,
  lastTx: string,
  lastSeq: number,
  lastTsMs: number
): Promise<void> {
  const sql = writer();
  await sql`
    INSERT INTO gostop.indexer_cursor (stream, last_tx, last_seq, last_ts_ms, updated_at)
    VALUES (${stream}, ${lastTx}, ${lastSeq}, ${lastTsMs}, now())
    ON CONFLICT (stream) DO UPDATE
      SET last_tx = EXCLUDED.last_tx,
          last_seq = EXCLUDED.last_seq,
          last_ts_ms = EXCLUDED.last_ts_ms,
          updated_at = now()
  `;
}
