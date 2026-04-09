import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { generateChallenge, verifySignature, isValidSuiAddress } from './auth.js';
import {
  initStore, insertMessage, getRecentMessages, purgeOldMessages, closeStore,
  getNickname, setNickname, isNicknameAvailable, validateNickname, getNicknamesBatch,
  getNicknameRateLimit,
  toggleReaction, getReactionSummaries, getMessageRoomId,
  toggleFollow, getFollowing, getFollowerCounts, getFollowingCount,
} from './store.js';
import { roomExists, getAllRooms, getPoolRoom, setPoolRoomMapping, getPoolSymbol } from './rooms.js';
import type {
  AuthenticatedClient,
  ClientMessage,
  ServerMessage,
  ChatMessagePayload,
  ChatServerConfig,
  DEFAULT_CONFIG,
} from './types.js';
import { DEFAULT_CONFIG as CONFIG, VALID_REACTION_CODES } from './types.js';
import {
  initLeaderboardStore, closeLeaderboardStore, purgeOldOrderEvents, getLeaderboardDb,
  getLeaderboard, getLeaderboardPnl, getTraderAllPeriodStats, getTraderFills, getTotalFillsCount, getTotalTradersCount, getTotalPnlTradersCount,
  getIndexerState,
  createCompetition, updateCompetition, getCompetition, listCompetitions,
  getCompetitionResults,
  getPointsLeaderboard, getTraderPoints, getTotalPointsTraders,
  getTraderFillsByAddress, computeCostBasis,
  getOrderEventsByAddress,
  getFollowedTraderFills,
} from './leaderboard-store.js';
import { getPoolBaseDecimals } from './rooms.js';
import { startIndexer, stopIndexer } from './indexer.js';
import { startAggregator, stopAggregator } from './aggregator.js';
import { initNarrator, onTradeFill, stopNarrator } from './market-narrator.js';
import { initChatbot, onUserMessage, stopChatbot } from './ai-chatbot.js';
import { VALID_PERIODS, VALID_MODES } from './leaderboard-types.js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { LeaderboardConfig, Period, CompetitionStatus } from './leaderboard-types.js';

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

// Reaction rate limiting
const lastReactionTime = new Map<string, number>(); // address -> last reaction timestamp
const lastReactionMessageMap = new Map<string, { messageId: number; at: number }>(); // address -> per-message cooldown

// Follow rate limiting: address -> last toggle timestamp
const lastFollowToggleTime = new Map<string, number[]>(); // address -> timestamps (window)

// Session tokens for REST API authentication (issued on WS auth_success)
const sessionTokens = new Map<string, { address: string; expiresAt: number }>();
const addressToToken = new Map<string, string>(); // reverse lookup: address -> token
const SESSION_TOKEN_TTL = 60 * 60 * 1000; // 1 hour
const MAX_SESSION_TOKENS = 10_000;

// Follower count cache (30s TTL)
const followerCountCache = { data: new Map<string, number>(), expiresAt: 0 };
const FOLLOWER_CACHE_TTL = 30_000;

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

function issueSessionToken(address: string): string {
  // Per-address token limit: revoke existing token
  const existingToken = addressToToken.get(address);
  if (existingToken) {
    sessionTokens.delete(existingToken);
  }

  // Evict oldest if at capacity
  if (sessionTokens.size >= MAX_SESSION_TOKENS) {
    const oldestKey = sessionTokens.keys().next().value;
    if (oldestKey) {
      const oldSession = sessionTokens.get(oldestKey);
      if (oldSession) addressToToken.delete(oldSession.address);
      sessionTokens.delete(oldestKey);
    }
  }

  const token = randomBytes(32).toString('hex');
  sessionTokens.set(token, { address, expiresAt: Date.now() + SESSION_TOKEN_TTL });
  addressToToken.set(address, token);
  return token;
}

function resolveSessionToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const session = sessionTokens.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return session.address;
}

function cleanupSessionTokens(): void {
  const now = Date.now();
  for (const [token, session] of sessionTokens) {
    if (session.expiresAt < now) {
      addressToToken.delete(session.address);
      sessionTokens.delete(token);
    }
  }
}

function getCachedFollowerCounts(addresses: string[]): Map<string, number> {
  if (followerCountCache.expiresAt > Date.now()) {
    const result = new Map<string, number>();
    for (const addr of addresses) {
      result.set(addr, followerCountCache.data.get(addr) ?? 0);
    }
    return result;
  }
  // Cache miss: full rebuild
  followerCountCache.data = new Map<string, number>();
  const counts = getFollowerCounts(addresses);
  for (const [addr, count] of counts) {
    followerCountCache.data.set(addr, count);
  }
  followerCountCache.expiresAt = Date.now() + FOLLOWER_CACHE_TTL;
  return counts;
}

function updateFollowerCountCache(targetAddress: string, newCount: number): void {
  followerCountCache.data.set(targetAddress, newCount);
}

