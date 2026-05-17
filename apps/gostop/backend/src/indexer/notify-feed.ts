/**
 * Indexer-side NOTIFY helper. Writers call this after committing a row that
 * should appear on the live WS feed. The api process LISTENs on the same
 * channel (api/ws/listen-notify.ts) and fans out to subscribers.
 *
 * Payload is JSON-encoded and kept small — Postgres NOTIFY has an 8000 byte
 * payload limit (configurable, but we stay well below the default). Anything
 * the client needs beyond the minimum (round detail, history) is fetched via
 * REST keyed on tx_digest+event_seq.
 *
 * NOTIFY only fires on transaction COMMIT. postgres.js auto-commits each
 * statement, so calling this right after the INSERT is correct.
 *
 * Idempotency: NOTIFY itself is fire-and-forget. If a handler re-runs the
 * same INSERT (cursor replay), the INSERT is a no-op (ON CONFLICT DO NOTHING)
 * — guard at the call site by emitting only for newly-inserted rows
 * (RETURNING based).
 */

import type { Sql } from 'postgres';
import { env } from '../env.js';
import type { FeedEventKind } from '../api/ws/hub.js';

export interface FeedNotifyPayload {
  kind: FeedEventKind;
  game_id: number;
  player: string;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  tx_digest: string;
  event_seq: number;
  ts: number;
}

// Hard ceiling to stay well under Postgres NOTIFY limit. Player addr is 66
// chars, tx_digest is base58 (~44), the rest are short numbers — typical
// payload is ~250 bytes. 4 KB is a generous safety margin.
const MAX_PAYLOAD_BYTES = 4096;

export async function notifyFeed(sql: Sql, payload: FeedNotifyPayload): Promise<void> {
  if (!env.feed.enabled) return;
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch (err) {
    console.error('[notify-feed] JSON encode failed', err);
    return;
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    console.warn('[notify-feed] payload too large, dropping', { bytes: json.length });
    return;
  }
  try {
    // sql.notify(channel, payload) is the postgres.js sugar for pg_notify.
    // Channel name is a static string (env-controlled), not user input.
    await sql.notify(env.feed.channel, json);
  } catch (err) {
    // Feed broadcasts are best-effort; never break the indexer because the
    // LISTEN connection had a hiccup.
    console.error('[notify-feed] dispatch failed', err);
  }
}

/** Build the canonical payload from a game_round row. */
export function payloadFromGameRound(row: {
  game_id: number;
  player: string;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  tx_digest: string;
  event_seq: number;
  timestamp_ms: string;
}, kind: FeedEventKind = 'round'): FeedNotifyPayload {
  return {
    kind,
    game_id: Number(row.game_id),
    player: row.player.toLowerCase(),
    bet_amount: String(row.bet_amount),
    payout: String(row.payout),
    multiplier_bps: String(row.multiplier_bps),
    tx_digest: row.tx_digest,
    event_seq: Number(row.event_seq),
    ts: Number(row.timestamp_ms),
  };
}

export function isWhalePayload(p: FeedNotifyPayload): boolean {
  try {
    return BigInt(p.bet_amount) >= env.feed.whaleBetThresholdRaw
        || BigInt(p.payout)     >= env.feed.whalePayoutThresholdRaw;
  } catch {
    return false;
  }
}
