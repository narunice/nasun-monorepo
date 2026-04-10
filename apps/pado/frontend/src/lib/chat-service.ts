/**
 * ChatService - WebSocket chat client
 *
 * Handles connection, authentication, and message management
 * for the Pado global chat feature.
 */

import type { ChatMessage, ChatConnectionStatus, RoomInfo } from '../features/social/types';

// ===== Protocol types (mirror server types) =====

interface AuthChallengeMsg { type: 'auth_challenge'; challenge: string }
interface AuthSuccessMsg { type: 'auth_success'; address: string; nickname: string | null; rateLimit?: NicknameRateLimit; sessionToken?: string }
interface AuthErrorMsg { type: 'auth_error'; reason: string }
interface ChatMessageMsg {
  type: 'chat_message';
  id: number;
  roomId: number;
  sender: string;
  senderNickname: string | null;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
}
interface HistoryMsg {
  type: 'history';
  roomId: number;
  messages: ChatMessageMsg[];
  hasMore: boolean;
}
interface RoomsListMsg { type: 'rooms_list'; rooms: { id: number; name: string; description: string }[] }
interface OnlineCountMsg { type: 'online_count'; count: number }
interface ErrorMsg { type: 'error'; code: string; message: string }
interface NicknameResultMsg { type: 'nickname_result'; ok: boolean; nickname?: string; error?: string; rateLimit?: NicknameRateLimit }
interface NicknameCheckMsg { type: 'nickname_check'; available: boolean; nickname: string }
interface HeartbeatMsg { type: 'heartbeat' }
interface ReactionUpdateMsg { type: 'reaction_update'; messageId: number; roomId: number; reactions: Record<string, number> }
interface FollowResultMsg { type: 'follow_result'; target: string; following: boolean; followerCount: number; error?: string }
interface FollowingListMsg { type: 'following_list'; addresses: string[] }

type ServerMessage =
  | AuthChallengeMsg | AuthSuccessMsg | AuthErrorMsg
  | ChatMessageMsg | HistoryMsg | RoomsListMsg | OnlineCountMsg | ErrorMsg
  | NicknameResultMsg | NicknameCheckMsg | HeartbeatMsg | ReactionUpdateMsg
  | FollowResultMsg | FollowingListMsg;

// ===== Listener types =====

export type ChatEventType = 'message' | 'history' | 'status' | 'online_count' | 'error' | 'nickname' | 'nickname_check' | 'rooms_list' | 'reaction_update' | 'follow_result' | 'following_list';

export interface ChatEventMap {
  message: ChatMessage;
  history: { roomId: number; messages: ChatMessage[]; hasMore: boolean };
  status: ChatConnectionStatus;
  online_count: number;
  error: { code: string; message: string };
  nickname: { ok: boolean; nickname?: string | null; error?: string; rateLimit?: NicknameRateLimit };
  nickname_check: { available: boolean; nickname: string };
  rooms_list: RoomInfo[];
  reaction_update: { messageId: number; roomId: number; reactions: Record<string, number> };
  follow_result: { target: string; following: boolean; followerCount: number; error?: string };
  following_list: { addresses: string[] };
}

export interface NicknameRateLimit {
  canChange: boolean;
  changesRemaining: number;
  lockedUntil: number | null; // epoch ms
}

type ChatListener<T extends ChatEventType> = (data: ChatEventMap[T]) => void;

// ===== Signer interface (injected from @nasun/wallet) =====

export type ChatAuthMethod = 'personal_sign' | 'ephemeral';

export interface ChatSigner {
  address: string;
  signPersonal(message: Uint8Array): Promise<{ signature: string }>;
  authMethod?: ChatAuthMethod;
  ephemeralPubKey?: string;
  signWithEphemeralKey?(message: Uint8Array): Promise<{ signature: string }>;
}

// ===== ChatService =====

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MULTIPLIER = 2;
const CONNECTION_TIMEOUT_MS = 10_000;

let instance: ChatService | null = null;

export function getChatService(): ChatService {
  if (!instance) {
    instance = new ChatService();
  }
  return instance;
}

export class ChatService {
  private ws: WebSocket | null = null;
  private status: ChatConnectionStatus = 'disconnected';
  private signer: ChatSigner | null = null;
  private wsUrl: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<ChatEventType, Set<ChatListener<ChatEventType>>>();
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastServerActivity = 0;

  // Message dedup: track seen message IDs
  private seenMessageIds = new Set<number>();

  // Cache nickname so new subscribers can read it without waiting for events
  private currentNickname: string | null = null;

  // Session token for REST API authentication (issued on WS auth_success)
  private sessionToken: string | null = null;

  constructor() {
    for (const type of ['message', 'history', 'status', 'online_count', 'error', 'nickname', 'nickname_check', 'rooms_list', 'reaction_update', 'follow_result', 'following_list'] as ChatEventType[]) {
      this.listeners.set(type, new Set());
    }
  }

