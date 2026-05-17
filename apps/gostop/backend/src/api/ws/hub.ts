/**
 * In-process feed hub. Single source of truth for live WS broadcasts.
 *
 * Topology:
 *   indexer (writer) -> Postgres NOTIFY 'gostop_feed' (commit-triggered)
 *     -> api LISTEN client (listen-notify.ts) -> hub.broadcast(topic, event)
 *     -> per-topic Set<WebSocket> subscribers
 *
 * Process-local on purpose (Tier 0 runs a single api instance — see handoff
 * PR6 note on `instances: 1`). Multi-instance fan-out would still go through
 * Postgres LISTEN, just with multiple api processes attached.
 *
 * Ring buffer per topic supports replay-on-connect so a fresh client doesn't
 * see an empty stream while waiting for the next event.
 */

import { EventEmitter } from 'node:events';
import { env } from '../../env.js';

export type FeedTopic = 'live' | 'whales';

export type FeedEventKind = 'round' | 'whale' | 'streak';

export interface FeedEvent {
  kind: FeedEventKind;
  // game_id 1..6 matching bankroll_pool::GameCap.game_id (or 0 for cross-game
  // synthetic events like streak).
  game_id: number;
  // Lowercase hex 0x-prefixed Sui address. Masking is applied at the route
  // layer based on the player's feed_visibility setting.
  player: string;
  // Bet/payout in raw units (USDC 6 decimals on devnet). String to avoid
  // BigInt JSON serialization issues.
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  // Source tx digest + event seq — lets clients dedupe across reconnect.
  tx_digest: string;
  event_seq: number;
  // Event timestamp in ms (chain-provided, not server-side).
  ts: number;
}

const TOPICS: readonly FeedTopic[] = ['live', 'whales'] as const;

class FeedHub extends EventEmitter {
  private readonly rings: Map<FeedTopic, FeedEvent[]> = new Map();
  // Per-topic max event timestamp ever observed. Preserved independent of
  // ring contents so the frontend can render "last round 12m ago" even after
  // the ring has been filtered down to zero rows by the live-window cutoff.
  private readonly lastEventTs: Map<FeedTopic, number> = new Map();

  constructor() {
    super();
    // Hub can fan out to many WS sockets; default 10 listener cap is too low.
    this.setMaxListeners(0);
    for (const t of TOPICS) this.rings.set(t, []);
  }

  broadcast(topic: FeedTopic, event: FeedEvent): void {
    const ring = this.rings.get(topic);
    if (ring) {
      ring.push(event);
      if (ring.length > env.feed.ringSize) ring.shift();
    }
    const prev = this.lastEventTs.get(topic) ?? 0;
    if (event.ts > prev) this.lastEventTs.set(topic, event.ts);
    this.emit(topic, event);
  }

  subscribe(topic: FeedTopic, fn: (ev: FeedEvent) => void): () => void {
    this.on(topic, fn);
    return () => this.off(topic, fn);
  }

  /** Boot-time seed. Push historical events into the ring without re-emitting
   *  on the topic — subscribers do not exist yet and we only need replay() to
   *  return non-empty for the first connection. Caller passes events in
   *  ascending ts order; we still maintain lastEventTs and ring cap.
   *
   *  Idempotent: only seeds when the ring is empty. This also avoids racing
   *  with live NOTIFY events that may have already populated the ring while
   *  the hydrate query was in flight — live always wins over historical. */
  seed(topic: FeedTopic, events: FeedEvent[]): void {
    const ring = this.rings.get(topic);
    if (!ring || ring.length > 0) return;
    for (const ev of events) {
      ring.push(ev);
      if (ring.length > env.feed.ringSize) ring.shift();
      const prev = this.lastEventTs.get(topic) ?? 0;
      if (ev.ts > prev) this.lastEventTs.set(topic, ev.ts);
    }
  }

  /** Snapshot of recent events for replay-on-connect. Filters out events
   *  older than env.feed.liveWindowMs so stale catch-up data from a previous
   *  indexer run is never served to new subscribers. */
  replay(topic: FeedTopic): FeedEvent[] {
    const cutoff = Date.now() - env.feed.liveWindowMs;
    return (this.rings.get(topic) ?? []).filter((ev) => ev.ts > cutoff);
  }

  /** Last event timestamp ever seen on this topic (independent of live window),
   *  or 0 if none. Used in the WS hello frame so the client can show
   *  "last round Xm ago" even during quiet periods. */
  getLastEventTs(topic: FeedTopic): number {
    return this.lastEventTs.get(topic) ?? 0;
  }
}

export const hub = new FeedHub();
