import './env.js'; // Must be first: loads .env before any module reads process.env
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { generateChallenge, verifySignature, isValidSuiAddress, setProfileApiUrl } from './auth.js';
import { randomBytes } from 'node:crypto';
import { initStore, insertMessage, getRecentMessages, purgeOldMessages, upsertUser, closeStore, toggleReaction, getReactionSummaries, getMessageRoomId, getUserReaction, validateNickname, setNickname, clearNickname, isNicknameAvailable, getNickname, getNicknameRateLimit, getNicknamesBatch, toggleFollow, getFollowing, getFollowerCounts, getChatParticipants, setGenesisPassStatus, getGenesisPassBatch, getProfileImagesBatch, ensureProfilesCached, upsertNasunProfile, getDisplayNamesBatch, getAddressesWithProfileName } from './store.js';
import { stripControlChars, hasReservedPrefix } from './sanitize.js';
import type { AuthenticatedClient, ClientMessage, ServerMessage, ChatMessagePayload, StoredMessage } from './types.js';
import { DEFAULT_CONFIG as CONFIG, ROOMS, VALID_ROOM_IDS, VALID_REACTION_CODES } from './types.js';
// Leaderboard modules (conditionally activated via DEEPBOOK_PACKAGE)
import { initLeaderboardStore, closeLeaderboardStore, purgeOldOrderEvents, getLeaderboardDb, getActiveTraderAddresses } from './leaderboard-store.js';
import { startIndexer, stopIndexer } from './indexer.js';
import { startAggregator, stopAggregator } from './aggregator.js';
import { initNarrator, onTradeFill, stopNarrator } from './market-narrator.js';
import { setPoolRoomMapping, getPoolRoom } from './rooms.js';
import { handleLeaderboardRequest, cleanupApiRateLimits } from './leaderboard-api.js';
import type { LeaderboardApiDeps } from './leaderboard-api.js';
import type { LeaderboardConfig } from './leaderboard-types.js';
import { initChatbot, onUserMessage, stopChatbot } from './ai-chatbot.js';

// ===== State =====

const pendingAuth = new Map<WebSocket, { challenge: string; timeout: ReturnType<typeof setTimeout> }>();
const authenticatedClients = new Map<WebSocket, AuthenticatedClient>();
const lastMessageTime = new Map<string, number>();
const lastHistoryTime = new Map<string, number>();
const connectionsPerIp = new Map<string, number>();
const lastReactionTime = new Map<string, number>();
const lastReactionMessageMap = new Map<string, { messageId: number; at: number }>();

// Follow rate limiting: address -> timestamps (sliding window)
const lastFollowToggleTime = new Map<string, number[]>();

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

function broadcastOnlineCount(): void {
  const uniqueAddresses = new Set<string>();
  for (const client of authenticatedClients.values()) {
    uniqueAddresses.add(client.address);
  }
  broadcast({ type: 'online_count', count: uniqueAddresses.size });
}

function issueSessionToken(address: string): string {
  const existingToken = addressToToken.get(address);
  if (existingToken) {
    sessionTokens.delete(existingToken);
  }

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

function cleanupSessionTokens(): void {
  const now = Date.now();
  for (const [token, session] of sessionTokens) {
    if (session.expiresAt < now) {
      addressToToken.delete(session.address);
      sessionTokens.delete(token);
    }
  }
}

function resolveSessionToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const session = sessionTokens.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return session.address;
}

// Leaderboard state (conditionally enabled)
const leaderboardEnabled = !!CONFIG.deepbookPackage;