function checkFollowRateLimit(address: string): boolean {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  const maxPerWindow = 20;

  let timestamps = lastFollowToggleTime.get(address);
  if (!timestamps) {
    timestamps = [];
    lastFollowToggleTime.set(address, timestamps);
  }

  // Remove expired entries
  while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= maxPerWindow) return false;
  timestamps.push(now);
  return true;
}

function broadcastOnlineCount(): void {
  const count = authenticatedClients.size;
  broadcast({ type: 'online_count', count });
}

/**
 * Broadcast a system message to all connected clients and persist to chat DB.
 * Used for automated announcements (e.g., large trade notifications).
 */
function broadcastSystemMessage(content: string, roomId: number = 0): void {
  const now = Date.now();
  const stored = insertMessage({
    roomId,
    sender: 'SYSTEM',
    content,
    messageType: 'system',
    replyToId: null,
    timestamp: now,
  });

  const chatMsg: ChatMessagePayload = {
    type: 'chat_message',
    id: stored.id,
    roomId: stored.roomId,
    sender: 'SYSTEM',
    senderNickname: null,
    content: stored.content,
    messageType: 'system',
    replyToId: null,
    timestamp: stored.timestamp,
  };

  broadcast(chatMsg);
}

/**
 * Broadcast a system message to a pool-specific room AND Global (room 0).
 * If poolRoomId is already 0, sends only once.
 */
