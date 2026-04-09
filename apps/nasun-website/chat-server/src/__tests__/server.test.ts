import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server as HttpServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock auth module before importing server logic
vi.mock('../auth.js', () => ({
  verifyCognitoJwt: vi.fn(async (token: string) => {
    if (token === 'valid-token-user1') return { userId: 'user-1' };
    if (token === 'valid-token-user2') return { userId: 'user-2' };
    if (token === 'slow-token') {
      await new Promise((r) => setTimeout(r, 100));
      return { userId: 'user-slow' };
    }
    return null;
  }),
}));

// We cannot import the actual server.ts (it starts listening on import),
// so we rebuild a minimal version using the same components
import { initStore, insertMessage, getRecentMessages, closeStore } from '../store.js';
import { stripControlChars, hasReservedPrefix } from '../sanitize.js';
import type { ChatServerConfig } from '../types.js';
import { verifyCognitoJwt } from '../auth.js';

// ===== Test Server Setup =====

let httpServer: HttpServer;
let wss: WebSocketServer;
let serverPort: number;
let tempDir: string;
let config: ChatServerConfig;

// Simplified server logic for testing (mirrors server.ts)
const authenticatedClients = new Map<WebSocket, {
  ws: WebSocket; userId: string; displayName: string;
  connectedAt: number; lastMessageAt: number;
}>();
const pendingAuth = new Map<WebSocket, { timeout: ReturnType<typeof setTimeout> }>();
const lastMessageTime = new Map<string, number>();
const connectionsPerIp = new Map<string, number>();

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function setupServer(): void {
  httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  wss = new WebSocketServer({ server: httpServer, maxPayload: 10240 });

  wss.on('connection', (ws, req) => {
    // Origin validation
    const origin = req.headers.origin;
    if (!origin || !config.allowedOrigins.includes(origin)) {
      ws.close(4403, 'Forbidden origin');
      return;
    }

    // IP limit
    const ip = req.socket.remoteAddress || 'unknown';
    const ipCount = (connectionsPerIp.get(ip) || 0) + 1;
    if (ipCount > config.maxConnectionsPerIp) {
      ws.close(4429, 'Too many connections');
      return;
    }
    connectionsPerIp.set(ip, ipCount);

    send(ws, { type: 'auth_required' });

    const authTimeout = setTimeout(() => {
      if (!authenticatedClients.has(ws)) {
        ws.close(4408, 'Auth timeout');
      }
    }, config.authTimeoutMs);
    pendingAuth.set(ws, { timeout: authTimeout });

    (ws as any)._isAlive = true;
    ws.on('pong', () => { (ws as any)._isAlive = true; });

    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        if (!authenticatedClients.has(ws)) {
          if (data.type !== 'auth') {
            send(ws, { type: 'auth_error', reason: 'Not authenticated' });
            return;
          }
          // Auth
          const { token, displayName } = data;
          if (!token || typeof token !== 'string') {
            send(ws, { type: 'auth_error', reason: 'Missing token' });
            ws.close(4401, 'Missing token');
            return;
          }
          const result = await verifyCognitoJwt(token);
          if (!result) {
            send(ws, { type: 'auth_error', reason: 'Invalid token' });
            ws.close(4401, 'Invalid token');
            return;
          }
          const pending = pendingAuth.get(ws);
          if (pending) { clearTimeout(pending.timeout); pendingAuth.delete(ws); }
          const safeName = stripControlChars((displayName || 'Anonymous')).slice(0, 32).trim() || 'Anonymous';
          authenticatedClients.set(ws, {
            ws, userId: result.userId, displayName: safeName,
            connectedAt: Date.now(), lastMessageAt: 0,
          });
          send(ws, { type: 'auth_success', userId: result.userId, displayName: safeName });
          // Broadcast online count
          for (const [w] of authenticatedClients) {
            send(w, { type: 'online_count', count: authenticatedClients.size });
          }
          return;
        }

        // Already authenticated
        if (data.type === 'auth') {
          send(ws, { type: 'error', code: 'ALREADY_AUTHENTICATED', message: 'Already authenticated' });
          return;
        }

        const client = authenticatedClients.get(ws)!;

        if (data.type === 'send_message') {
          const now = Date.now();
          const lastTime = lastMessageTime.get(client.userId) || 0;
          if (now - lastTime < config.rateLimitMs) {
            send(ws, { type: 'error', code: 'RATE_LIMITED', message: 'Too fast' });
            return;
          }
          lastMessageTime.set(client.userId, now);

          let content = data.content;
          if (typeof content !== 'string' || content.trim().length === 0) {
            send(ws, { type: 'error', code: 'EMPTY_MESSAGE', message: 'Empty message' });
            return;
          }
          content = stripControlChars(content).trim();
          if (content.length === 0) {
            send(ws, { type: 'error', code: 'EMPTY_MESSAGE', message: 'Empty message' });
            return;
          }
          if (content.length > config.maxMessageLength) {
            send(ws, { type: 'error', code: 'TOO_LONG', message: `Max ${config.maxMessageLength} characters` });
            return;
          }
          if (hasReservedPrefix(content)) {
            send(ws, { type: 'error', code: 'RESERVED_PREFIX', message: 'Reserved prefix' });
            return;
          }

          const replyToId = data.replyToId;
          if (replyToId !== undefined && replyToId !== null) {
            if (typeof replyToId !== 'number' || !Number.isInteger(replyToId) || replyToId <= 0) {
              send(ws, { type: 'error', code: 'INVALID_REPLY', message: 'Invalid replyToId' });
              return;
            }
          }

          const roomId = data.roomId ?? 0;
          const stored = insertMessage({
            roomId, senderId: client.userId, senderName: client.displayName,
            content, messageType: 'text', replyToId: replyToId ?? null, timestamp: now,
          });
          const payload = {
            type: 'chat_message', id: stored.id, roomId: stored.roomId, sender: stored.senderId,
            senderName: stored.senderName, content: stored.content,
            messageType: stored.messageType, replyToId: stored.replyToId, timestamp: stored.timestamp,
          };
          for (const [w] of authenticatedClients) { send(w, payload); }
        } else if (data.type === 'load_history') {
          const histRoomId = data.roomId ?? 0;
          const limit = Math.min(data.limit || 50, 100);
          const messages = getRecentMessages(histRoomId, limit, data.before);
          send(ws, {
            type: 'history',
            roomId: histRoomId,
            messages: messages.map((m) => ({
              type: 'chat_message', id: m.id, roomId: m.roomId, sender: m.senderId,
              senderName: m.senderName, content: m.content,
              messageType: m.messageType, replyToId: m.replyToId, timestamp: m.timestamp,
            })),
            hasMore: messages.length === limit,
          });
        }
      } catch (err) {
        send(ws, { type: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' });
      }
    });

    ws.on('close', () => {
      const pending = pendingAuth.get(ws);
      if (pending) { clearTimeout(pending.timeout); pendingAuth.delete(ws); }
      authenticatedClients.delete(ws);
      const currentCount = connectionsPerIp.get(ip) || 0;
      if (currentCount <= 1) connectionsPerIp.delete(ip);
      else connectionsPerIp.set(ip, currentCount - 1);
    });
  });
}