function broadcastSystemMessage(content: string, roomId: number = 0): void {
  const now = Date.now();
  const stored = insertMessage({
    roomId,
    sender: 'SYSTEM',
    senderName: 'System',
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
    senderName: 'System',
    senderNickname: null,
    senderBadge: null,
    senderProfileImageUrl: null,
    content: stored.content,
    messageType: 'system',
    replyToId: null,
    timestamp: stored.timestamp,
  };

  for (const [ws] of authenticatedClients) {
    send(ws, chatMsg);
  }
}

function broadcastSystemMessageMultiRoom(content: string, poolRoomId: number): void {
  broadcastSystemMessage(content, poolRoomId);
  if (poolRoomId !== 0) {
    broadcastSystemMessage(content, 0);
  }
}

// Leaderboard API deps (injected into leaderboard-api.ts)
const leaderboardDeps: LeaderboardApiDeps = {
  resolveSessionToken: (authHeader) => resolveSessionToken(authHeader),
};

function getCachedFollowerCounts(addresses: string[]): Map<string, number> {
  if (followerCountCache.expiresAt > Date.now()) {
    const result = new Map<string, number>();
    for (const addr of addresses) {
      result.set(addr, followerCountCache.data.get(addr) ?? 0);
    }
    return result;
  }
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
  const windowMs = 60_000;
  const maxPerWindow = 20;

  let timestamps = lastFollowToggleTime.get(address);
  if (!timestamps) {
    timestamps = [];
    lastFollowToggleTime.set(address, timestamps);
  }

  while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
    timestamps.shift();
  }

  if (timestamps.length >= maxPerWindow) return false;
  timestamps.push(now);
  return true;
}

interface PayloadOptions {
  nicknameMap?: Map<string, string>;
  displayNameMap?: Map<string, string>;
  profileNameSet?: Set<string>;
  gpSet?: Set<string>;
  profileImageMap?: Map<string, string>;
}

function storedToPayload(msg: StoredMessage, opts: PayloadOptions = {}): ChatMessagePayload {
  const resolvedName = opts.displayNameMap?.get(msg.sender);
  // Suppress chat nickname when profile name exists (profile name takes precedence)
  const hasProfileName = opts.profileNameSet?.has(msg.sender) ?? false;
  const nickname = hasProfileName ? null : (opts.nicknameMap?.get(msg.sender) ?? null);
  return {
    type: 'chat_message',
    id: msg.id,
    roomId: msg.roomId,
    sender: msg.sender,
    senderName: resolvedName ?? msg.senderName,
    senderNickname: nickname,
    senderBadge: opts.gpSet?.has(msg.sender) ? 'GP' : null,
    senderProfileImageUrl: opts.profileImageMap?.get(msg.sender) ?? null,
    content: msg.content,
    messageType: msg.messageType,
    replyToId: msg.replyToId,
    timestamp: msg.timestamp,
  };
}

// ===== HTTP Server =====

function getCorsOrigin(reqOrigin: string | undefined): string | null {
  if (!reqOrigin) return null;
  return CONFIG.allowedOrigins.includes(reqOrigin) ? reqOrigin : null;
}

function handleHttpRequest(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): void {
  const origin = getCorsOrigin(req.headers.origin);
  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (origin) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
    corsHeaders['Vary'] = 'Origin';
  }

  // Delegate to leaderboard API handler first (handles its own OPTIONS with POST/PATCH)
  const url = new URL(req.url || '/', `http://localhost:${CONFIG.port}`);
  if (leaderboardEnabled && handleLeaderboardRequest(req, res, url, corsHeaders, CONFIG, leaderboardDeps)) {
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url.pathname === '/api/chat-participation' && (req.method === 'GET' || req.method === 'HEAD')) {
    const dateParam = url.searchParams.get('date');
    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      res.writeHead(400, corsHeaders);
      res.end(JSON.stringify({ error: 'Invalid date (YYYY-MM-DD)' }));
      return;
    }
    try {
      const participants = getChatParticipants(dateParam);
      res.writeHead(200, { ...corsHeaders, 'Cache-Control': 'public, max-age=30' });
      res.end(JSON.stringify({ date: dateParam, participants }));
    } catch (err) {
      console.error('[HTTP] Chat participation query error:', err);
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  res.writeHead(404, corsHeaders);
  res.end(JSON.stringify({ error: 'Not found' }));
}

const httpServer = createServer(handleHttpRequest);

// ===== WebSocket Server =====

const wss = new WebSocketServer({ server: httpServer, maxPayload: CONFIG.maxWsMessageBytes });

