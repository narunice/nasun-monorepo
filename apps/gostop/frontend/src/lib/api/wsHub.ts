/**
 * Gostop feed WS client.
 *
 * Connects to backend `/api/gostop/feed/{live,whales}`. Backend has no auth
 * on these endpoints; visibility masking happens server-side based on the
 * player's feed_visibility setting (loaded per-connection at upgrade).
 *
 * Per-topic singleton: multiple useFeed(topic) consumers share a single
 * WebSocket. Reference counting tears the socket down when the last
 * subscriber unmounts.
 *
 * Dedupe: backend replays its in-memory ring buffer on connect, so a
 * reconnect produces overlap with previously-delivered events. We dedupe on
 * `${tx_digest}:${event_seq}` to keep React lists stable.
 *
 * Reconnect: exponential backoff 1s → 2s → 4s → 8s → 30s cap. Reset on a
 * successful open that survives 10s.
 *
 * Visibility: when the tab is hidden, close the socket and stop reconnect
 * attempts; on visible, immediately reopen. Mobile background tabs would
 * otherwise hold a stale socket indefinitely.
 */

import { useEffect, useState } from 'react';

export type FeedTopic = 'live' | 'whales';
export type FeedEventKind = 'round' | 'whale' | 'streak';

export interface FeedEvent {
  kind: FeedEventKind;
  game_id: number;
  // Masked: original wallet for 'public', hashed pseudonym for 'anonymous',
  // or empty for delayed/opt-out (server filters those before sending).
  player: string;
  anonymous: boolean;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  tx_digest: string;
  event_seq: number;
  ts: number;
}

const WS_BASE = import.meta.env.VITE_GOSTOP_WS_URL ?? '';
const DEDUPE_CAP = 1000;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 30_000] as const;
const STABLE_OPEN_MS = 10_000;

type Listener = (ev: FeedEvent) => void;

export interface HelloFrame {
  kind: 'hello';
  topic: FeedTopic;
  // Most recent event timestamp the server has ever observed on this topic
  // (0 if none since boot). Independent of the current live-window cutoff
  // so the UI can show "last round 12m ago" during quiet periods.
  lastEventTs: number;
  liveWindowMs: number;
  now: number;
}
type HelloListener = (msg: HelloFrame) => void;

interface TopicChannel {
  topic: FeedTopic;
  socket: WebSocket | null;
  listeners: Set<Listener>;
  helloListeners: Set<HelloListener>;
  lastHello: HelloFrame | null;
  dedupe: Set<string>;
  // FIFO of dedupe keys to bound the set.
  dedupeOrder: string[];
  backoffIndex: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  stableTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

const channels: Map<FeedTopic, TopicChannel> = new Map();

function rememberKey(ch: TopicChannel, key: string): boolean {
  if (ch.dedupe.has(key)) return false;
  ch.dedupe.add(key);
  ch.dedupeOrder.push(key);
  if (ch.dedupeOrder.length > DEDUPE_CAP) {
    const drop = ch.dedupeOrder.shift();
    if (drop !== undefined) ch.dedupe.delete(drop);
  }
  return true;
}

function clearReconnect(ch: TopicChannel): void {
  if (ch.reconnectTimer) {
    clearTimeout(ch.reconnectTimer);
    ch.reconnectTimer = null;
  }
}

function clearStableTimer(ch: TopicChannel): void {
  if (ch.stableTimer) {
    clearTimeout(ch.stableTimer);
    ch.stableTimer = null;
  }
}

function scheduleReconnect(ch: TopicChannel): void {
  if (ch.closed) return;
  if (ch.reconnectTimer) return;
  const delay = BACKOFF_MS[Math.min(ch.backoffIndex, BACKOFF_MS.length - 1)];
  ch.backoffIndex = Math.min(ch.backoffIndex + 1, BACKOFF_MS.length - 1);
  ch.reconnectTimer = setTimeout(() => {
    ch.reconnectTimer = null;
    openSocket(ch);
  }, delay);
}

function openSocket(ch: TopicChannel): void {
  if (ch.closed) return;
  if (!WS_BASE) {
    console.warn('[gostop-ws] VITE_GOSTOP_WS_URL not configured');
    return;
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }
  if (ch.socket && (ch.socket.readyState === WebSocket.OPEN || ch.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const url = `${WS_BASE}/api/gostop/feed/${ch.topic}`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch (err) {
    console.error('[gostop-ws] open failed', err);
    scheduleReconnect(ch);
    return;
  }
  ch.socket = ws;

  ws.addEventListener('open', () => {
    clearStableTimer(ch);
    ch.stableTimer = setTimeout(() => {
      ch.backoffIndex = 0;
    }, STABLE_OPEN_MS);
  });

  ws.addEventListener('message', (event) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
    } catch {
      return;
    }
    const msg = parsed as { kind?: string };
    if (msg && msg.kind === 'hello') {
      const hello = parsed as HelloFrame;
      ch.lastHello = hello;
      for (const fn of ch.helloListeners) {
        try { fn(hello); } catch (err) { console.error('[gostop-ws] hello listener', err); }
      }
      return;
    }
    const ev = parsed as FeedEvent;
    if (!ev || typeof ev.tx_digest !== 'string') return;
    // Update lastEventTs from observed live events too, so the empty-state
    // copy keeps rolling even on long-lived sockets that never re-hello.
    if (ch.lastHello && typeof ev.ts === 'number' && ev.ts > ch.lastHello.lastEventTs) {
      ch.lastHello = { ...ch.lastHello, lastEventTs: ev.ts };
      for (const fn of ch.helloListeners) {
        try { fn(ch.lastHello); } catch (err) { console.error('[gostop-ws] hello listener', err); }
      }
    }
    const key = `${ev.tx_digest}:${ev.event_seq}`;
    if (!rememberKey(ch, key)) return;
    for (const fn of ch.listeners) {
      try {
        fn(ev);
      } catch (err) {
        console.error('[gostop-ws] listener error', err);
      }
    }
  });

  ws.addEventListener('close', () => {
    clearStableTimer(ch);
    ch.socket = null;
    scheduleReconnect(ch);
  });

  ws.addEventListener('error', () => {
    // close event fires after error; let close handle reconnect.
  });
}

function getChannel(topic: FeedTopic): TopicChannel {
  let ch = channels.get(topic);
  if (!ch) {
    ch = {
      topic,
      socket: null,
      listeners: new Set(),
      helloListeners: new Set(),
      lastHello: null,
      dedupe: new Set(),
      dedupeOrder: [],
      backoffIndex: 0,
      reconnectTimer: null,
      stableTimer: null,
      closed: false,
    };
    channels.set(topic, ch);
  }
  return ch;
}

function teardown(ch: TopicChannel): void {
  ch.closed = true;
  clearReconnect(ch);
  clearStableTimer(ch);
  if (ch.socket) {
    try { ch.socket.close(1000, 'unsubscribed'); } catch { /* ignore */ }
    ch.socket = null;
  }
  ch.lastHello = null;
  channels.delete(ch.topic);
}

let visibilityHookInstalled = false;
function installVisibilityHook(): void {
  if (visibilityHookInstalled) return;
  if (typeof document === 'undefined') return;
  visibilityHookInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      for (const ch of channels.values()) {
        clearReconnect(ch);
        if (ch.socket) {
          try { ch.socket.close(1000, 'visibility-hidden'); } catch { /* ignore */ }
          ch.socket = null;
        }
      }
    } else {
      for (const ch of channels.values()) {
        ch.backoffIndex = 0;
        openSocket(ch);
      }
    }
  });
}

