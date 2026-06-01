/**
 * Regression tests for the ChatService connection state machine.
 *
 * Bug 65d2a5a3: after wallet login the chat input flickered
 * "Type a message…" <-> "Connecting…" forever. Root cause: a socket replaced by
 * a second connect() during the auth window still ran its onclose, flipping
 * status to 'disconnected' and scheduling a reconnect against the live
 * connection — a self-sustaining oscillation (reproduced below). Fix: each
 * socket's handlers gate on `this.ws === socket`, so a replaced socket is inert.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatService } from '../chat-service';

class MockWS {
  static instances: MockWS[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  url: string;
  readyState = 0;
  onopen: ((e?: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  sent: Array<Record<string, unknown>> = [];
  closedWith: number | null = null;
  constructor(url: string) {
    this.url = url;
    MockWS.instances.push(this);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close(code = 1006) {
    if (this.closedWith !== null) return;
    this.closedWith = code;
    this.readyState = MockWS.CLOSED;
    const h = this.onclose;
    if (h) queueMicrotask(() => h({ code }));
  }
  open() {
    this.readyState = MockWS.OPEN;
    this.onopen?.({});
  }
  server(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('ChatService connection lifecycle (65d2a5a3)', () => {
  let svc: ChatService;
  let statuses: string[];
  let sessionExpiredCount: number;
  const signFn = vi.fn(async () => ({ signature: 'sig', address: '0xabc', displayName: 'me' }));

  beforeEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWS;
    MockWS.instances = [];
    svc = new ChatService();
    statuses = [];
    sessionExpiredCount = 0;
    svc.on('status', (s) => statuses.push(s));
    svc.on('session_expired', () => { sessionExpiredCount++; });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function completeAuth(ws: MockWS) {
    ws.open();
    ws.server({ type: 'auth_challenge', challenge: 'c' });
    await flush(); // signFn resolves → auth_response sent
    ws.server({ type: 'auth_success', address: '0xabc', displayName: 'me' });
  }

  const afterFirstConnected = (seq: string[]) => seq.slice(seq.indexOf('connected') + 1);

  it('baseline: a single connect settles to connected and stays', async () => {
    svc.connect('ws://x', signFn);
    expect(MockWS.instances.length).toBe(1);
    await completeAuth(MockWS.instances[0]);

    expect(statuses).toEqual(['connecting', 'connected']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(MockWS.instances.length).toBe(1);
    expect(svc.getStatus()).toBe('connected');
  });

  it('a 2nd connect() during the auth window does not oscillate', async () => {
    svc.connect('ws://x', signFn); // socket A → connecting
    MockWS.instances[0].open(); // opened, still connecting (awaiting auth)

    // Second connect before auth completes (remount / StrictMode / 2nd consumer).
    svc.connect('ws://x', signFn); // replaces A with socket B
    await flush(); // A.onclose fires here — must be inert

    // Authenticate the live socket, like the server would.
    const live = MockWS.instances[MockWS.instances.length - 1];
    await completeAuth(live);
    await vi.advanceTimersByTimeAsync(8000);

    // Fixed behavior: settles to connected, bounded sockets, and crucially
    // never emits 'disconnected' after reaching 'connected'.
    expect(svc.getStatus()).toBe('connected');
    expect(MockWS.instances.length).toBeLessThanOrEqual(2);
    expect(afterFirstConnected(statuses)).toEqual([]);
    expect(statuses).not.toContain('disconnected');
  });

  it('a replaced socket closing does not reconnect against the live one', async () => {
    svc.connect('ws://x', signFn);
    const a = MockWS.instances[0];
    a.open();
    svc.connect('ws://x', signFn); // replace A with B
    const b = MockWS.instances[1];
    await flush();
    await completeAuth(b); // B connected
    expect(svc.getStatus()).toBe('connected');

    // A late/duplicate close of the abandoned socket A must be a no-op.
    a.close(1006);
    await flush();
    await vi.advanceTimersByTimeAsync(8000);

    expect(svc.getStatus()).toBe('connected');
    expect(afterFirstConnected(statuses)).toEqual([]);
  });

  it('server 4401 on the live socket still surfaces session_expired', async () => {
    svc.connect('ws://x', signFn);
    const ws = MockWS.instances[0];
    await completeAuth(ws);
    expect(svc.getStatus()).toBe('connected');

    ws.close(4401); // server "Auth failed"
    await flush();

    expect(sessionExpiredCount).toBe(1);
    expect(svc.getStatus()).toBe('disconnected');
    // session_expired latches: no reconnect churn.
    await vi.advanceTimersByTimeAsync(8000);
    expect(svc.getStatus()).toBe('disconnected');
  });

  it('an ordinary close reconnects exactly once (no cascade)', async () => {
    svc.connect('ws://x', signFn);
    await completeAuth(MockWS.instances[0]);
    expect(svc.getStatus()).toBe('connected');

    MockWS.instances[0].close(1006); // unexpected drop
    await flush();
    expect(svc.getStatus()).toBe('disconnected');

    // One reconnect after backoff; no socket storm.
    await vi.advanceTimersByTimeAsync(2000);
    expect(MockWS.instances.length).toBe(2);
    await completeAuth(MockWS.instances[1]);
    expect(svc.getStatus()).toBe('connected');
  });
});