wss.on('connection', (ws, req) => {
  // Origin validation (reject missing or disallowed origins)
  const origin = req.headers.origin;
  if (!origin || !CONFIG.allowedOrigins.includes(origin)) {
    console.warn(`Rejected connection: origin=${origin || 'none'}`);
    ws.close(4403, 'Forbidden origin');
    return;
  }

  // IP-based connection limit
  const ip = CONFIG.trustProxy
    ? (req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown')
    : (req.socket.remoteAddress || 'unknown');
  const ipCount = (connectionsPerIp.get(ip) || 0) + 1;
  if (ipCount > CONFIG.maxConnectionsPerIp) {
    ws.close(4429, 'Too many connections');
    return;
  }
  connectionsPerIp.set(ip, ipCount);

  // Generate challenge and send
  const challenge = generateChallenge();
  if (!challenge) {
    ws.close(4503, 'Server busy');
    connectionsPerIp.set(ip, ipCount - 1);
    return;
  }
  const authTimeout = setTimeout(() => {
    if (!authenticatedClients.has(ws)) {
      ws.close(4408, 'Auth timeout');
    }
  }, CONFIG.authTimeoutMs);
  pendingAuth.set(ws, { challenge, timeout: authTimeout });
  send(ws, { type: 'auth_challenge', challenge });

  // Pong handler for dead connection detection
  (ws as any)._isAlive = true;
  ws.on('pong', () => { (ws as any)._isAlive = true; });

  ws.on('message', async (raw) => {
    try {
      let data: ClientMessage;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', code: 'INVALID_JSON', message: 'Invalid JSON' });
        return;
      }

      // If not yet authenticated, only accept auth_response
      if (!authenticatedClients.has(ws)) {
        if (data.type !== 'auth_response') {
          send(ws, { type: 'error', code: 'NOT_AUTHENTICATED', message: 'Please authenticate first' });
          return;
        }

        const pending = pendingAuth.get(ws);
        if (!pending) {
          send(ws, { type: 'auth_error', reason: 'No pending challenge' });
          ws.close(4401, 'No pending challenge');
          return;
        }

        if (!data.address || !isValidSuiAddress(data.address)) {
          send(ws, { type: 'auth_error', reason: 'Invalid address' });
          ws.close(4401, 'Invalid address');
          return;
        }

        const verifiedAddress = await verifySignature(
          pending.challenge, data.signature, data.address,
          data.authMethod, data.ephemeralPubKey,
        );
        clearTimeout(pending.timeout);
        pendingAuth.delete(ws);

        if (!verifiedAddress) {
          send(ws, { type: 'auth_error', reason: 'Invalid signature' });
          ws.close(4401, 'Auth failed');
          return;
        }

        // Successfully authenticated
        // Use client-provided displayName if valid, otherwise fall back to shortened address
        const clientDisplayName = typeof data.displayName === 'string' && data.displayName.trim().length > 0
          ? stripControlChars(data.displayName).slice(0, 32).trim()
          : verifiedAddress.slice(0, 6) + '...' + verifiedAddress.slice(-4);
        const client: AuthenticatedClient = {
          ws,
          address: verifiedAddress,
          displayName: clientDisplayName,
          profileImageUrl: null,
          connectedAt: Date.now(),
          lastMessageAt: 0,
          hasGenesisPass: false,
        };
        authenticatedClients.set(ws, client);

        // Try profile API override + Genesis Pass check (parallel, non-blocking)
        await Promise.all([
          fetchDisplayName(verifiedAddress, client),
          checkGenesisPass(verifiedAddress, client),
        ]);

        // Upsert user in DB
        try {
          upsertUser(verifiedAddress, client.displayName);
        } catch (err) {
          console.error('Failed to upsert user:', err);
        }

        const nickname = getNickname(verifiedAddress);
        const rateLimit = getNicknameRateLimit(verifiedAddress);
        const sessionToken = issueSessionToken(verifiedAddress);
        send(ws, { type: 'auth_success', address: verifiedAddress, displayName: client.displayName, nickname, rateLimit, sessionToken });
        send(ws, { type: 'rooms_list', rooms: ROOMS });
        broadcastOnlineCount();

        const uniqueCount = new Set(Array.from(authenticatedClients.values(), c => c.address)).size;
        console.log(`Authenticated: ${verifiedAddress.slice(0, 10)}... (${uniqueCount} users, ${authenticatedClients.size} connections)`);
        return;
      }

      // Reject duplicate auth attempts
      if (data.type === 'auth_response') {
        send(ws, { type: 'error', code: 'ALREADY_AUTHENTICATED', message: 'Already authenticated' });
        return;
      }

      const client = authenticatedClients.get(ws)!;

      // Check 24h max session
      if (Date.now() - client.connectedAt > CONFIG.maxSessionMs) {
        ws.close(4440, 'Session expired');
        return;
      }

      switch (data.type) {
        case 'send_message':
          handleSendMessage(client, data);
          break;
        case 'load_history':
          handleLoadHistory(client, data);
          break;
        case 'toggle_reaction':
          handleToggleReaction(client, data);
          break;
        case 'set_nickname':
          handleSetNickname(client, data);
          break;
        case 'check_nickname':
          handleCheckNickname(client, data);
          break;
        case 'clear_nickname': {
          const result = clearNickname(client.address);
          send(client.ws, { type: 'nickname_result', ok: result.ok, nickname: undefined, error: result.error, rateLimit: result.rateLimit });
          break;
        }
        case 'toggle_follow':
          handleToggleFollow(client, data);
          break;
        case 'get_following':
          send(client.ws, { type: 'following_list', addresses: getFollowing(client.address) });
          break;
        case 'list_rooms':
          send(ws, { type: 'rooms_list', rooms: ROOMS });
          break;
        default:
          send(ws, { type: 'error', code: 'UNKNOWN_TYPE', message: 'Unknown message type' });
      }
    } catch (err) {
      console.error('Message handler error:', err);
      send(ws, { type: 'error', code: 'INTERNAL_ERROR', message: 'Internal server error' });
    }
  });

  ws.on('close', () => {
    const pending = pendingAuth.get(ws);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingAuth.delete(ws);
    }

    authenticatedClients.delete(ws);

    // Decrement IP count
    const currentCount = connectionsPerIp.get(ip) || 0;
    if (currentCount <= 1) {
      connectionsPerIp.delete(ip);
    } else {
      connectionsPerIp.set(ip, currentCount - 1);
    }

    broadcastOnlineCount();
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
  });
});