function broadcastSystemMessageMultiRoom(content: string, poolRoomId: number): void {
  broadcastSystemMessage(content, poolRoomId);
  if (poolRoomId !== 0) {
    broadcastSystemMessage(content, 0);
  }
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

  // 1. Type guard: ensure content is a string
  if (typeof msg.content !== 'string') {
    send(ws, { type: 'error', code: 'INVALID_CONTENT', message: 'Content must be a string' });
    return;
  }

  // 2. Strip dangerous characters, then trim
  // C0/C1 control chars (except \n), zero-width, bidi overrides, line/paragraph separators
  const content = msg.content
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u2069\uFEFF]/g, '')
    .trim();

  // Validate room
  if (!roomExists(roomId)) {
    send(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
    return;
  }

  // 3. Validate content (empty + length)
  if (!content || content.length === 0) {
    send(ws, { type: 'error', code: 'EMPTY_MESSAGE', message: 'Message cannot be empty' });
    return;
  }

  if (content.length > CONFIG.maxMessageLength) {
    send(ws, { type: 'error', code: 'MESSAGE_TOO_LONG', message: `Message exceeds ${CONFIG.maxMessageLength} characters` });
    return;
  }

  // Block reserved prefixes (case-insensitive)
  const upperContent = content.toUpperCase();
  if (upperContent.startsWith('[TRADE]') || upperContent.startsWith('[SYSTEM]') || upperContent.startsWith('[BOT]')) {
    send(ws, { type: 'error', code: 'RESERVED_PREFIX', message: 'This message prefix is reserved' });
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

  // Check for AI chatbot mention (non-blocking)
  onUserMessage(content, senderNickname, client.address, roomId).catch((err) => {
    console.warn('[Chatbot] Error:', (err as Error).message);
  });
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

  // Batch-fetch reactions for all messages in this page
  const messageIds = result.map((m) => m.id);
  const viewerAddress = client?.address;
  const reactionMap = getReactionSummaries(messageIds, viewerAddress);

  send(ws, {
    type: 'history',
    roomId,
    messages: result.map((m) => {
      const reactionData = reactionMap.get(m.id);
      return {
        type: 'chat_message' as const,
        id: m.id,
        roomId: m.roomId,
        sender: m.sender,
        senderNickname: nicknames.get(m.sender) ?? null,
        content: m.content,
        messageType: m.messageType,
        replyToId: m.replyToId,
        timestamp: m.timestamp,
        ...(reactionData ? { reactions: reactionData.reactions, myReaction: reactionData.myReaction } : {}),
      };
    }),
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
      const migrated = getFollowingCount(verifiedAddress) > 0;
      const client: AuthenticatedClient = {
        ws,
        address: verifiedAddress,
        connectedAt: Date.now(),
        lastMessageAt: 0,
        migrationBurstUntil: migrated ? 0 : Date.now() + 5000, // 5s burst for unmigrated users
      };
      authenticatedClients.set(ws, client);

      const existingNickname = getNickname(verifiedAddress);
      const rateLimit = existingNickname ? getNicknameRateLimit(verifiedAddress) : undefined;
      const sessionToken = issueSessionToken(verifiedAddress);
      send(ws, { type: 'auth_success', address: verifiedAddress, nickname: existingNickname, rateLimit, sessionToken });

      // Send available rooms list
      send(ws, { type: 'rooms_list', rooms: getAllRooms() });

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
      case 'list_rooms':
        send(ws, { type: 'rooms_list', rooms: getAllRooms() });
        break;
      case 'toggle_reaction': {
        // Explicit destructure: only messageId, emojiCode from payload. address from client.
        const { messageId, emojiCode } = msg as { messageId: number; emojiCode: string };

        // (1) Whitelist validation
        if (!VALID_REACTION_CODES.has(emojiCode)) {
          send(ws, { type: 'error', code: 'INVALID_REACTION', message: 'Invalid reaction code' });
          break;
        }

        // (2) Rate limit: 2/sec + 3sec per-message cooldown
        const now = Date.now();
        const lastReaction = lastReactionTime.get(client.address);
        if (lastReaction && now - lastReaction < 500) {
          send(ws, { type: 'error', code: 'RATE_LIMITED', message: 'Reaction rate limited' });
          break;
        }
        const lastMsgReaction = lastReactionMessageMap.get(client.address);
        if (lastMsgReaction && lastMsgReaction.messageId === messageId && now - lastMsgReaction.at < 3000) {
          send(ws, { type: 'error', code: 'RATE_LIMITED', message: 'Per-message cooldown' });
          break;
        }

        // (3) Message existence + roomId
        const roomId = getMessageRoomId(messageId);
        if (roomId === null) {
          send(ws, { type: 'error', code: 'MESSAGE_NOT_FOUND', message: 'Message not found' });
          break;
        }

        // (4) DB operation
        const reactions = toggleReaction(messageId, client.address, emojiCode);
        lastReactionTime.set(client.address, now);
        lastReactionMessageMap.set(client.address, { messageId, at: now });
        broadcast({ type: 'reaction_update', messageId, roomId, reactions });
        break;
      }
      case 'toggle_follow': {
        const { target } = msg as { target: string };

        // Address validation
        if (!target || !isValidSuiAddress(target)) {
          send(ws, { type: 'follow_result', target: target || '', following: false, followerCount: 0, error: 'INVALID_ADDRESS' });
          break;
        }

        // Rate limit: burst window for migration, otherwise 20/min
        const now = Date.now();
        if (now >= client.migrationBurstUntil) {
          if (!checkFollowRateLimit(client.address)) {
            send(ws, { type: 'follow_result', target, following: false, followerCount: 0, error: 'RATE_LIMITED' });
            break;
          }
        }

        try {
          const result = toggleFollow(client.address, target);
          updateFollowerCountCache(target.toLowerCase(), result.followerCount);
          send(ws, { type: 'follow_result', target, following: result.following, followerCount: result.followerCount });
        } catch (err) {
          const code = (err as Error).message;
          send(ws, { type: 'follow_result', target, following: false, followerCount: 0, error: code });
        }
        break;
      }
      case 'get_following': {
        const addresses = getFollowing(client.address);
        send(ws, { type: 'following_list', addresses });
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
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || 'unknown';
    if (!checkApiRateLimit(clientIp)) {
      res.writeHead(429, corsHeaders);
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

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

  // ===== Feed API (authenticated, session token) =====

  if (url.pathname === '/api/feed' && req.method === 'GET') {
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
    if (!checkApiRateLimit(clientIp)) {
      res.writeHead(429, corsHeaders);
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    const address = resolveSessionToken(req.headers?.authorization as string | undefined);
    if (!address) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    try {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '30', 10), 1), 50);
      const beforeTsParam = url.searchParams.get('beforeTs');
      const beforeTs = beforeTsParam ? parseInt(beforeTsParam, 10) : undefined;

      if (beforeTs !== undefined && (!Number.isFinite(beforeTs) || beforeTs < 0)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid beforeTs' }));
        return;
      }

      // Step 1: Get followed addresses from chat DB
      const following = getFollowing(address);
      if (following.length === 0) {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ activities: [], hasMore: false, followCount: 0 }));
        return;
      }

      // Step 2: Query trade fills from leaderboard DB
      const { fills, hasMore } = getFollowedTraderFills(following, limit, beforeTs);

      // Step 3: Enrich with nicknames from chat DB
      const traderAddresses = [...new Set(fills.map((f) => f.address))];
      const nicknames = traderAddresses.length > 0 ? getNicknamesBatch(traderAddresses) : new Map();

      // Step 4: Build activity feed response
      const activities = fills.map((fill) => {
        // Determine trade side relative to the feed trader
        const isTaker = fill.address === fill.taker_address;
        const isBid = !!fill.taker_is_bid;
        // taker_is_bid=1: taker bought, maker sold
        const side = isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');

        return {
          type: 'trade' as const,
          traderAddress: fill.address,
          traderNickname: nicknames.get(fill.address) ?? null,
          timestamp: fill.timestamp_ms,
          data: {
            poolId: fill.pool_id,
            pair: `${getPoolSymbol(fill.pool_id) ?? 'UNKNOWN'}/NUSDC`,
            side,
            price: formatQuoteVolume(fill.price),
            baseQuantity: fill.base_quantity,
            quoteQuantity: formatQuoteVolume(fill.quote_quantity),
            txDigest: fill.tx_digest,
          },
        };
      });

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ activities, hasMore, followCount: following.length }));
    } catch (err) {
      console.error('[Feed] API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
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
    const mode = url.searchParams.get('mode') || 'volume';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    if (!VALID_PERIODS.has(period)) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid period. Use: 24h, 7d, 30d, all' }));
      return;
    }

    if (!VALID_MODES.has(mode)) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid mode. Use: volume, pnl' }));
      return;
    }

    try {
      if (mode === 'pnl') {
        // PnL leaderboard
        const rows = getLeaderboardPnl(period, limit, offset);
        const addresses = rows.map((r) => r.address);
        const nicknames = addresses.length > 0 ? getNicknamesBatch(addresses) : new Map();
        const followerCounts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map();

        const traders = rows.map((r) => ({
          rank: r.rank,
          address: r.address,
          nickname: nicknames.get(r.address) ?? null,
          pnlUsd: formatQuoteVolume(r.realized_pnl),
          pnlPercent: r.pnl_percent,
          tradeCount: r.trade_count,
          rankChange: r.prev_rank > 0 ? r.prev_rank - r.rank : 0,
          followerCount: followerCounts.get(r.address) ?? 0,
        }));

        const updatedAt = rows.length > 0 ? rows[0].updated_at : Date.now();
        const totalTraders = getTotalPnlTradersCount(period);

        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ mode: 'pnl', period, traders, updatedAt, totalTraders }));
      } else {
        // Volume leaderboard (existing)
        const rows = getLeaderboard(period, limit, offset);
        const addresses = rows.map((r) => r.address);
        const nicknames = addresses.length > 0 ? getNicknamesBatch(addresses) : new Map();
        const followerCounts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map();

        const traders = rows.map((r) => ({
          rank: r.rank,
          address: r.address,
          nickname: nicknames.get(r.address) ?? null,
          volumeUsd: formatQuoteVolume(r.volume_quote),
          tradeCount: r.trade_count,
          uniquePools: r.unique_pools,
          rankChange: r.prev_rank > 0 ? r.prev_rank - r.rank : 0,
          lastTradeAt: r.last_trade_at,
          followerCount: followerCounts.get(r.address) ?? 0,
        }));

        const updatedAt = rows.length > 0 ? rows[0].updated_at : Date.now();
        const totalTraders = getTotalTradersCount(period);

        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ mode: 'volume', period, traders, updatedAt, totalTraders }));
      }
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

      let lastTradeAt: number | null = null;
      for (const row of rows) {
        stats[row.period] = {
          rank: row.rank,
          volume: formatQuoteVolume(row.volume_quote),
          tradeCount: row.trade_count,
          uniquePools: row.unique_pools,
          rankChange: row.prev_rank > 0 ? row.prev_rank - row.rank : 0,
        };
        // Track most recent trade across all periods
        if (row.last_trade_at && (lastTradeAt === null || row.last_trade_at > lastTradeAt)) {
          lastTradeAt = row.last_trade_at;
        }
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ address, nickname, lastTradeAt, stats }));
    } catch (err) {
      console.error('[Leaderboard] Trader API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Match /api/leaderboard/trader/:address/fills
  const fillsMatch = url.pathname.match(/^\/api\/leaderboard\/trader\/(0x[a-fA-F0-9]{64})\/fills$/);
  if (fillsMatch && req.method === 'GET') {
    const address = fillsMatch[1];
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 100);

    try {
      const rows = getTraderFills(address, limit);
      const hasMore = rows.length > limit;
      const fills = (hasMore ? rows.slice(0, limit) : rows).map((r) => {
        // Determine trade side relative to the queried address
        const isTaker = r.taker_address === address;
        const isBid = !!r.taker_is_bid;
        const side = isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');

        return {
          txDigest: r.tx_digest,
          poolId: r.pool_id,
          side,
          price: formatQuoteVolume(r.price),
          baseQuantity: r.base_quantity,
          quoteQuantity: formatQuoteVolume(r.quote_quantity),
          timestamp: r.timestamp_ms,
        };
      });

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ address, fills, hasMore }));
    } catch (err) {
      console.error('[Leaderboard] Fills API error:', (err as Error).message);
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

  // ===== Points API =====

  // GET /api/leaderboard/points - points leaderboard
  if (url.pathname === '/api/leaderboard/points' && req.method === 'GET') {
    try {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 500);
      const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
      const rows = getPointsLeaderboard(limit, offset);
      const totalTraders = getTotalPointsTraders();
      const addresses = rows.map((r) => r.address);
      const nicknames = addresses.length > 0 ? getNicknamesBatch(addresses) : new Map<string, string>();
      const followerCounts = addresses.length > 0 ? getCachedFollowerCounts(addresses) : new Map();

      const traders = rows.map((row) => ({
        rank: row.rank,
        address: row.address,
        nickname: nicknames.get(row.address) ?? null,
        totalPoints: row.total_points,
        tradeCount: row.trade_count,
        volumeUsd: formatQuoteVolume(row.volume_quote),
        rankChange: row.prev_rank > 0 ? row.prev_rank - row.rank : 0,
        followerCount: followerCounts.get(row.address) ?? 0,
      }));

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        traders,
        updatedAt: rows[0]?.updated_at ?? 0,
        totalTraders,
      }));
    } catch (err) {
      console.error('[Points] Leaderboard API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // GET /api/leaderboard/trader/:address/points - individual trader points
  const pointsMatch = url.pathname.match(/^\/api\/leaderboard\/trader\/(0x[a-fA-F0-9]{64})\/points$/);
  if (pointsMatch && req.method === 'GET') {
    try {
      const address = pointsMatch[1];
      const points = getTraderPoints(address);

      if (!points) {
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({
          address,
          nickname: getNickname(address),
          totalPoints: 0,
          breakdown: { trades: 0, volume: 0, diversity: 0 },
          rank: 0,
        }));
        return;
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        address,
        nickname: getNickname(address),
        totalPoints: points.total_points,
        breakdown: {
          trades: points.points_from_trades,
          volume: points.points_from_volume,
          diversity: points.points_from_diversity,
        },
        rank: points.rank,
      }));
    } catch (err) {
      console.error('[Points] Trader points API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // ===== Trade History API =====

  // Rate limit trade API endpoints
  if (url.pathname.startsWith('/api/trades')) {
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || 'unknown';
    if (!checkApiRateLimit(clientIp)) {
      res.writeHead(429, corsHeaders);
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
  }

  // GET /api/trades/:address - paginated trade history for an address
  const tradesMatch = url.pathname.match(/^\/api\/trades\/(0x[a-fA-F0-9]{64})$/);
  if (tradesMatch && req.method === 'GET') {
    try {
      const address = tradesMatch[1];
      const pool = url.searchParams.get('pool') || undefined;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 200);
      const cursorParam = url.searchParams.get('cursor');
      const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;

      if (pool && !/^0x[a-fA-F0-9]{64}$/.test(pool)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid pool address' }));
        return;
      }

      if (cursor !== undefined && (!Number.isFinite(cursor) || cursor < 0)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid cursor' }));
        return;
      }

      const { fills, nextCursor, hasMore } = getTraderFillsByAddress(address, { pool, limit, cursor });

      // Enrich with side and role relative to the queried address
      const trades = fills.map((r) => {
        const isTaker = r.taker_address === address;
        const isBid = !!r.taker_is_bid;
        const side = isTaker ? (isBid ? 'buy' : 'sell') : (isBid ? 'sell' : 'buy');
        return {
          id: r.id,
          tx_digest: r.tx_digest,
          event_seq: r.event_seq,
          pool_id: r.pool_id,
          price: r.price,
          base_quantity: r.base_quantity,
          quote_quantity: r.quote_quantity,
          taker_is_bid: r.taker_is_bid,
          side,
          role: isTaker ? 'taker' : 'maker',
          timestamp_ms: r.timestamp_ms,
        };
      });

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ trades, nextCursor, hasMore }));
    } catch (err) {
      console.error('[Trades] API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // GET /api/trades/:address/cost-basis - FIFO weighted average cost basis
  const costBasisMatch = url.pathname.match(/^\/api\/trades\/(0x[a-fA-F0-9]{64})\/cost-basis$/);
  if (costBasisMatch && req.method === 'GET') {
    try {
      const address = costBasisMatch[1];
      const entries = computeCostBasis(address, getPoolBaseDecimals);

      const totalRealizedPnl = entries.reduce((sum, e) => sum + e.realized_pnl, 0);

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        entries,
        total_realized_pnl: Math.round(totalRealizedPnl * 100) / 100,
      }));
    } catch (err) {
      console.error('[CostBasis] API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Rate limit order history API
  if (url.pathname.startsWith('/api/orders')) {
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || 'unknown';
    if (!checkApiRateLimit(clientIp)) {
      res.writeHead(429, corsHeaders);
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
  }

  // GET /api/orders/:address - order events + fills for order history
  const ordersMatch = url.pathname.match(/^\/api\/orders\/(0x[a-fA-F0-9]{64})$/);
  if (ordersMatch && req.method === 'GET') {
    try {
      const address = ordersMatch[1];
      const pool = url.searchParams.get('pool') || undefined;
      const parsedLimit = parseInt(url.searchParams.get('limit') || '100', 10);
      const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1), 200);
      const cursorParam = url.searchParams.get('cursor');
      const cursor = cursorParam ? parseInt(cursorParam, 10) : undefined;

      if (pool && !/^0x[a-fA-F0-9]{64}$/.test(pool)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid pool address' }));
        return;
      }

      if (cursor !== undefined && (!Number.isFinite(cursor) || cursor < 0)) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid cursor' }));
        return;
      }

      // Fetch order events (placed + canceled)
      const { events, nextCursor, hasMore } = getOrderEventsByAddress(address, { pool, limit, cursor });

      // Fetch recent fills for this address+pool to allow frontend to compute executed quantities
      const { fills } = getTraderFillsByAddress(address, { pool, limit: 200 });

      // Serialize fills with role info
      const fillsWithRole = fills.map(f => ({
        tx_digest: f.tx_digest,
        event_seq: f.event_seq,
        pool_id: f.pool_id,
        maker_order_id: f.maker_order_id ?? null,
        taker_order_id: f.taker_order_id ?? null,
        price: f.price,
        base_quantity: f.base_quantity,
        quote_quantity: f.quote_quantity,
        taker_is_bid: f.taker_is_bid,
        timestamp_ms: f.timestamp_ms,
        is_maker: f.maker_address === address,
        is_taker: f.taker_address === address,
      }));

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ events, fills: fillsWithRole, nextCursor, hasMore }));
    } catch (err) {
      console.error('[Orders] API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // ===== Competition API =====

  // Rate limit competition endpoints
  if (url.pathname.startsWith('/api/competitions')) {
    const clientIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || 'unknown';
    if (!checkApiRateLimit(clientIp)) {
      res.writeHead(429, corsHeaders);
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
  }

  // GET /api/competitions - list competitions
  if (url.pathname === '/api/competitions' && req.method === 'GET') {
    try {
      const statusFilter = url.searchParams.get('status') as CompetitionStatus | null;
      const validStatuses = new Set(['upcoming', 'active', 'ended']);
      const competitions = (statusFilter && validStatuses.has(statusFilter))
        ? listCompetitions(statusFilter)
        : listCompetitions();

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ competitions }));
    } catch (err) {
      console.error('[Competition] List API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // GET /api/competitions/:id/results
  const compResultsMatch = url.pathname.match(/^\/api\/competitions\/([a-zA-Z0-9_-]+)\/results$/);
  if (compResultsMatch && req.method === 'GET') {
    const compId = compResultsMatch[1];
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 200);

    try {
      const comp = getCompetition(compId);
      if (!comp) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: 'Competition not found' }));
        return;
      }

      const results = getCompetitionResults(compId, limit);
      const addresses = results.map((r) => r.address);
      const nicknames = addresses.length > 0 ? getNicknamesBatch(addresses) : new Map();

      const traders = results.map((r) => ({
        rank: r.rank,
        address: r.address,
        nickname: nicknames.get(r.address) ?? null,
        volumeUsd: formatQuoteVolume(r.volume_quote),
        tradeCount: r.trade_count,
      }));

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ competitionId: compId, traders }));
    } catch (err) {
      console.error('[Competition] Results API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // GET /api/competitions/:id
  const compDetailMatch = url.pathname.match(/^\/api\/competitions\/([a-zA-Z0-9_-]+)$/);
  if (compDetailMatch && req.method === 'GET') {
    const compId = compDetailMatch[1];

    try {
      const comp = getCompetition(compId);
      if (!comp) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: 'Competition not found' }));
        return;
      }

      // Include top 10 results
      const results = getCompetitionResults(compId, 10);
      const addresses = results.map((r) => r.address);
      const nicknames = addresses.length > 0 ? getNicknamesBatch(addresses) : new Map();

      const topTraders = results.map((r) => ({
        rank: r.rank,
        address: r.address,
        nickname: nicknames.get(r.address) ?? null,
        volumeUsd: formatQuoteVolume(r.volume_quote),
        tradeCount: r.trade_count,
      }));

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ ...comp, topTraders }));
    } catch (err) {
      console.error('[Competition] Detail API error:', (err as Error).message);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // POST /api/competitions (admin only)
  if (url.pathname === '/api/competitions' && req.method === 'POST') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    collectBody(req as any).then((body) => {
      try {
        const data = JSON.parse(body);
        const { title, description, startMs, endMs, prizeDescription, minVolume } = data;

        const parsedStartMs = Number(startMs);
        const parsedEndMs = Number(endMs);

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
          res.writeHead(400, corsHeaders);
          res.end(JSON.stringify({ error: 'Title is required' }));
          return;
        }

        if (!Number.isFinite(parsedStartMs) || !Number.isFinite(parsedEndMs)
            || parsedStartMs <= 0 || parsedEndMs <= parsedStartMs) {
          res.writeHead(400, corsHeaders);
          res.end(JSON.stringify({ error: 'Invalid start/end time' }));
          return;
        }

        const id = randomBytes(12).toString('hex');
        const now = Date.now();
        const status = now >= parsedStartMs && now <= parsedEndMs ? 'active' : now < parsedStartMs ? 'upcoming' : 'ended';

        createCompetition({
          id,
          title: String(title).slice(0, 100),
          description: String(description || '').slice(0, 500),
          start_ms: parsedStartMs,
          end_ms: parsedEndMs,
          status: status as CompetitionStatus,
          prize_description: String(prizeDescription || '').slice(0, 200),
          min_volume: String(minVolume || '0'),
        });

        res.writeHead(201, corsHeaders);
        res.end(JSON.stringify({ id, status }));
      } catch (err) {
        console.error('[Competition] Create error:', (err as Error).message);
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    }).catch((err) => {
      console.error('[Competition] Body collection error:', (err as Error).message);
      res.writeHead(413, corsHeaders);
      res.end(JSON.stringify({ error: 'Request body too large or malformed' }));
    });
    return;
  }

  // PATCH /api/competitions/:id (admin only)
  const compPatchMatch = url.pathname.match(/^\/api\/competitions\/([a-zA-Z0-9_-]{1,64})$/);
  if (compPatchMatch && req.method === 'PATCH') {
    if (!checkAdminAuth(req)) {
      res.writeHead(401, corsHeaders);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const compId = compPatchMatch[1];

    collectBody(req as any).then((body) => {
      try {
        const data = JSON.parse(body);
        const updates: Partial<Pick<import('./leaderboard-types.js').CompetitionRow, 'title' | 'description' | 'start_ms' | 'end_ms' | 'status' | 'prize_description' | 'min_volume'>> = {};

        if (data.title !== undefined) updates.title = String(data.title).slice(0, 100);
        if (data.description !== undefined) updates.description = String(data.description).slice(0, 500);
        if (data.startMs !== undefined) {
          const n = Number(data.startMs);
          if (!Number.isFinite(n) || n <= 0) {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ error: 'Invalid startMs' }));
            return;
          }
          updates.start_ms = n;
        }
        if (data.endMs !== undefined) {
          const n = Number(data.endMs);
          if (!Number.isFinite(n) || n <= 0) {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ error: 'Invalid endMs' }));
            return;
          }
          updates.end_ms = n;
        }
        if (data.status !== undefined) {
          const validStatuses = new Set(['upcoming', 'active', 'ended']);
          if (!validStatuses.has(data.status)) {
            res.writeHead(400, corsHeaders);
            res.end(JSON.stringify({ error: 'Invalid status' }));
            return;
          }
          updates.status = data.status;
        }
        if (data.prizeDescription !== undefined) updates.prize_description = String(data.prizeDescription).slice(0, 200);
        if (data.minVolume !== undefined) updates.min_volume = String(data.minVolume);

        const ok = updateCompetition(compId, updates);
        if (!ok) {
          res.writeHead(404, corsHeaders);
          res.end(JSON.stringify({ error: 'Competition not found' }));
          return;
        }

        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('[Competition] Update error:', (err as Error).message);
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid request body' }));
      }
    }).catch((err) => {
      console.error('[Competition] Body collection error:', (err as Error).message);
      res.writeHead(413, corsHeaders);
      res.end(JSON.stringify({ error: 'Request body too large or malformed' }));
    });
    return;
  }

  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({ error: 'Not found' }));
}