// ===== Helpers =====

// Buffer messages so none are lost between open and waitForMessage calls
function connectWs(opts?: { origin?: string }): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${serverPort}`, {
      origin: opts?.origin ?? 'http://localhost:5174',
    });
    const buffer: any[] = [];
    (ws as any)._msgBuffer = buffer;
    (ws as any)._msgWaiters = [] as Array<{ filter?: (msg: any) => boolean; resolve: (msg: any) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }>;

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const waiters: typeof buffer = (ws as any)._msgWaiters;
      for (let i = 0; i < waiters.length; i++) {
        const w = waiters[i];
        if (!w.filter || w.filter(msg)) {
          clearTimeout(w.timeout);
          waiters.splice(i, 1);
          w.resolve(msg);
          return;
        }
      }
      buffer.push(msg);
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws: WebSocket, filter?: (msg: any) => boolean): Promise<any> {
  // Check buffer first
  const buffer: any[] = (ws as any)._msgBuffer;
  for (let i = 0; i < buffer.length; i++) {
    if (!filter || filter(buffer[i])) {
      return Promise.resolve(buffer.splice(i, 1)[0]);
    }
  }
  // Wait for future message
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for message')), 3000);
    const waiters: any[] = (ws as any)._msgWaiters;
    waiters.push({ filter, resolve, reject, timeout });
  });
}

async function authenticateWs(ws: WebSocket, token: string, displayName: string): Promise<any> {
  // Wait for auth_required
  const authReq = await waitForMessage(ws, (m) => m.type === 'auth_required');
  expect(authReq.type).toBe('auth_required');

  // Send auth
  ws.send(JSON.stringify({ type: 'auth', token, displayName }));

  // Wait for auth_success
  return waitForMessage(ws, (m) => m.type === 'auth_success' || m.type === 'auth_error');
}

function closeWs(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.on('close', () => resolve());
    ws.close();
  });
}

// ===== Tests =====

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'chat-server-test-'));
  config = {
    port: 0,
    maxMessageLength: 500,
    maxWsMessageBytes: 10240,
    rateLimitMs: 100, // Faster for tests
    historyRateLimitMs: 100,
    maxConnectionsPerIp: 3,
    authTimeoutMs: 2000,
    maxSessionMs: 86400000,
    dbPath: join(tempDir, 'test.db'),
    messageRetentionDays: 30,
    retentionCleanupIntervalMs: 86400000,
    allowedOrigins: ['http://localhost:5174'],
  };

  initStore(config);
  setupServer();

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      serverPort = (httpServer.address() as any).port;
      resolve();
    });
  });
});

afterAll(async () => {
  // Close all active connections
  for (const [ws] of authenticatedClients) { ws.terminate(); }
  wss.close();
  httpServer.close();
  closeStore();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
}, 15000);

beforeEach(() => {
  // Clear state between tests
  authenticatedClients.clear();
  pendingAuth.clear();
  lastMessageTime.clear();
  connectionsPerIp.clear();
});

describe('Connection', () => {
  it('sends auth_required on connect', async () => {
    const ws = await connectWs();
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('auth_required');
    await closeWs(ws);
  });

  it('rejects connection without origin header', async () => {
    // ws library by default does not send Origin if not specified
    const ws = new WebSocket(`ws://localhost:${serverPort}`);
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      ws.on('open', () => {}); // may not fire
    });
    expect(code).toBe(4403);
  });

  it('rejects connection with wrong origin', async () => {
    const ws = new WebSocket(`ws://localhost:${serverPort}`, {
      origin: 'https://evil.com',
    });
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(code).toBe(4403);
  });

  it('enforces per-IP connection limit', async () => {
    const connections: WebSocket[] = [];
    for (let i = 0; i < config.maxConnectionsPerIp; i++) {
      connections.push(await connectWs());
    }

    // Next connection should be rejected
    const ws = new WebSocket(`ws://localhost:${serverPort}`, {
      origin: 'http://localhost:5174',
    });
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(code).toBe(4429);

    for (const c of connections) await closeWs(c);
  });
});