// ===== Profile Fetch =====

async function fetchDisplayName(address: string, client: AuthenticatedClient): Promise<void> {
  const apiUrl = CONFIG.nasunProfileApiUrl;
  if (!apiUrl) return;

  try {
    const res = await fetch(`${apiUrl}/v3/user-profile?walletAddress=${encodeURIComponent(address)}`);
    if (!res.ok) return;
    const data = await res.json() as {
      customDisplayName?: string; twitterHandle?: string; username?: string;
      profileImageUrl?: string;
    };
    const name = data.customDisplayName || data.twitterHandle || data.username;
    if (name) {
      client.displayName = stripControlChars(name).slice(0, 32).trim();
    }
    // Validate and store profile image URL (https only)
    const imgUrl = data.profileImageUrl;
    if (imgUrl && typeof imgUrl === 'string' && imgUrl.startsWith('https://')) {
      client.profileImageUrl = imgUrl;
    }
    upsertUser(address, client.displayName, client.profileImageUrl ?? undefined);

    // Cache resolved display name in nasun_profiles for getDisplayName priority
    const resolvedName = name ? stripControlChars(name).slice(0, 32).trim() : null;
    upsertNasunProfile(address, resolvedName, client.profileImageUrl);
  } catch {
    // Non-critical: keep shortened address as display name
  }
}

async function checkGenesisPass(address: string, client: AuthenticatedClient): Promise<void> {
  const apiUrl = CONFIG.genesisPassApiUrl;
  if (!apiUrl) return;

  try {
    const res = await fetch(`${apiUrl}/genesis-pass/check?nasunAddress=${encodeURIComponent(address)}`);
    if (!res.ok) return;
    const data = await res.json() as { success?: boolean; data?: { hasGenesisPass?: boolean } };
    const hasPass = data.success === true && data.data?.hasGenesisPass === true;
    client.hasGenesisPass = hasPass;
    setGenesisPassStatus(address, hasPass);
  } catch {
    // Non-critical: badge just won't show
  }
}

// ===== Message Handler =====

