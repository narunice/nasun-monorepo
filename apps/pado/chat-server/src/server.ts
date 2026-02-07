import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { generateChallenge, verifySignature } from './auth.js';
import {
  initStore, insertMessage, getRecentMessages, purgeOldMessages, closeStore,
  getNickname, setNickname, isNicknameAvailable, validateNickname, getNicknamesBatch,
  getNicknameRateLimit,
} from './store.js';
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
import {
  initLeaderboardStore, closeLeaderboardStore,
  getLeaderboard, getTraderAllPeriodStats, getTotalFillsCount, getTotalTradersCount,
  getIndexerState,
} from './leaderboard-store.js';
import { startIndexer, stopIndexer } from './indexer.js';
import { startAggregator, stopAggregator } from './aggregator.js';
import { VALID_PERIODS } from './leaderboard-types.js';
import type { LeaderboardConfig, Period } from './leaderboard-types.js';

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

  const senderNickname = getNickname(client.address);

  const chatMsg: ChatMessagePayload = {
    type: 'chat_message',
    id: stored.id,
    roomId: stored.roomId,
    sender: stored.sender,
    senderNickname,
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

  // Batch-fetch nicknames for all senders in this history page
  const uniqueSenders = [...new Set(result.map((m) => m.sender))];
  const nicknames = getNicknamesBatch(uniqueSenders);

  send(ws, {
    type: 'history',
    messages: result.map((m) => ({
      type: 'chat_message' as const,
      id: m.id,
      roomId: m.roomId,
      sender: m.sender,
      senderNickname: nicknames.get(m.sender) ?? null,
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

  // Heartbeat: mark alive on connect and pong
  (ws as any).isAlive = true;
  ws.on('pong', () => { (ws as any).isAlive = true; });

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

      // Validate authMethod if present
      if (msg.authMethod && msg.authMethod !== 'personal_sign' && msg.authMethod !== 'ephemeral') {
        send(ws, { type: 'auth_error', reason: 'Invalid auth method' });
        ws.close(4401, 'Invalid auth method');
        return;
      }
      if (msg.authMethod === 'ephemeral' && (typeof msg.ephemeralPubKey !== 'string' || msg.ephemeralPubKey.length > 100)) {
        send(ws, { type: 'auth_error', reason: 'Invalid ephemeral public key' });
        ws.close(4401, 'Invalid ephemeral key');
        return;
      }

      const verifiedAddress = await verifySignature(
        pending.challenge, msg.signature, msg.address,
        msg.authMethod, msg.ephemeralPubKey
      );
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

      const existingNickname = getNickname(verifiedAddress);
      const rateLimit = existingNickname ? getNicknameRateLimit(verifiedAddress) : undefined;
      send(ws, { type: 'auth_success', address: verifiedAddress, nickname: existingNickname, rateLimit });

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
      case 'set_nickname': {
        const nickname = typeof msg.nickname === 'string' ? msg.nickname.trim() : '';
        const validation = validateNickname(nickname);
        if (!validation.ok) {
          send(ws, { type: 'nickname_result', ok: false, error: validation.error });
          break;
        }
        const result = setNickname(client.address, nickname);
        if (result.ok) {
          send(ws, { type: 'nickname_result', ok: true, nickname, rateLimit: result.rateLimit });
        } else {
          send(ws, { type: 'nickname_result', ok: false, error: result.error, rateLimit: result.rateLimit });
        }
        break;
      }
      case 'check_nickname': {
        const nickname = typeof msg.nickname === 'string' ? msg.nickname.trim() : '';
        const validation = validateNickname(nickname);
        if (!validation.ok) {
          send(ws, { type: 'nickname_check', available: false, nickname });
          break;
        }
        const available = isNicknameAvailable(nickname);
        send(ws, { type: 'nickname_check', available, nickname });
        break;
      }
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

// Per-IP rate limiter for REST API endpoints
const apiRateMap = new Map<string, { count: number; resetAt: number }>();
const API_RATE_MAX = 30; // max requests per window
const API_RATE_WINDOW_MS = 60_000; // 1 minute window

function checkApiRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = apiRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    apiRateMap.set(ip, { count: 1, resetAt: now + API_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= API_RATE_MAX) return false;
  entry.count++;
  return true;
}

// Note: rate limit cleanup interval is started inside start() and cleared on shutdown.

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

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
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
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }

    const messages = getRecentMessages(roomId, limit + 1, before);
    const hasMore = messages.length > limit;
    const result = hasMore ? messages.slice(1) : messages;

    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ messages: result, hasMore }));
    return;
  }

  if (url.pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      online: authenticatedClients.size,
      uptime: process.uptime(),
    }));
    return;
  }

  // ===== Leaderboard API =====

  // Rate limit all leaderboard endpoints
  if (url.pathname.startsWith('/api/leaderboard')) {
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || 'unknown';
    if (!checkApiRateLimit(clientIp)) {
      res.writeHead(429, corsHeaders);
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
  }

  if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
    const period = url.searchParams.get('period') || '24h';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);

    if (!VALID_PERIODS.has(period)) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid period. Use: 24h, 7d, 30d, all' }));
      return;
    }

    try {
      const rows = getLeaderboard(period, limit);
      const addresses = rows.map((r) => r.address);
      const nicknames = addresses.length > 0 ? getNicknamesBatch(addresses) : new Map();

      // Convert raw quote volume to USD-formatted string
      const traders = rows.map((r) => ({
        rank: r.rank,
        address: r.address,
        nickname: nicknames.get(r.address) ?? null,
        volumeUsd: formatQuoteVolume(r.volume_quote),
        tradeCount: r.trade_count,
        uniquePools: r.unique_pools,
        rankChange: r.prev_rank > 0 ? r.prev_rank - r.rank : 0,
        lastTradeAt: r.last_trade_at,
      }));

      const updatedAt = rows.length > 0 ? rows[0].updated_at : Date.now();
      const totalTraders = getTotalTradersCount();

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ period, traders, updatedAt, totalTraders }));
    } catch (err) {
      console.error('[Leaderboard] API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Match /api/leaderboard/trader/:address (validated Sui address format)
  const traderMatch = url.pathname.match(/^\/api\/leaderboard\/trader\/(0x[a-fA-F0-9]{64})$/);
  if (traderMatch && req.method === 'GET') {
    const address = traderMatch[1];

    try {
      const rows = getTraderAllPeriodStats(address);
      const nickname = getNickname(address);

      const stats: Record<string, { rank: number; volume: string; tradeCount: number; uniquePools: number; rankChange: number } | null> = {
        '24h': null, '7d': null, '30d': null, 'all': null,
      };

      for (const row of rows) {
        stats[row.period] = {
          rank: row.rank,
          volume: formatQuoteVolume(row.volume_quote),
          tradeCount: row.trade_count,
          uniquePools: row.unique_pools,
          rankChange: row.prev_rank > 0 ? row.prev_rank - row.rank : 0,
        };
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ address, nickname, stats }));
    } catch (err) {
      console.error('[Leaderboard] Trader API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  if (url.pathname === '/api/leaderboard/status' && req.method === 'GET') {
    try {
      const lastIndexedAt = getIndexerState('last_indexed_at');
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        indexerRunning: !!CONFIG.deepbookPackage,
        lastIndexedAt: lastIndexedAt ? parseInt(lastIndexedAt, 10) : 0,
        totalFillsIndexed: getTotalFillsCount(),
        totalTradersTracked: getTotalTradersCount(),
      }));
    } catch (err) {
      console.error('[Leaderboard] Status API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({ error: 'Not found' }));
}

/**
 * Convert raw quote volume (NUSDC with 6 decimals) to USD-formatted string.
 */
function formatQuoteVolume(rawVolume: string): string {
  try {
    const raw = BigInt(rawVolume || '0');
    if (raw < 0n) return '0.00';
    const whole = raw / 1_000_000n;
    const frac = raw % 1_000_000n;
    const fracStr = frac.toString().padStart(6, '0').slice(0, 2);
    return `${whole}.${fracStr}`;
  } catch {
    return '0.00';
  }
}

// ===== Startup =====

function start(): void {
  // Initialize SQLite store (chat)
  initStore(CONFIG);
  console.log(`[Chat] SQLite store initialized at ${CONFIG.dbPath}`);

  // Initialize leaderboard store (separate DB)
  initLeaderboardStore({
    leaderboardDbPath: CONFIG.leaderboardDbPath,
    deepbookPackage: CONFIG.deepbookPackage,
    rpcUrl: CONFIG.rpcUrl,
    indexerPollIntervalMs: CONFIG.indexerPollIntervalMs,
    aggregationIntervalMs: CONFIG.aggregationIntervalMs,
    excludedAddresses: new Set(CONFIG.excludedAddresses),
  });
  console.log(`[Leaderboard] Store initialized at ${CONFIG.leaderboardDbPath}`);

  // Start indexer + aggregator if DeepBook package is configured
  const leaderboardEnabled = !!CONFIG.deepbookPackage;
  if (leaderboardEnabled) {
    const lbConfig: LeaderboardConfig = {
      leaderboardDbPath: CONFIG.leaderboardDbPath,
      deepbookPackage: CONFIG.deepbookPackage,
      rpcUrl: CONFIG.rpcUrl,
      indexerPollIntervalMs: CONFIG.indexerPollIntervalMs,
      aggregationIntervalMs: CONFIG.aggregationIntervalMs,
      excludedAddresses: new Set(CONFIG.excludedAddresses),
    };
    startIndexer(lbConfig);
    startAggregator(lbConfig);
  } else {
    console.log('[Leaderboard] Indexer disabled (DEEPBOOK_PACKAGE not set)');
  }

  // Create HTTP server (for REST API + WebSocket upgrade)
  const httpServer = createServer(handleHttpRequest);

  // Create WebSocket server with message size limit
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: CONFIG.maxWsMessageBytes,
  });
  wss.on('connection', handleConnection);

  // Heartbeat: detect dead connections every 30 seconds
  // WS-level ping keeps the connection alive through proxies.
  // Data-level heartbeat message triggers browser onmessage so client
  // keepalive timer can detect dead connections (browser WS API does NOT
  // expose ping frames to onmessage).
  const HEARTBEAT_INTERVAL_MS = 30_000;
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if ((ws as any).isAlive === false) {
        ws.terminate();
        return;
      }
      (ws as any).isAlive = false;
      ws.ping();
      // Send data-level heartbeat only to authenticated clients
      if (authenticatedClients.has(ws)) {
        send(ws, { type: 'heartbeat' });
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  httpServer.listen(CONFIG.port, () => {
    console.log(`[Chat] Server running on port ${CONFIG.port}`);
    console.log(`[Chat] WebSocket: ws://localhost:${CONFIG.port}`);
    console.log(`[Chat] REST API: http://localhost:${CONFIG.port}/api/messages`);
    if (leaderboardEnabled) {
      console.log(`[Leaderboard] API: http://localhost:${CONFIG.port}/api/leaderboard`);
    }
  });

  // Cleanup stale rate limit entries every 5 minutes
  const rateLimitCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of apiRateMap) {
      if (now > entry.resetAt) apiRateMap.delete(ip);
    }
    const staleThreshold = 5 * 60_000;
    for (const [addr, ts] of lastMessageTime) {
      if (now - ts > staleThreshold) lastMessageTime.delete(addr);
    }
    for (const [addr, ts] of lastHistoryTime) {
      if (now - ts > staleThreshold) lastHistoryTime.delete(addr);
    }
  }, 5 * 60_000);

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
    clearInterval(heartbeatTimer);
    clearInterval(rateLimitCleanupTimer);
    clearInterval(retentionTimer);
    if (leaderboardEnabled) {
      stopIndexer();
      stopAggregator();
    }
    wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
    wss.close();
    httpServer.close();
    closeLeaderboardStore();
    closeStore();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