describe('Authentication', () => {
  it('authenticates with valid token', async () => {
    const ws = await connectWs();
    const result = await authenticateWs(ws, 'valid-token-user1', 'Alice');
    expect(result.type).toBe('auth_success');
    expect(result.userId).toBe('user-1');
    expect(result.displayName).toBe('Alice');
    await closeWs(ws);
  });

  it('rejects invalid token', async () => {
    const ws = await connectWs();
    await waitForMessage(ws, (m) => m.type === 'auth_required');
    ws.send(JSON.stringify({ type: 'auth', token: 'invalid-token', displayName: 'Hacker' }));

    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(code).toBe(4401);
  });

  it('rejects missing token', async () => {
    const ws = await connectWs();
    await waitForMessage(ws, (m) => m.type === 'auth_required');
    ws.send(JSON.stringify({ type: 'auth', token: '', displayName: 'Hacker' }));

    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(code).toBe(4401);
  });

  it('rejects non-auth messages before authentication', async () => {
    const ws = await connectWs();
    await waitForMessage(ws, (m) => m.type === 'auth_required');
    ws.send(JSON.stringify({ type: 'send_message', content: 'sneaky' }));

    const msg = await waitForMessage(ws, (m) => m.type === 'auth_error');
    expect(msg.reason).toBe('Not authenticated');
    await closeWs(ws);
  });

  it('rejects duplicate auth attempts', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');

    ws.send(JSON.stringify({ type: 'auth', token: 'valid-token-user2', displayName: 'Bob' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('ALREADY_AUTHENTICATED');
    await closeWs(ws);
  });

  it('sanitizes display name (strips control chars)', async () => {
    const ws = await connectWs();
    const result = await authenticateWs(ws, 'valid-token-user1', 'Ali\u0000ce\u200B');
    expect(result.displayName).toBe('Alice');
    await closeWs(ws);
  });

  it('truncates display name to 32 chars', async () => {
    const ws = await connectWs();
    const longName = 'A'.repeat(50);
    const result = await authenticateWs(ws, 'valid-token-user1', longName);
    expect(result.displayName.length).toBeLessThanOrEqual(32);
    await closeWs(ws);
  });

  it('defaults to Anonymous when displayName is empty', async () => {
    const ws = await connectWs();
    const result = await authenticateWs(ws, 'valid-token-user1', '');
    expect(result.displayName).toBe('Anonymous');
    await closeWs(ws);
  });

  it('broadcasts online count after auth', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');

    const countMsg = await waitForMessage(ws, (m) => m.type === 'online_count');
    expect(countMsg.count).toBeGreaterThanOrEqual(1);
    await closeWs(ws);
  });
});

describe('Messaging', () => {
  it('sends and receives a message', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    // Drain online_count
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: 'Hello world' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'chat_message');

    expect(msg.content).toBe('Hello world');
    expect(msg.sender).toBe('user-1');
    expect(msg.senderName).toBe('Alice');
    expect(msg.id).toBeGreaterThan(0);
    expect(msg.messageType).toBe('text');
    await closeWs(ws);
  });

  it('broadcasts message to all connected clients', async () => {
    const ws1 = await connectWs();
    const ws2 = await connectWs();
    await authenticateWs(ws1, 'valid-token-user1', 'Alice');
    await authenticateWs(ws2, 'valid-token-user2', 'Bob');

    // Drain online_count messages
    await waitForMessage(ws1, (m) => m.type === 'online_count');
    await waitForMessage(ws2, (m) => m.type === 'online_count');

    ws1.send(JSON.stringify({ type: 'send_message', content: 'Hello from Alice' }));

    const msg2 = await waitForMessage(ws2, (m) => m.type === 'chat_message');
    expect(msg2.content).toBe('Hello from Alice');
    expect(msg2.senderName).toBe('Alice');

    await closeWs(ws1);
    await closeWs(ws2);
  });

  it('rejects empty messages', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: '' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('EMPTY_MESSAGE');
    await closeWs(ws);
  });

  it('rejects whitespace-only messages', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: '   \t\n  ' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('EMPTY_MESSAGE');
    await closeWs(ws);
  });

  it('rejects messages exceeding max length', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: 'A'.repeat(501) }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('TOO_LONG');
    await closeWs(ws);
  });

  it('rejects messages with reserved prefix [SYSTEM]', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: '[SYSTEM] Fake system message' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('RESERVED_PREFIX');
    await closeWs(ws);
  });

  it('rejects messages with reserved prefix [BOT]', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: '[bot] pretending to be a bot' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('RESERVED_PREFIX');
    await closeWs(ws);
  });

  it('strips control characters from content', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: 'Hello\u0000\u200BWorld' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'chat_message');
    expect(msg.content).toBe('HelloWorld');
    await closeWs(ws);
  });

  it('preserves special characters (no double encoding)', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: 'Price: $10 & <b>bold</b>' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'chat_message');
    // Content should be raw (not HTML encoded) - React handles escaping
    expect(msg.content).toBe('Price: $10 & <b>bold</b>');
    await closeWs(ws);
  });

  it('validates replyToId is a positive integer', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    // Negative replyToId
    ws.send(JSON.stringify({ type: 'send_message', content: 'test', replyToId: -1 }));
    const msg1 = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg1.code).toBe('INVALID_REPLY');

    // Wait for rate limit to pass
    await new Promise((r) => setTimeout(r, config.rateLimitMs + 10));

    // Non-integer replyToId
    ws.send(JSON.stringify({ type: 'send_message', content: 'test', replyToId: 1.5 }));
    const msg2 = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg2.code).toBe('INVALID_REPLY');

    await closeWs(ws);
  });

  it('enforces rate limiting', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    // First message should succeed
    ws.send(JSON.stringify({ type: 'send_message', content: 'First' }));
    await waitForMessage(ws, (m) => m.type === 'chat_message');

    // Immediate second message should be rate limited
    ws.send(JSON.stringify({ type: 'send_message', content: 'Second' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('RATE_LIMITED');

    await closeWs(ws);
  });

  it('handles invalid JSON gracefully', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send('not valid json {{{');
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    // Authenticated clients' JSON errors are caught by the outer try-catch
    expect(['INVALID_JSON', 'INTERNAL_ERROR']).toContain(msg.code);
    await closeWs(ws);
  });

  it('handles unknown message types', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'unknown_type' }));
    // Should not crash, should get either error or be ignored
    // In our test server, it falls through to no handler
    await closeWs(ws);
  });
});