function handleSendMessage(
  client: AuthenticatedClient,
  msg: { type: 'send_message'; content: string; roomId?: number; replyToId?: number }
): void {
  const now = Date.now();

  // Rate limit
  const lastTime = lastMessageTime.get(client.address) || 0;
  if (now - lastTime < CONFIG.rateLimitMs) {
    send(client.ws, { type: 'error', code: 'RATE_LIMITED', message: 'Too fast' });
    return;
  }
  lastMessageTime.set(client.address, now);

  // Validate content
  let content = msg.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    send(client.ws, { type: 'error', code: 'EMPTY_MESSAGE', message: 'Empty message' });
    return;
  }

  content = stripControlChars(content).trim();

  if (content.length === 0) {
    send(client.ws, { type: 'error', code: 'EMPTY_MESSAGE', message: 'Empty message' });
    return;
  }

  if (content.length > CONFIG.maxMessageLength) {
    send(client.ws, { type: 'error', code: 'TOO_LONG', message: `Max ${CONFIG.maxMessageLength} characters` });
    return;
  }

  if (hasReservedPrefix(content)) {
    send(client.ws, { type: 'error', code: 'RESERVED_PREFIX', message: 'Reserved prefix' });
    return;
  }

  // Validate roomId
  const roomId = msg.roomId ?? 0;
  if (!VALID_ROOM_IDS.has(roomId)) {
    send(client.ws, { type: 'error', code: 'INVALID_ROOM', message: 'Invalid room' });
    return;
  }

  // Validate replyToId
  const replyToId = msg.replyToId;
  if (replyToId !== undefined && replyToId !== null) {
    if (typeof replyToId !== 'number' || !Number.isInteger(replyToId) || replyToId <= 0) {
      send(client.ws, { type: 'error', code: 'INVALID_REPLY', message: 'Invalid replyToId' });
      return;
    }
  }

  // Store message
  try {
    const stored = insertMessage({
      roomId,
      sender: client.address,
      senderName: client.displayName,
      content,
      messageType: 'text',
      replyToId: replyToId ?? null,
      timestamp: now,
    });

    client.lastMessageAt = now;

    // Broadcast to all (including sender for confirmation)
    const nicknameMap = getNicknamesBatch([stored.sender]);
    const displayNameMap = getDisplayNamesBatch([stored.sender]);
    const profileNameSet = getAddressesWithProfileName([stored.sender]);
    const gpSet = getGenesisPassBatch([stored.sender]);
    const profileImageMap = new Map<string, string>();
    if (client.profileImageUrl) profileImageMap.set(stored.sender, client.profileImageUrl);
    const payload = storedToPayload(stored, { nicknameMap, displayNameMap, profileNameSet, gpSet, profileImageMap });
    for (const [ws] of authenticatedClients) {
      send(ws, payload);
    }

    // Check for AI chatbot mention (non-blocking)
    const senderNickname = nicknameMap.get(stored.sender) ?? null;
    onUserMessage(content, senderNickname, client.address, roomId).catch((err) => {
      console.warn('[Chatbot] Error:', (err as Error).message);
    });
  } catch (err) {
    console.error('Failed to insert message:', err);
    send(client.ws, { type: 'error', code: 'INTERNAL_ERROR', message: 'Failed to send message' });
  }
}

// ===== Reaction Handler =====

