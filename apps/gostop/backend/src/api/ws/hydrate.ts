/**
 * Boot-time hydrate for the WS feed ring buffer.
 *
 * Without this, the first wave of subscribers after a deploy or pm2 restart
 * sees "Waiting for rounds…" until the next on-chain event arrives, which
 * can be minutes on a quiet devnet. We seed both topics from game_round so
 * cold-open users immediately see the last 30 minutes of activity.
 *
 * Not on the request path — runs once at startup, best-effort. Failure is
 * logged but never blocks api boot.
 */

import { reader } from '../../db/client.js';
import { env } from '../../env.js';
import { isWhalePayload } from '../../indexer/notify-feed.js';
import { hub, type FeedEvent } from './hub.js';

type Row = {
  game_id: number;
  player: string;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  tx_digest: string;
  event_seq: number;
  timestamp_ms: string;
};

function rowToEvent(r: Row): FeedEvent {
  return {
    kind: 'round',
    game_id: Number(r.game_id),
    player: r.player.toLowerCase(),
    bet_amount: String(r.bet_amount),
    payout: String(r.payout),
    multiplier_bps: String(r.multiplier_bps),
    tx_digest: r.tx_digest,
    event_seq: Number(r.event_seq),
    ts: Number(r.timestamp_ms),
  };
}

export async function hydrateFeedRings(): Promise<void> {
  if (!env.feed.enabled) return;
  const sql = reader();
  const cutoff = Date.now() - env.feed.liveWindowMs;
  const limit = env.feed.ringSize;
  let rows: Row[];
  try {
    rows = await sql<Row[]>`
      SELECT game_id, player, bet_amount, payout, multiplier_bps,
             tx_digest, event_seq, timestamp_ms
      FROM gostop.game_round
      WHERE status = 'final' AND timestamp_ms > ${cutoff}
      ORDER BY timestamp_ms ASC
      LIMIT ${limit}
    `;
  } catch (err) {
    console.error('[feed-hydrate] query failed', err);
    return;
  }
  if (rows.length === 0) {
    console.log('[feed-hydrate] no rows in window', { windowMs: env.feed.liveWindowMs });
    return;
  }
  const liveEvents = rows.map(rowToEvent);
  const whaleEvents = liveEvents.filter((ev) => isWhalePayload({
    kind: ev.kind, game_id: ev.game_id, player: ev.player,
    bet_amount: ev.bet_amount, payout: ev.payout,
    multiplier_bps: ev.multiplier_bps, tx_digest: ev.tx_digest,
    event_seq: ev.event_seq, ts: ev.ts,
  }));
  hub.seed('live', liveEvents);
  hub.seed('whales', whaleEvents);
  console.log('[feed-hydrate] seeded', {
    live: liveEvents.length,
    whales: whaleEvents.length,
    windowMs: env.feed.liveWindowMs,
  });
}