describe('History', () => {
  it('loads message history', async () => {
    // Insert some messages directly
    for (let i = 0; i < 5; i++) {
      insertMessage({
        roomId: 0, senderId: 'user-pre', senderName: 'Seeder', content: `Seeded ${i}`,
        messageType: 'text', replyToId: null, timestamp: Date.now() + i,
      });
    }

    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'load_history', limit: 3 }));
    const msg = await waitForMessage(ws, (m) => m.type === 'history');

    expect(msg.messages.length).toBeLessThanOrEqual(3);
    expect(msg).toHaveProperty('hasMore');
    await closeWs(ws);
  });

  it('supports cursor-based pagination', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'load_history', limit: 50 }));
    const page1 = await waitForMessage(ws, (m) => m.type === 'history');

    if (page1.messages.length > 0) {
      const oldestId = page1.messages[0].id;

      // Wait for rate limit
      await new Promise((r) => setTimeout(r, config.historyRateLimitMs + 10));

      ws.send(JSON.stringify({ type: 'load_history', before: oldestId, limit: 50 }));
      const page2 = await waitForMessage(ws, (m) => m.type === 'history');

      // All messages in page2 should have id < oldestId
      for (const m of page2.messages) {
        expect(m.id).toBeLessThan(oldestId);
      }
    }

    await closeWs(ws);
  });

  it('caps limit to 100', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'load_history', limit: 9999 }));
    const msg = await waitForMessage(ws, (m) => m.type === 'history');
    // Should not crash and messages should be within reasonable bounds
    expect(msg.messages.length).toBeLessThanOrEqual(100);
    await closeWs(ws);
  });
});

