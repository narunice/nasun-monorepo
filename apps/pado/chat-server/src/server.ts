import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { generateChallenge, verifySignature } from './auth.js';
import { initStore, insertMessage, getRecentMessages, purgeOldMessages, closeStore } from './store.js';
import { roomExists } from './rooms.js';
import type {
  AuthenticatedClient,
  ClientMessage,
  ServerMessage,
  ChatMessagePayload,
  ChatServerConfig,
  DEFAULT_CONFIG,
} from './types.js';
import { DEFAULT_CONFIG as CONFIG } from './types.js';

// ===== State =====

// Pending authentication: ws -> { challenge, timeout }
const pendingAuth = new Map<WebSocket, { challenge: string; timeout: ReturnType<typeof setTimeout> }>();

// Authenticated clients: ws -> AuthenticatedClient
const authenticatedClients = new Map<WebSocket, AuthenticatedClient>();

// Rate limiting: address -> last message timestamp
const lastMessageTime = new Map<string, number>();

// History request rate limiting: address -> last history request timestamp
const lastHistoryTime = new Map<string, number>();

// Connection count per IP for DoS prevention
const connectionsPerIp = new Map<string, number>();

// ===== Helpers =====

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(msg: ServerMessage, excludeWs?: WebSocket): void {
  for (const [ws] of authenticatedClients) {
    if (ws !== excludeWs) {
      send(ws, msg);
    }
  }
}

function broadcastOnlineCount(): void {
  const count = authenticatedClients.size;
  broadcast({ type: 'online_count', count });
}

function getClientIp(ws: WebSocket, req: { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// ===== Message Handling =====

function handleSendMessage(ws: WebSocket, client: AuthenticatedClient, msg: ClientMessage & { type: 'send_message' }): void {
  const roomId = msg.roomId ?? 0;
  const content = msg.content?.trim();

  // Validate room
  if (!roomExists(roomId)) {
    send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
    return;
  }

  // Validate content
  if (!content || content.length === 0) {
    send(ws, { type: 'error', code: 'EMPTY_MESSAGE', message: 'Message cannot be empty' });
    return;
  }

  if (content.length > CONFIG.maxMessageLength) {
    send(ws, { type: 'error', code: 'MESSAGE_TOO_LONG', message: `Message exceeds ${CONFIG.maxMessageLength} characters` });
    return;
  }

  // Rate limit check
  const now = Date.now();
  const lastTime = lastMessageTime.get(client.address) || 0;
  if (now - lastTime < CONFIG.rateLimitMs) {
    const waitMs = CONFIG.rateLimitMs - (now - lastTime);
    send(ws, { type: 'error', code: 'RATE_LIMITED', message: `Please wait ${Math.ceil(waitMs / 1000)}s` });
    return;
  }

  // Store and broadcast
  lastMessageTime.set(client.address, now);
  client.lastMessageAt = now;

  const stored = insertMessage({
    roomId,
    sender: client.address,
    content,
    messageType: msg.replyToId ? 'reply' : 'text',
    replyToId: msg.replyToId ?? null,
    timestamp: now,
  });

  const chatMsg: ChatMessagePayload = {
    type: 'chat_message',
    id: stored.id,
    roomId: stored.roomId,
    sender: stored.sender,
    content: stored.content,
    messageType: stored.messageType,
    replyToId: stored.replyToId,
    timestamp: stored.timestamp,
  };

  // Broadcast to all authenticated clients (including sender for confirmation)
  broadcast(chatMsg);
}

function handleLoadHistory(ws: WebSocket, msg: ClientMessage & { type: 'load_history' }, client?: AuthenticatedClient): void {
  const roomId = msg.roomId ?? 0;
  const limit = Math.min(msg.limit ?? 50, 100);

  if (!roomExists(roomId)) {
    send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
    return;
  }

  // Rate limit history requests (skip for initial load on auth)
  if (client) {
    const now = Date.now();
    const lastTime = lastHistoryTime.get(client.address) || 0;
    if (now - lastTime < CONFIG.historyRateLimitMs) {
      send(ws, { type: 'error', code: 'RATE_LIMITED', message: 'History requests too frequent' });
      return;
    }
    lastHistoryTime.set(client.address, now);
  }

  const messages = getRecentMessages(roomId, limit + 1, msg.before);
  const hasMore = messages.length > limit;
  const result = hasMore ? messages.slice(1) : messages; // Remove oldest if we got extra

  send(ws, {
    type: 'history',
    messages: result.map((m) => ({
      type: 'chat_message' as const,
      id: m.id,
      roomId: m.roomId,
      sender: m.sender,
      content: m.content,
      messageType: m.messageType,
      replyToId: m.replyToId,
      timestamp: m.timestamp,
    })),
    hasMore,
  });
}

// ===== Connection Lifecycle =====

function handleConnection(ws: WebSocket, req: { socket: { remoteAddress?: string }; headers: Record<string, string | string[] | undefined> }): void {
  const ip = getClientIp(ws, req);

  // Check connection limit per IP
  const currentCount = connectionsPerIp.get(ip) || 0;
  if (currentCount >= CONFIG.maxConnectionsPerIp) {
    send(ws, { type: 'auth_error', reason: 'Too many connections from this IP' });
    ws.close(4429, 'Too many connections');
    return;
  }
  connectionsPerIp.set(ip, currentCount + 1);

  // Generate and send challenge
  const challenge = generateChallenge();
  const timeout = setTimeout(() => {
    if (pendingAuth.has(ws)) {
      send(ws, { type: 'auth_error', reason: 'Authentication timeout' });
      ws.close(4401, 'Auth timeout');
    }
  }, CONFIG.authTimeoutMs);

  pendingAuth.set(ws, { challenge, timeout });
  send(ws, { type: 'auth_challenge', challenge });

  // Handle messages
  ws.on('message', async (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', code: 'INVALID_JSON', message: 'Invalid message format' });
      return;
    }

    // If not authenticated yet, only accept auth_response
    if (!authenticatedClients.has(ws)) {
      if (msg.type !== 'auth_response') {
        send(ws, { type: 'error', code: 'NOT_AUTHENTICATED', message: 'Please authenticate first' });
        return;
      }

      const pending = pendingAuth.get(ws);
      if (!pending) {
        send(ws, { type: 'auth_error', reason: 'No pending challenge' });
        ws.close(4401, 'No pending challenge');
        return;
      }

      const verifiedAddress = await verifySignature(pending.challenge, msg.signature, msg.address);
      clearTimeout(pending.timeout);
      pendingAuth.delete(ws);

      if (!verifiedAddress) {
        send(ws, { type: 'auth_error', reason: 'Invalid signature' });
        ws.close(4401, 'Auth failed');
        return;
      }

      // Successfully authenticated
      const client: AuthenticatedClient = {
        ws,
        address: verifiedAddress,
        connectedAt: Date.now(),
        lastMessageAt: 0,
      };
      authenticatedClients.set(ws, client);

      send(ws, { type: 'auth_success', address: verifiedAddress });

      // Send recent messages as initial history
      handleLoadHistory(ws, { type: 'load_history', roomId: 0, limit: 50 });

      // Notify everyone of updated online count
      broadcastOnlineCount();

      console.log(`[Chat] Authenticated: ${verifiedAddress.slice(0, 10)}... (${authenticatedClients.size} online)`);
      return;
    }

    // Authenticated message handling
    const client = authenticatedClients.get(ws)!;

    switch (msg.type) {
      case 'send_message':
        handleSendMessage(ws, client, msg);
        break;
      case 'load_history':
        handleLoadHistory(ws, msg, client);
        break;
      default:
        send(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: `Unknown message type: ${(msg as { type: string }).type}` });
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    const pending = pendingAuth.get(ws);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingAuth.delete(ws);
    }

    const wasAuthenticated = authenticatedClients.has(ws);
    const client = authenticatedClients.get(ws);
    authenticatedClients.delete(ws);

    // Decrement IP counter
    const count = connectionsPerIp.get(ip) || 1;
    if (count <= 1) {
      connectionsPerIp.delete(ip);
    } else {
      connectionsPerIp.set(ip, count - 1);
    }

    if (wasAuthenticated) {
      broadcastOnlineCount();
      console.log(`[Chat] Disconnected: ${client?.address.slice(0, 10)}... (${authenticatedClients.size} online)`);
    }
  });

  ws.on('error', (err) => {
    console.error('[Chat] WebSocket error:', err.message);
  });
}

