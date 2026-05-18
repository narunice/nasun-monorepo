/**
 * WebSocket feed server.
 *
 * Endpoints (attached to the http.Server in api/server.ts via upgrade event):
 *   /api/gostop/feed/live    — every settled round
 *   /api/gostop/feed/whales  — whale threshold-passing rounds only
 *
 * Per-connection lifecycle:
 *   1. on upgrade: snapshot opt-out set, decide topic, send replay-on-connect
 *      of the hub's ring buffer (apply mask to each event), then subscribe.
 *   2. on hub event: filter (opt-out drop + delayed-window skip), apply mask
 *      (anonymous/public), send.
 *   3. heartbeat ping every 30s, idle close after 60s of no pong.
 *
 * Visibility policy snapshot is per-connection so a wallet that toggles
 * feed_visibility mid-session will see the new policy on reconnect (the
 * /me settings PATCH triggers cacheDel; new connections re-fetch).
 */

import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { env } from '../../env.js';
import { applyMask, type FeedVisibility } from '../lib/visibility-mask.js';
import { loadVisibilityMap } from '../lib/visibility-lookup.js';
import { hub, type FeedEvent, type FeedTopic } from './hub.js';

const HEARTBEAT_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;

type VisibilityMap = Map<string, FeedVisibility>;

function topicFromPath(pathname: string): FeedTopic | null {
  if (pathname === '/api/gostop/feed/live')   return 'live';
  if (pathname === '/api/gostop/feed/whales') return 'whales';
  return null;
}

export function isFeedUpgrade(pathname: string): boolean {
  return topicFromPath(pathname) !== null;
}

/**
 * Serialize an event for the wire after applying the player's visibility
 * mask. Returns null when the row must be suppressed (opt-out or within the
 * 24h `delayed` window).
 */
function maskedFrame(ev: FeedEvent, visibility: VisibilityMap): string | null {
  const v: FeedVisibility = visibility.get(ev.player) ?? 'public';
  const masked = applyMask(ev.player, v, ev.ts, env.feed.anonSalt);
  if (!masked) return null;
  return JSON.stringify({
    kind: ev.kind,
    game_id: ev.game_id,
    player: masked.player,
    anonymous: masked.anonymous,
    bet_amount: ev.bet_amount,
    payout: ev.payout,
    multiplier_bps: ev.multiplier_bps,
    tx_digest: ev.tx_digest,
    event_seq: ev.event_seq,
    ts: ev.ts,
  });
}

function safeSend(ws: WebSocket, frame: string): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(frame);
  } catch (err) {
    console.error('[feed-ws] send error', err);
  }
}

export function createFeedWsServer(): WebSocketServer {
  // noServer:true — we hand-route the upgrade event from the http.Server in
  // api/server.ts so the same port serves Hono HTTP + WS endpoints.
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const topic = topicFromPath(url.pathname);
    if (!topic) {
      ws.close(1008, 'unknown_topic');
      return;
    }

    // Per-connection snapshot. Mutations server-side bump the cache TTL so
    // new connections see fresh policy within 30s. Loader reads from
    // writer() (see visibility-lookup file header) to stay coherent with
    // the last PATCH even when a replica is lagging.
    let visibility: VisibilityMap;
    try {
      visibility = await loadVisibilityMap();
    } catch (err) {
      console.error('[feed-ws] visibility load failed', err);
      ws.close(1011, 'visibility_load_failed');
      return;
    }

    // Hello frame: gives the client `lastEventTs` so it can render
    // "last round Xm ago" copy even when the live window is currently empty.
    // `kind: 'hello'` is distinct from any FeedEventKind so clients can
    // discriminate without ambiguity.
    safeSend(ws, JSON.stringify({
      kind: 'hello',
      topic,
      lastEventTs: hub.getLastEventTs(topic),
      liveWindowMs: env.feed.liveWindowMs,
      now: Date.now(),
    }));

    // Replay-on-connect: serve the ring buffer through the same mask the
    // live stream uses so the policy is consistent across replay+live edge.
    for (const ev of hub.replay(topic)) {
      const frame = maskedFrame(ev, visibility);
      if (frame) safeSend(ws, frame);
    }

    const unsubscribe = hub.subscribe(topic, (ev) => {
      const frame = maskedFrame(ev, visibility);
      if (frame) safeSend(ws, frame);
    });

    // Heartbeat + idle timeout. Feed clients are pure listeners — they do
    // not send messages — so we MUST treat pong as the keepalive signal.
    // Without refreshing the idle timer on pong, every connected client
    // would be reaped at IDLE_TIMEOUT_MS regardless of liveness.
    let alive = true;
    const idleTimer = setTimeout(() => {
      try { ws.close(1000, 'idle'); } catch { /* ignore */ }
    }, IDLE_TIMEOUT_MS);
    ws.on('pong', () => {
      alive = true;
      idleTimer.refresh();
    });
    ws.on('message', () => {
      idleTimer.refresh();
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        try { ws.terminate(); } catch { /* ignore */ }
        return;
      }
      alive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }, HEARTBEAT_MS);

    ws.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(idleTimer);
      unsubscribe();
    });
    ws.on('error', (err) => {
      console.error('[feed-ws] connection error', err);
    });
  });

  return wss;
}
