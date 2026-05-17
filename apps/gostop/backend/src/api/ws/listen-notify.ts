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
  payout: string;
  multiplier_bps: string;
  tx_digest: string;
  event_seq: number;
  ts: number;
};

const WHALE_KINDS: ReadonlySet<FeedEventKind> = new Set(['whale']);

let _client: ReturnType<typeof postgres> | null = null;
let _unlisten: (() => Promise<void>) | null = null;

function isWhale(ev: FeedEvent): boolean {
  // 'whale' kind events go to whales topic; for 'round' we also promote when
  // either bet or payout crosses the configured threshold. Threshold is a
  // safety net — indexer is the primary gate.
  if (WHALE_KINDS.has(ev.kind)) return true;
  try {
    const bet = BigInt(ev.bet_amount);
    const payout = BigInt(ev.payout);
    return bet >= env.feed.whaleBetThresholdRaw
        || payout >= env.feed.whalePayoutThresholdRaw;
  } catch {
    return false;
  }
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
    payout: String(parsed.payout ?? '0'),
    multiplier_bps: String(parsed.multiplier_bps ?? '0'),
    tx_digest: parsed.tx_digest,
    event_seq: Number(parsed.event_seq) || 0,
    ts: Number(parsed.ts) || Date.now(),
  };

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
  try {
    if (_client) await _client.end({ timeout: 5 });
  } catch (err) {
    console.error('[feed-listen] end error', err);
  }
  _client = null;
}