// ===== HTTP API (for history without WebSocket) =====

function getCorsOrigin(reqOrigin: string | undefined): string | null {
  if (!reqOrigin) return null;
  return CONFIG.allowedOrigins.includes(reqOrigin) ? reqOrigin : null;
}

function handleHttpRequest(req: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined> }, res: { writeHead: (code: number, headers?: Record<string, string>) => void; end: (body?: string) => void }): void {
  const origin = getCorsOrigin(req.headers?.origin as string | undefined);
  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
    corsHeaders['Vary'] = 'Origin';
  }
  res.writeHead(200, corsHeaders);

  if (req.method === 'OPTIONS') {
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${CONFIG.port}`);

  if (url.pathname === '/api/messages' && req.method === 'GET') {
    const roomId = parseInt(url.searchParams.get('roomId') || '0', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
    const before = url.searchParams.get('before')
      ? parseInt(url.searchParams.get('before')!, 10)
      : undefined;

    if (!roomExists(roomId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }

    const messages = getRecentMessages(roomId, limit + 1, before);
    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(1) : messages;

    res.end(JSON.stringify({ messages: result, hasMore }));
    return;
  }

  if (url.pathname === '/api/status' && req.method === 'GET') {
    res.end(JSON.stringify({
      online: authenticatedClients.size,
      uptime: process.uptime(),
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ===== Startup =====

function start(): void {
  // Initialize SQLite store
  initStore(CONFIG);
  console.log(`[Chat] SQLite store initialized at ${CONFIG.dbPath}`);

  // Create HTTP server (for REST API + WebSocket upgrade)
  const httpServer = createServer(handleHttpRequest);

  // Create WebSocket server with message size limit
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: CONFIG.maxWsMessageBytes,
  });
  wss.on('connection', handleConnection);

  httpServer.listen(CONFIG.port, () => {
    console.log(`[Chat] Server running on port ${CONFIG.port}`);
    console.log(`[Chat] WebSocket: ws://localhost:${CONFIG.port}`);
    console.log(`[Chat] REST API: http://localhost:${CONFIG.port}/api/messages`);
  });

  // Periodic message retention cleanup
  const retentionTimer = setInterval(() => {
    const purged = purgeOldMessages(CONFIG.messageRetentionDays);
    if (purged > 0) {
      console.log(`[Chat] Purged ${purged} expired messages`);
    }
  }, CONFIG.retentionCleanupIntervalMs);

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Chat] Shutting down...');
    clearInterval(retentionTimer);
    wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
    wss.close();
    httpServer.close();
    closeStore();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