  /**
   * Connect to chat server with wallet signer for authentication
   */
  connect(wsUrl: string, signer: ChatSigner): void {
    // Already connected/connecting with the same address — just update signer ref
    if (this.signer?.address === signer.address &&
        (this.status === 'connected' || this.status === 'connecting' || this.status === 'authenticating')) {
      this.signer = signer;
      return;
    }

    this.wsUrl = wsUrl;
    this.signer = signer;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  /**
   * Request reconnection if disconnected.
   * Called by useChat periodic check to recover from transient failures.
   */
  reconnect(): void {
    if (this.status !== 'disconnected') return;
    if (!this.wsUrl || !this.signer) return;
    if (this.reconnectTimer) return; // Already scheduled
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  /**
   * Disconnect from chat server
   */
  disconnect(): void {
    this.reconnectAttempts = -1; // Prevent auto-reconnect
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    this.stopKeepalive();
    if (this.ws) {
      // Only close if already open; a CONNECTING socket triggers a noisy browser error
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'User disconnect');
      }
      this.ws = null;
    }
    this.currentNickname = null;
    this.sessionToken = null;
    this.seenMessageIds.clear();
    this.setStatus('disconnected');
  }

  /**
   * Send a chat message
   */
  sendMessage(content: string, roomId: number = 0, replyToId?: number): void {
    if (!this.ws || this.status !== 'connected') return;

    this.ws.send(JSON.stringify({
      type: 'send_message',
      content,
      roomId,
      replyToId,
    }));
  }

  /**
   * Load older messages (pagination)
   */
  loadHistory(roomId: number = 0, beforeId?: number, limit: number = 50): void {
    if (!this.ws || this.status !== 'connected') return;

    this.ws.send(JSON.stringify({
      type: 'load_history',
      roomId,
      before: beforeId,
      limit,
    }));
  }

  /**
   * Request nickname change
   */
  setNickname(nickname: string): void {
    if (!this.ws || this.status !== 'connected') return;
    this.ws.send(JSON.stringify({ type: 'set_nickname', nickname }));
  }

  /**
   * Check nickname availability
   */
  checkNickname(nickname: string): void {
    if (!this.ws || this.status !== 'connected') return;
    this.ws.send(JSON.stringify({ type: 'check_nickname', nickname }));
  }

  clearNickname(): void {
    if (!this.ws || this.status !== 'connected') return;
    this.ws.send(JSON.stringify({ type: 'clear_nickname' }));
  }

  /**
   * Toggle reaction on a message
   */
  toggleReaction(messageId: number, emojiCode: string): void {
    if (!this.ws || this.status !== 'connected') return;
    this.ws.send(JSON.stringify({ type: 'toggle_reaction', messageId, emojiCode }));
  }

  /**
   * Toggle follow on a trader address
   */
  toggleFollow(target: string): void {
    if (!this.ws || this.status !== 'connected') return;
    this.ws.send(JSON.stringify({ type: 'toggle_follow', target }));
  }

  /**
   * Request the list of followed addresses
   */
  getFollowing(): void {
    if (!this.ws || this.status !== 'connected') return;
    this.ws.send(JSON.stringify({ type: 'get_following' }));
  }

  /**
   * Get the current session token for REST API calls
   */
  getSessionToken(): string | null {
    return this.sessionToken;
  }

  /**
   * Subscribe to events
   */
  on<T extends ChatEventType>(type: T, listener: ChatListener<T>): () => void {
    const set = this.listeners.get(type);
    if (set) {
      set.add(listener as ChatListener<ChatEventType>);
    }
    return () => {
      set?.delete(listener as ChatListener<ChatEventType>);
    };
  }

  getStatus(): ChatConnectionStatus {
    return this.status;
  }

  getNickname(): string | null {
    return this.currentNickname;
  }

  // ===== Internal =====

