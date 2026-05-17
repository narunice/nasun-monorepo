/**
 * Postgres LISTEN -> hub bridge.
 *
 * The api process opens a *dedicated* postgres.js client (separate from the
 * reader pool) since LISTEN holds a connection for the lifetime of the
 * subscription. Reconnect is handled by postgres.js internally, but we wrap
 * with onlisten/onclose hooks so we re-broadcast nothing while disconnected.
 *
 * Indexer writers call NOTIFY 'gostop_feed', '<json>' after a successful
 * INSERT/UPDATE commit. Payloads are bounded (Postgres NOTIFY limit is 8000
 * bytes — emitNotify in lib/notify.ts encodes the minimum needed; richer
 * detail must be fetched via REST).
 */

import postgres from 'postgres';
import { env } from '../../env.js';
import { hub, type FeedEvent, type FeedEventKind } from './hub.js';

type NotifyPayload = {
  kind: FeedEventKind;
  game_id: number;
  player: string;
  bet_amount: string;
  payout: string | null;
  multiplier_bps: string | null;
  tx_digest: string;
  event_seq: number;
  ts: number;
};

const WHALE_KINDS: ReadonlySet<FeedEventKind> = new Set(['whale']);

// Burst coalesce window for 'ticket_bought' frames. Lottery mint-day can emit
// 200+ tickets/min; pacing reduces per-tick EventEmitter pressure on the api
// process. Other kinds bypass the queue (low volume, latency-sensitive).
const TICKET_COALESCE_MS = 100;

let _client: ReturnType<typeof postgres> | null = null;
let _unlisten: (() => Promise<void>) | null = null;
let _ticketQueue: FeedEvent[] = [];
let _ticketTimer: ReturnType<typeof setTimeout> | null = null;

function isWhale(ev: FeedEvent): boolean {
  // ticket_bought is broadcast-only on the 'live' topic; outcome is
  // unresolved so whale promotion is meaningless. Guard early.
  if (ev.kind === 'ticket_bought') return false;
  // 'whale' kind events go to whales topic; for 'round' we also promote when
  // either bet or payout crosses the configured threshold. Threshold is a
  // safety net — indexer is the primary gate.
  if (WHALE_KINDS.has(ev.kind)) return true;
  try {
    const bet = BigInt(ev.bet_amount);
    const payout = ev.payout === null ? 0n : BigInt(ev.payout);
    return bet >= env.feed.whaleBetThresholdRaw
        || payout >= env.feed.whalePayoutThresholdRaw;
  } catch {
    return false;
  }
}

function flushTicketQueue(): void {
  _ticketTimer = null;
  const drained = _ticketQueue;
  _ticketQueue = [];
  for (const ev of drained) hub.broadcast('live', ev);
}

function handlePayload(raw: string): void {
  let parsed: NotifyPayload;
  try {
    parsed = JSON.parse(raw) as NotifyPayload;
  } catch (err) {
    console.error('[feed-listen] invalid NOTIFY payload', { err, raw: raw.slice(0, 200) });
    return;
  }
  // Minimum schema check. Reject anything that wouldn't render cleanly to a
  // client; better to drop one event than crash the bridge.
  if (
    typeof parsed.kind !== 'string'
    || typeof parsed.player !== 'string'
    || typeof parsed.tx_digest !== 'string'
  ) {
    console.warn('[feed-listen] malformed payload, dropping');
    return;
  }

  const ev: FeedEvent = {
    kind: parsed.kind,
    game_id: Number(parsed.game_id) || 0,
    player: parsed.player.toLowerCase(),
    bet_amount: String(parsed.bet_amount ?? '0'),
    payout: parsed.payout === null || parsed.payout === undefined
      ? null
      : String(parsed.payout),
    multiplier_bps: parsed.multiplier_bps === null || parsed.multiplier_bps === undefined
      ? null
      : String(parsed.multiplier_bps),
    tx_digest: parsed.tx_digest,
    event_seq: Number(parsed.event_seq) || 0,
    ts: Number(parsed.ts) || Date.now(),
  };

  if (ev.kind === 'ticket_bought') {
    // Coalesce burst: queue and flush every TICKET_COALESCE_MS. Never lands
    // on the whales topic (isWhale early-returns false above).
    _ticketQueue.push(ev);
    if (!_ticketTimer) {
      _ticketTimer = setTimeout(flushTicketQueue, TICKET_COALESCE_MS);
    }
    return;
  }

  hub.broadcast('live', ev);
  if (isWhale(ev)) hub.broadcast('whales', ev);
}

export async function startFeedListener(): Promise<void> {
  if (_client) return;
  // max:1 — LISTEN holds the connection; pooling would defeat the point.
  // Reader URL: api process only needs SELECT-style privileges (no NOTIFY
  // privilege required to LISTEN).
  const url = env.db.readUrl && env.db.readUrl.length > 0
    ? env.db.readUrl
    : env.db.writeUrl;
  _client = postgres(url, {
    max: 1,
    idle_timeout: 0,
    max_lifetime: 0,
    connect_timeout: 10,
  });

  const { unlisten } = await _client.listen(
    env.feed.channel,
    (payload) => handlePayload(payload),
    () => {
      console.log('[feed-listen] subscribed', { channel: env.feed.channel });
    },
  );
  _unlisten = unlisten;
}

export async function stopFeedListener(): Promise<void> {
  try {
    if (_unlisten) await _unlisten();
  } catch (err) {
    console.error('[feed-listen] unlisten error', err);
  }
  _unlisten = null;
  if (_ticketTimer) {
    clearTimeout(_ticketTimer);
    _ticketTimer = null;
  }
  // Best-effort flush of anything buffered at shutdown.
  if (_ticketQueue.length > 0) flushTicketQueue();
  try {
    if (_client) await _client.end({ timeout: 5 });
  } catch (err) {
    console.error('[feed-listen] end error', err);
  }
  _client = null;
}