function handleToggleReaction(
  client: AuthenticatedClient,
  msg: { type: 'toggle_reaction'; messageId: number; emojiCode: string }
): void {
  const { messageId, emojiCode } = msg;

  // Whitelist validation
  if (!emojiCode || !VALID_REACTION_CODES.has(emojiCode)) {
    send(client.ws, { type: 'error', code: 'INVALID_REACTION', message: 'Invalid reaction code' });
    return;
  }

  // Validate messageId
  if (typeof messageId !== 'number' || !Number.isInteger(messageId) || messageId <= 0) {
    send(client.ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid messageId' });
    return;
  }

  // Rate limit: 500ms global
  const now = Date.now();
  const lastTime = lastReactionTime.get(client.address);
  if (lastTime && now - lastTime < 500) {
    send(client.ws, { type: 'error', code: 'RATE_LIMITED', message: 'Reaction rate limited' });
    return;
  }

  // Rate limit: 3s per-message cooldown
  const lastMsgReaction = lastReactionMessageMap.get(client.address);
  if (lastMsgReaction && lastMsgReaction.messageId === messageId && now - lastMsgReaction.at < 3000) {
    send(client.ws, { type: 'error', code: 'RATE_LIMITED', message: 'Per-message cooldown' });
    return;
  }

  // Message existence + roomId
  const roomId = getMessageRoomId(messageId);
  if (roomId === null) {
    send(client.ws, { type: 'error', code: 'MESSAGE_NOT_FOUND', message: 'Message not found' });
    return;
  }

  try {
    const reactions = toggleReaction(messageId, client.address, emojiCode);
    lastReactionTime.set(client.address, now);
    lastReactionMessageMap.set(client.address, { messageId, at: now });

    // Send per-client reaction_update with each client's myReaction
    for (const [ws, c] of authenticatedClients) {
      const myReaction = getUserReaction(messageId, c.address);
      send(ws, { type: 'reaction_update', messageId, roomId, reactions, myReaction });
    }
  } catch (err) {
    console.error('Failed to toggle reaction:', err);
    send(client.ws, { type: 'error', code: 'INTERNAL_ERROR', message: 'Failed to toggle reaction' });
  }
}

// ===== History Handler =====

function handleLoadHistory(
  client: AuthenticatedClient,
  msg: { type: 'load_history'; roomId?: number; before?: number; limit?: number }
): void {
  const now = Date.now();

  // Rate limit
  const lastTime = lastHistoryTime.get(client.address) || 0;
  if (now - lastTime < CONFIG.historyRateLimitMs) {
    send(client.ws, { type: 'error', code: 'RATE_LIMITED', message: 'Too fast' });
    return;
  }
  lastHistoryTime.set(client.address, now);

  const roomId = msg.roomId ?? 0;
  if (!VALID_ROOM_IDS.has(roomId)) {
    send(client.ws, { type: 'error', code: 'INVALID_ROOM', message: 'Invalid room' });
    return;
  }

  const limit = Math.min(msg.limit || 50, 100);
  const messages = getRecentMessages(roomId, limit, msg.before);

  // Batch fetch reactions and nicknames for all messages
  const messageIds = messages.map((m) => m.id);
  const reactionMap = getReactionSummaries(messageIds, client.address);
  const senderAddresses = [...new Set(messages.map((m) => m.sender))];
  const nicknameMap = getNicknamesBatch(senderAddresses);
  const displayNameMap = getDisplayNamesBatch(senderAddresses);
  const profileNameSet = getAddressesWithProfileName(senderAddresses);
  const gpSet = getGenesisPassBatch(senderAddresses);
  const profileImageMap = getProfileImagesBatch(senderAddresses);

  send(client.ws, {
    type: 'history',
    roomId,
    messages: messages.map((m) => {
      const payload = storedToPayload(m, { nicknameMap, displayNameMap, profileNameSet, gpSet, profileImageMap });
      const reactionData = reactionMap.get(m.id);
      if (reactionData) {
        payload.reactions = reactionData.reactions;
        payload.myReaction = reactionData.myReaction;
      }
      return payload;
    }),
    hasMore: messages.length === limit,
  });
}

// ===== Nickname Handler =====

function handleSetNickname(
  client: AuthenticatedClient,
  msg: { type: 'set_nickname'; nickname: string }
): void {
  const nickname = typeof msg.nickname === 'string' ? msg.nickname.trim() : '';
  const validation = validateNickname(nickname);
  if (!validation.ok) {
    send(client.ws, { type: 'nickname_result', ok: false, error: validation.error });
    return;
  }
  const result = setNickname(client.address, nickname);
  if (result.ok) {
    send(client.ws, { type: 'nickname_result', ok: true, nickname, rateLimit: result.rateLimit });
  } else {
    send(client.ws, { type: 'nickname_result', ok: false, error: result.error, rateLimit: result.rateLimit });
  }
}

function handleCheckNickname(
  client: AuthenticatedClient,
  msg: { type: 'check_nickname'; nickname: string }
): void {
  const nickname = typeof msg.nickname === 'string' ? msg.nickname.trim() : '';
  const validation = validateNickname(nickname);
  if (!validation.ok) {
    send(client.ws, { type: 'nickname_check', available: false, nickname });
    return;
  }
  const available = isNicknameAvailable(nickname);
  send(client.ws, { type: 'nickname_check', available, nickname });
}

// ===== Follow Handler =====

function handleToggleFollow(
  client: AuthenticatedClient,
  msg: { type: 'toggle_follow'; target: string }
): void {
  const { target } = msg;

  if (!target || !isValidSuiAddress(target)) {
    send(client.ws, { type: 'follow_result', target: target || '', following: false, followerCount: 0, error: 'INVALID_ADDRESS' });
    return;
  }

  if (!checkFollowRateLimit(client.address)) {
    send(client.ws, { type: 'follow_result', target, following: false, followerCount: 0, error: 'RATE_LIMITED' });
    return;
  }

  try {
    const result = toggleFollow(client.address, target);
    updateFollowerCountCache(target.toLowerCase(), result.followerCount);
    send(client.ws, { type: 'follow_result', target, following: result.following, followerCount: result.followerCount });
  } catch (err) {
    const code = (err as Error).message;
    send(client.ws, { type: 'follow_result', target, following: false, followerCount: 0, error: code });
  }
}

// ===== Keepalive + Dead Connection Detection =====

const HEARTBEAT_INTERVAL = 30_000;
const heartbeatTimer = setInterval(() => {
  for (const [ws, client] of authenticatedClients) {
    if ((ws as any)._isAlive === false) {
      // Did not respond to previous ping, terminate
      console.log(`Terminating dead connection: ${client.address}`);
      ws.terminate();
      continue;
    }
    (ws as any)._isAlive = false;
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      // Also send a data-level heartbeat: browsers do not expose WS protocol
      // pings to JavaScript, so clients rely on this frame to detect activity.
      send(ws, { type: 'heartbeat' });
    }

    // Also check session expiry during heartbeat
    if (Date.now() - client.connectedAt > CONFIG.maxSessionMs) {
      ws.close(4440, 'Session expired');
    }
  }
}, HEARTBEAT_INTERVAL);