  private doConnect(): void {
    if (this.status === 'connecting' || this.status === 'authenticating') return;
    if (!this.wsUrl || !this.signer) return;

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    // Connection timeout: close if not authenticated within limit
    this.connectionTimer = setTimeout(() => {
      if (this.status !== 'connected') {
        console.warn('[ChatService] Connection timeout');
        this.ws?.close(4408, 'Connection timeout');
      }
    }, CONNECTION_TIMEOUT_MS);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      this.lastServerActivity = Date.now();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    this.ws.onclose = (event) => {
      this.ws = null;
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      this.stopKeepalive();
      if (this.reconnectAttempts >= 0 && event.code !== 4401) {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      } else {
        this.setStatus('disconnected');
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private async handleServerMessage(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case 'auth_challenge':
        await this.handleAuthChallenge(msg.challenge);
        break;

      case 'auth_success':
        if (this.connectionTimer) {
          clearTimeout(this.connectionTimer);
          this.connectionTimer = null;
        }
        this.currentNickname = msg.nickname ?? null;
        this.sessionToken = msg.sessionToken ?? null;
        this.setStatus('connected');
        this.startKeepalive();
        // Emit nickname info from auth_success (preserve null for needsNickname detection)
        this.emit('nickname', { ok: true, nickname: msg.nickname, rateLimit: msg.rateLimit });
        break;

      case 'auth_error':
        this.emit('error', { code: 'AUTH_FAILED', message: msg.reason });
        // Server will close the connection, prevent reconnect
        this.reconnectAttempts = -1;
        break;

      case 'chat_message':
        this.handleChatMessage(msg);
        break;

      case 'history':
        this.handleHistory(msg);
        break;

      case 'online_count':
        this.emit('online_count', msg.count);
        break;

      case 'error':
        this.emit('error', { code: msg.code, message: msg.message });
        break;

      case 'nickname_result':
        if (msg.ok) {
          this.currentNickname = msg.nickname ?? null;
        }
        this.emit('nickname', { ok: msg.ok, nickname: msg.nickname, error: msg.error, rateLimit: msg.rateLimit });
        break;

      case 'nickname_check':
        this.emit('nickname_check', { available: msg.available, nickname: msg.nickname });
        break;

      case 'rooms_list':
        this.emit('rooms_list', msg.rooms);
        break;

      case 'reaction_update':
        this.emit('reaction_update', { messageId: msg.messageId, roomId: msg.roomId, reactions: msg.reactions });
        break;

      case 'follow_result':
        this.emit('follow_result', { target: msg.target, following: msg.following, followerCount: msg.followerCount, error: msg.error });
        break;

      case 'following_list':
        this.emit('following_list', { addresses: msg.addresses });
        break;

      case 'heartbeat':
        // No-op: lastServerActivity already updated in onmessage handler
        break;
    }
  }

  private async handleAuthChallenge(challenge: string): Promise<void> {
    if (!this.signer || !this.ws) return;

    this.setStatus('authenticating');

    try {
      const messageBytes = new TextEncoder().encode(challenge);

      let signature: string;
      let authMethod: ChatAuthMethod = 'personal_sign';
      let ephemeralPubKey: string | undefined;

      if (this.signer.authMethod === 'ephemeral' && this.signer.signWithEphemeralKey) {
        const result = await this.signer.signWithEphemeralKey(messageBytes);
        signature = result.signature;
        authMethod = 'ephemeral';
        ephemeralPubKey = this.signer.ephemeralPubKey;
      } else {
        const result = await this.signer.signPersonal(messageBytes);
        signature = result.signature;
      }

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'auth_response',
          signature,
          address: this.signer.address,
          ...(authMethod === 'ephemeral' && { authMethod, ephemeralPubKey }),
        }));
      }
    } catch (err) {
      console.error('[ChatService] Auth signing failed:', err);
      this.emit('error', { code: 'SIGN_FAILED', message: 'Failed to sign authentication challenge' });
      this.disconnect();
    }
  }

  private handleChatMessage(msg: ChatMessageMsg): void {
    if (this.seenMessageIds.has(msg.id)) return;
    this.seenMessageIds.add(msg.id);

    // Keep dedup set bounded — evict oldest (lowest) IDs
    if (this.seenMessageIds.size > 2000) {
      const sorted = Array.from(this.seenMessageIds).sort((a, b) => a - b);
      for (let i = 0; i < 500; i++) {
        this.seenMessageIds.delete(sorted[i]);
      }
    }

    const chatMessage: ChatMessage = {
      id: msg.id,
      roomId: msg.roomId,
      sender: msg.sender,
      senderNickname: msg.senderNickname ?? undefined,
      content: msg.content,
      messageType: msg.messageType,
      replyToId: msg.replyToId,
      timestamp: msg.timestamp,
    };

    this.emit('message', chatMessage);
  }

  private handleHistory(msg: HistoryMsg): void {
    const messages: ChatMessage[] = msg.messages.map((m) => {
      this.seenMessageIds.add(m.id);
      return {
        id: m.id,
        roomId: m.roomId,
        sender: m.sender,
        senderNickname: m.senderNickname ?? undefined,
        content: m.content,
        messageType: m.messageType,
        replyToId: m.replyToId,
        timestamp: m.timestamp,
      };
    });

    this.emit('history', { roomId: msg.roomId, messages, hasMore: msg.hasMore });
  }

  private setStatus(status: ChatConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }

  private emit<T extends ChatEventType>(type: T, data: ChatEventMap[T]): void {
    const set = this.listeners.get(type);
    if (set) {
      set.forEach((listener) => {
        try {
          (listener as ChatListener<T>)(data);
        } catch (err) {
          console.error(`[ChatService] Listener error (${type}):`, err);
        }
      });
    }
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.lastServerActivity = Date.now();
    // Server sends ping every 30s; if no activity for 90s, connection is likely dead
    this.keepaliveTimer = setInterval(() => {
      if (Date.now() - this.lastServerActivity > 90_000) {
        console.warn('[ChatService] Server keepalive timeout');
        this.ws?.close(4408, 'Keepalive timeout');
      }
    }, 30_000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < 0) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }
}