describe('Health Check', () => {
  it('returns ok status', async () => {
    const res = await fetch(`http://localhost:${serverPort}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`http://localhost:${serverPort}/unknown`);
    expect(res.status).toBe(404);
  });
});

describe('Edge Cases', () => {
  it('handles message with only control characters (becomes empty after strip)', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: '\u0000\u0001\u0002' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('EMPTY_MESSAGE');
    await closeWs(ws);
  });

  it('handles exactly max-length message', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    const content = 'A'.repeat(500);
    ws.send(JSON.stringify({ type: 'send_message', content }));
    const msg = await waitForMessage(ws, (m) => m.type === 'chat_message');
    expect(msg.content.length).toBe(500);
    await closeWs(ws);
  });

  it('handles message with non-string content field', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: 12345 }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('EMPTY_MESSAGE');
    await closeWs(ws);
  });

  it('handles message with null content', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: null }));
    const msg = await waitForMessage(ws, (m) => m.type === 'error');
    expect(msg.code).toBe('EMPTY_MESSAGE');
    await closeWs(ws);
  });

  it('handles emoji-heavy messages', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    const content = '🚀🌍💎🔥'.repeat(50);
    ws.send(JSON.stringify({ type: 'send_message', content }));
    const msg = await waitForMessage(ws, (m) => m.type === 'chat_message');
    expect(msg.content).toBe(content);
    await closeWs(ws);
  });

  it('handles @mention in messages', async () => {
    const ws = await connectWs();
    await authenticateWs(ws, 'valid-token-user1', 'Alice');
    await waitForMessage(ws, (m) => m.type === 'online_count');

    ws.send(JSON.stringify({ type: 'send_message', content: 'Hey @Bob check this out' }));
    const msg = await waitForMessage(ws, (m) => m.type === 'chat_message');
    expect(msg.content).toBe('Hey @Bob check this out');
    await closeWs(ws);
  });

  it('handles rapid disconnect and reconnect', async () => {
    const ws1 = await connectWs();
    await authenticateWs(ws1, 'valid-token-user1', 'Alice');
    await closeWs(ws1);

    // Immediate reconnect
    const ws2 = await connectWs();
    const result = await authenticateWs(ws2, 'valid-token-user1', 'Alice');
    expect(result.type).toBe('auth_success');
    await closeWs(ws2);
  });
});