// ===== Stale Rate Limit Cleanup =====

const CLEANUP_INTERVAL = 5 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const threshold = Date.now() - 60_000;
  for (const [key, ts] of lastMessageTime) {
    if (ts < threshold) lastMessageTime.delete(key);
  }
  for (const [key, ts] of lastHistoryTime) {
    if (ts < threshold) lastHistoryTime.delete(key);
  }
  for (const [key, ts] of lastReactionTime) {
    if (ts < threshold) lastReactionTime.delete(key);
  }
  for (const [key, val] of lastReactionMessageMap) {
    if (val.at < threshold) lastReactionMessageMap.delete(key);
  }
  for (const [key, timestamps] of lastFollowToggleTime) {
    while (timestamps.length > 0 && timestamps[0] < threshold) timestamps.shift();
    if (timestamps.length === 0) lastFollowToggleTime.delete(key);
  }
  cleanupSessionTokens();
  cleanupApiRateLimits();
}, CLEANUP_INTERVAL);

// ===== Retention Cleanup =====

const retentionTimer = setInterval(() => {
  const deleted = purgeOldMessages(CONFIG.messageRetentionDays);
  if (deleted > 0) {
    console.log(`Purged ${deleted} old messages`);
  }
}, CONFIG.retentionCleanupIntervalMs);

// ===== Startup =====

try {
  initStore(CONFIG);
  setProfileApiUrl(CONFIG.nasunProfileApiUrl);
} catch (err) {
  console.error('FATAL: Failed to initialize database:', err);
  process.exit(1);
}

// ===== Leaderboard Initialization (conditional) =====

let orderEventRetentionTimer: ReturnType<typeof setInterval> | null = null;
let profileSyncTimer: ReturnType<typeof setInterval> | null = null;

