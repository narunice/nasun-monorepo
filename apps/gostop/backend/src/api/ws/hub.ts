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
    this.emit(topic, event);
  }

  subscribe(topic: FeedTopic, fn: (ev: FeedEvent) => void): () => void {
    this.on(topic, fn);
    return () => this.off(topic, fn);
  }

  /** Snapshot of recent events for replay-on-connect. */
  replay(topic: FeedTopic): FeedEvent[] {
    return (this.rings.get(topic) ?? []).slice();
  }
}

export const hub = new FeedHub();