/**
 * Check admin authorization via Bearer token.
 */
function checkAdminAuth(req: { headers?: Record<string, string | string[] | undefined> }): boolean {
  if (!CONFIG.competitionAdminKey) return false;
  const authHeader = req.headers?.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  // Constant-time comparison to prevent timing attacks
  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(CONFIG.competitionAdminKey);
  if (tokenBuf.length !== keyBuf.length) return false;
  return timingSafeEqual(tokenBuf, keyBuf);
}

/**
 * Collect request body as string (for POST/PATCH).
 */
function collectBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_BODY = 10 * 1024; // 10KB max
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
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

  // Purge old order events on startup
  const orderEventsPurged = purgeOldOrderEvents(CONFIG.orderEventRetentionDays);
  if (orderEventsPurged > 0) {
    console.log(`[Leaderboard] Startup: purged ${orderEventsPurged} expired order events (>${CONFIG.orderEventRetentionDays}d)`);
  }

  // Checkpoint WAL to reclaim disk (WAL can grow large if server was down)
  try {
    getLeaderboardDb().pragma('wal_checkpoint(TRUNCATE)');
  } catch { /* ignore checkpoint errors on startup */ }

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
    const largeTradeThresholdRaw = BigInt(CONFIG.largeTradeThresholdNusdc) * 1_000_000n; // NUSDC 6 decimals

    // Configure pool-to-room mappings from environment
    const poolMappings: [string | undefined, number][] = [
      [process.env.POOL_NBTC_NUSDC, 1],
      [process.env.POOL_NASUN_NUSDC, 2],
      [process.env.POOL_NETH_NUSDC, 3],
      [process.env.POOL_NSOL_NUSDC, 4],
    ];
    for (const [poolId, roomId] of poolMappings) {
      if (poolId) setPoolRoomMapping(poolId, roomId);
    }

    // Initialize market narrator (rule-based + optional AI commentary)
    initNarrator({
      broadcast: (content: string) => broadcastSystemMessage(content),
      broadcastToRoom: broadcastSystemMessageMultiRoom,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    startIndexer(lbConfig, {
      thresholdRaw: largeTradeThresholdRaw,
      onLargeTrade: (msg: string, poolId?: string) => {
        const poolRoomId = poolId ? getPoolRoom(poolId) : null;
        if (poolRoomId !== null) {
          broadcastSystemMessageMultiRoom(msg, poolRoomId);
        } else {
          broadcastSystemMessage(msg);
        }
      },
      onTradeFill,
    });
    startAggregator(lbConfig);
  } else {
    console.log('[Leaderboard] Indexer disabled (DEEPBOOK_PACKAGE not set)');
  }

  // Initialize AI chatbot (mention-based @pado responses)
  if (process.env.ANTHROPIC_API_KEY) {
    initChatbot({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      broadcastToRoom: broadcastSystemMessage,
    });
  }

  // Create HTTP server (for REST API + WebSocket upgrade)
  const httpServer = createServer(handleHttpRequest);

  // Create WebSocket server with message size limit and origin validation
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: CONFIG.maxWsMessageBytes,
    verifyClient: (info: { origin: string; secure: boolean; req: import('http').IncomingMessage }) => {
      const origin = info.origin || info.req.headers.origin as string | undefined;
      // Allow non-browser clients (bots, CLI, health checks) with no Origin header
      if (!origin) return true;
      // Block browser connections from unauthorized origins (CSWSH prevention)
      return CONFIG.allowedOrigins.includes(origin);
    },
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
    for (const [addr, ts] of lastReactionTime) {
      if (now - ts > staleThreshold) lastReactionTime.delete(addr);
    }
    for (const [addr, entry] of lastReactionMessageMap) {
      if (now - entry.at > staleThreshold) lastReactionMessageMap.delete(addr);
    }
    for (const [addr, timestamps] of lastFollowToggleTime) {
      // Remove expired entries, delete map entry if empty
      while (timestamps.length > 0 && now - timestamps[0] > 60_000) timestamps.shift();
      if (timestamps.length === 0) lastFollowToggleTime.delete(addr);
    }
    cleanupSessionTokens();
  }, 5 * 60_000);

  // Periodic retention cleanup (messages + order events)
  // Messages: daily cleanup (retention period is 90 days, low volume)
  const messageRetentionTimer = setInterval(() => {
    const msgPurged = purgeOldMessages(CONFIG.messageRetentionDays);
    if (msgPurged > 0) {
      console.log(`[Chat] Purged ${msgPurged} expired messages`);
    }
  }, CONFIG.retentionCleanupIntervalMs);

  // Order events: hourly cleanup + incremental VACUUM
  // order_events grows rapidly (~28 events/sec from DeepBook indexer),
  // so purge every hour instead of daily to prevent disk exhaustion.
  const orderEventRetentionTimer = setInterval(() => {
    try {
      const ordersPurged = purgeOldOrderEvents(CONFIG.orderEventRetentionDays);
      if (ordersPurged > 0) {
        console.log(`[Leaderboard] Purged ${ordersPurged} expired order events`);
        // Reclaim disk space after large deletes
        try {
          getLeaderboardDb().pragma('incremental_vacuum(1000)');
          getLeaderboardDb().pragma('wal_checkpoint(TRUNCATE)');
          console.log('[Leaderboard] WAL checkpoint completed');
        } catch { /* ignore vacuum/checkpoint errors */ }
      }
    } catch (err) {
      console.error('[Leaderboard] Order event purge failed:', (err as Error).message);
    }
  }, 60 * 60 * 1000); // Every hour

  // Graceful shutdown: wait for HTTP server to fully close before exiting
  // so the port is released and PM2 restart won't hit EADDRINUSE.
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[Chat] Shutting down...');
    clearInterval(heartbeatTimer);
    clearInterval(rateLimitCleanupTimer);
    clearInterval(messageRetentionTimer);
    clearInterval(orderEventRetentionTimer);
    stopChatbot();
    if (leaderboardEnabled) {
      stopNarrator();
      stopIndexer();
      stopAggregator();
    }
    wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
    wss.close(() => {
      httpServer.close(() => {
        closeLeaderboardStore();
        closeStore();
        console.log('[Chat] Shutdown complete');
        process.exit(0);
      });
    });
    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      console.error('[Chat] Forced shutdown after timeout');
      process.exit(1);
    }, 8000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
