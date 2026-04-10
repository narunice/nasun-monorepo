import './env.js'; // Must be first: loads .env before any module reads process.env
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { generateChallenge, verifySignature, isValidSuiAddress, setProfileApiUrl } from './auth.js';
import { initStore, insertMessage, getRecentMessages, purgeOldMessages, upsertUser, closeStore, toggleReaction, getReactionSummaries, getMessageRoomId, getUserReaction } from './store.js';
import { stripControlChars, hasReservedPrefix } from './sanitize.js';
import type { AuthenticatedClient, ClientMessage, ServerMessage, ChatMessagePayload, StoredMessage } from './types.js';
import { DEFAULT_CONFIG as CONFIG, ROOMS, VALID_ROOM_IDS, VALID_REACTION_CODES } from './types.js';

// ===== State =====

const pendingAuth = new Map<WebSocket, { challenge: string; timeout: ReturnType<typeof setTimeout> }>();
const authenticatedClients = new Map<WebSocket, AuthenticatedClient>();
const lastMessageTime = new Map<string, number>();
const lastHistoryTime = new Map<string, number>();
const connectionsPerIp = new Map<string, number>();
const lastReactionTime = new Map<string, number>();
const lastReactionMessageMap = new Map<string, { messageId: number; at: number }>();

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

function storedToPayload(msg: StoredMessage): ChatMessagePayload {
  return {
    type: 'chat_message',
    id: msg.id,
    roomId: msg.roomId,
    sender: msg.sender,
    senderName: msg.senderName,
    content: msg.content,
    messageType: msg.messageType,
    replyToId: msg.replyToId,
    timestamp: msg.timestamp,
  };
}

// ===== WebSocket Server =====

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

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
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim()
    || req.socket.remoteAddress || 'unknown';
  const ipCount = (connectionsPerIp.get(ip) || 0) + 1;
  if (ipCount > CONFIG.maxConnectionsPerIp) {
    ws.close(4429, 'Too many connections');
    return;
  }
  connectionsPerIp.set(ip, ipCount);

  // Generate challenge and send
  const challenge = generateChallenge();
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
        const client: AuthenticatedClient = {
          ws,
          address: verifiedAddress,
          displayName: verifiedAddress.slice(0, 6) + '...' + verifiedAddress.slice(-4),
          connectedAt: Date.now(),
          lastMessageAt: 0,
        };
        authenticatedClients.set(ws, client);

        // Fetch display name before sending auth_success (non-blocking on failure)
        await fetchDisplayName(verifiedAddress, client);

        // Upsert user in DB
        try {
          upsertUser(verifiedAddress, client.displayName);
        } catch (err) {
          console.error('Failed to upsert user:', err);
        }

        send(ws, { type: 'auth_success', address: verifiedAddress, displayName: client.displayName });
        send(ws, { type: 'rooms_list', rooms: ROOMS });
        broadcastOnlineCount();

        console.log(`Authenticated: ${verifiedAddress.slice(0, 10)}... (${authenticatedClients.size} online)`);
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
    const res = await fetch(`${apiUrl}/v3/user-profile?walletAddress=${address}`);
    if (!res.ok) return;
    const data = await res.json() as { customDisplayName?: string; twitterHandle?: string; username?: string };
    const name = data.customDisplayName || data.twitterHandle || data.username;
    if (name) {
      client.displayName = stripControlChars(name).slice(0, 32).trim();
      upsertUser(address, client.displayName);
    }
  } catch {
    // Non-critical: keep shortened address as display name
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
    const payload = storedToPayload(stored);
    for (const [ws] of authenticatedClients) {
      send(ws, payload);
    }
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

  // Batch fetch reactions for all messages
  const messageIds = messages.map((m) => m.id);
  const reactionMap = getReactionSummaries(messageIds, client.address);

  send(client.ws, {
    type: 'history',
    roomId,
    messages: messages.map((m) => {
      const payload = storedToPayload(m);
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

  // Terminate all WebSocket connections immediately
  for (const [ws] of authenticatedClients) {
    try { ws.terminate(); } catch {}
  }
  for (const [ws] of pendingAuth) {
    try { ws.terminate(); } catch {}
  }

  wss.close();
  httpServer.close(() => {
    closeStore();
    process.exit(0);
  });

  // Force exit after 3s if graceful close hangs
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