if (leaderboardEnabled) {
  try {
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
    const purged = purgeOldOrderEvents(CONFIG.orderEventRetentionDays);
    if (purged > 0) console.log(`[Leaderboard] Purged ${purged} expired order events`);

    // WAL checkpoint to reclaim disk
    try { getLeaderboardDb().pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }

    // Admin key length validation
    if (CONFIG.competitionAdminKey && CONFIG.competitionAdminKey.length < 32) {
      console.warn('[Security] competitionAdminKey is too short (< 32 chars). Competition admin API disabled.');
    }

    // Pool-to-room mapping (nasun 100+ room IDs)
    const poolMappings: [string | undefined, number][] = [
      [process.env.POOL_NBTC_NUSDC, 101],
      [process.env.POOL_NASUN_NUSDC, 100],
      [process.env.POOL_NETH_NUSDC, 103],
      [process.env.POOL_NSOL_NUSDC, 104],
    ];
    for (const [poolId, roomId] of poolMappings) {
      if (poolId) setPoolRoomMapping(poolId, roomId);
    }

    // Market narrator (rule-based + optional AI)
    initNarrator({
      broadcast: (content: string) => broadcastSystemMessage(content),
      broadcastToRoom: broadcastSystemMessageMultiRoom,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Indexer + aggregator
    const lbConfig: LeaderboardConfig = {
      leaderboardDbPath: CONFIG.leaderboardDbPath,
      deepbookPackage: CONFIG.deepbookPackage,
      rpcUrl: CONFIG.rpcUrl,
      indexerPollIntervalMs: CONFIG.indexerPollIntervalMs,
      aggregationIntervalMs: CONFIG.aggregationIntervalMs,
      excludedAddresses: new Set(CONFIG.excludedAddresses),
    };
    const largeTradeThresholdRaw = BigInt(CONFIG.largeTradeThresholdNusdc) * 1_000_000n;

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

    // Periodic order event cleanup
    orderEventRetentionTimer = setInterval(() => {
      purgeOldOrderEvents(CONFIG.orderEventRetentionDays);
    }, 60 * 60 * 1000); // 1 hour

    // Background profile sync: cache display names for active traders
    const PROFILE_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    const syncActiveTraderProfiles = async () => {
      try {
        const addresses = getActiveTraderAddresses(500);
        if (addresses.length > 0) {
          await ensureProfilesCached(addresses);
          console.log(`[ProfileSync] Synced profiles for ${addresses.length} active traders`);
        }
      } catch (err) {
        console.warn('[ProfileSync] Error:', err);
      }
    };
    // Run once after 10s startup delay, then every 10 minutes
    setTimeout(syncActiveTraderProfiles, 10_000);
    profileSyncTimer = setInterval(syncActiveTraderProfiles, PROFILE_SYNC_INTERVAL_MS);

    console.log('[Leaderboard] Indexer + aggregator + narrator + profile sync started');
  } catch (err) {
    console.error('[Leaderboard] FATAL: Failed to initialize:', err);
    process.exit(1);
  }
} else {
  console.log('[Leaderboard] Disabled (DEEPBOOK_PACKAGE not set)');
}

// ===== AI Chatbot (mention-based @nasun/@wavi responses) =====

if (process.env.ANTHROPIC_API_KEY) {
  initChatbot({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    broadcastToRoom: broadcastSystemMessage,
  });
} else {
  console.log('[Chatbot] Disabled (ANTHROPIC_API_KEY not set)');
}

httpServer.listen(CONFIG.port, () => {
  console.log(`Nasun Chat Server listening on port ${CONFIG.port}`);
  console.log(`Allowed origins: ${CONFIG.allowedOrigins.join(', ')}`);
});

// ===== Graceful Shutdown =====

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return; // Prevent double invocation
  shuttingDown = true;
  console.log('Shutting down...');
  clearInterval(heartbeatTimer);
  clearInterval(cleanupTimer);
  clearInterval(retentionTimer);
  if (orderEventRetentionTimer) clearInterval(orderEventRetentionTimer);
  if (profileSyncTimer) clearInterval(profileSyncTimer);

  // Stop chatbot + leaderboard modules (DB writes cease)
  stopChatbot();
  if (leaderboardEnabled) {
    stopIndexer();
    stopAggregator();
    stopNarrator();
  }

  // Terminate all WebSocket connections
  for (const [ws] of authenticatedClients) {
    try { ws.terminate(); } catch {}
  }
  for (const [ws] of pendingAuth) {
    try { ws.terminate(); } catch {}
  }

  wss.close();
  httpServer.close(() => {
    if (leaderboardEnabled) closeLeaderboardStore(); // WAL checkpoint + close
    closeStore();
    console.log('[Chat] Shutdown complete');
    process.exit(0);
  });

  // Force exit after 5s if graceful close hangs
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