/**
 * Subscribe to a feed topic. Returns an unsubscribe function. The underlying
 * WebSocket is shared across subscribers and torn down when the last one
 * unsubscribes.
 */
export function subscribeFeed(topic: FeedTopic, listener: Listener): () => void {
  installVisibilityHook();
  const ch = getChannel(topic);
  ch.listeners.add(listener);
  if (!ch.socket) {
    openSocket(ch);
  }
  return () => {
    ch.listeners.delete(listener);
    if (ch.listeners.size === 0 && ch.helloListeners.size === 0) {
      teardown(ch);
    }
  };
}

/**
 * Subscribe to the per-topic hello/heartbeat frame carrying lastEventTs.
 * Fires immediately with the cached hello if one is already known, then on
 * every fresh hello or live-event-derived update.
 */
export function subscribeHello(topic: FeedTopic, listener: HelloListener): () => void {
  installVisibilityHook();
  const ch = getChannel(topic);
  ch.helloListeners.add(listener);
  if (ch.lastHello) listener(ch.lastHello);
  if (!ch.socket) {
    openSocket(ch);
  }
  return () => {
    ch.helloListeners.delete(listener);
    if (ch.listeners.size === 0 && ch.helloListeners.size === 0) {
      teardown(ch);
    }
  };
}

/** React hook: lastEventTs for a topic (0 if unknown yet). */
export function useFeedLastEventTs(topic: FeedTopic): number {
  const [ts, setTs] = useState<number>(0);
  useEffect(() => {
    const unsub = subscribeHello(topic, (msg) => setTs(msg.lastEventTs));
    return () => {
      unsub();
      setTs(0);
    };
  }, [topic]);
  return ts;
}

/**
 * React hook: subscribe to a feed topic and accumulate the most recent
 * events (newest first), capped at `max`. Re-renders only on new events
 * passing dedupe.
 */
export function useFeed(topic: FeedTopic, max: number = 50): FeedEvent[] {
  const [events, setEvents] = useState<FeedEvent[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeFeed(topic, (ev) => {
      setEvents((prev) => {
        const next = [ev, ...prev];
        if (next.length > max) next.length = max;
        return next;
      });
    });
    return () => {
      unsubscribe();
      setEvents([]);
    };
  }, [topic, max]);

  return events;
}
