/**
 * ChatService - WebSocket chat client
 *
 * Handles connection, authentication, and message management
 * for the Pado global chat feature.
 */

import type { ChatMessage, ChatConnectionStatus } from '../features/social/types';

// ===== Protocol types (mirror server types) =====

interface AuthChallengeMsg { type: 'auth_challenge'; challenge: string }
interface AuthSuccessMsg { type: 'auth_success'; address: string }
interface AuthErrorMsg { type: 'auth_error'; reason: string }
interface ChatMessageMsg {
  type: 'chat_message';
  id: number;
  roomId: number;
  sender: string;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
}
interface HistoryMsg {
  type: 'history';
  messages: ChatMessageMsg[];
  hasMore: boolean;
}
interface OnlineCountMsg { type: 'online_count'; count: number }
interface ErrorMsg { type: 'error'; code: string; message: string }

type ServerMessage = AuthChallengeMsg | AuthSuccessMsg | AuthErrorMsg | ChatMessageMsg | HistoryMsg | OnlineCountMsg | ErrorMsg;

// ===== Listener types =====

export type ChatEventType = 'message' | 'history' | 'status' | 'online_count' | 'error';

export interface ChatEventMap {
  message: ChatMessage;
  history: { messages: ChatMessage[]; hasMore: boolean };
  status: ChatConnectionStatus;
  online_count: number;
  error: { code: string; message: string };
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

  // Message dedup: track seen message IDs
  private seenMessageIds = new Set<number>();

  constructor() {
    for (const type of ['message', 'history', 'status', 'online_count', 'error'] as ChatEventType[]) {
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
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
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
        this.setStatus('connected');
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
        content: m.content,
        messageType: m.messageType,
        replyToId: m.replyToId,
        timestamp: m.timestamp,
      };
    });

    this.emit('history', { messages, hasMore: msg.hasMore });
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

  private scheduleReconnect(): void {
    if (this.reconnectAttempts < 0) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, this.reconnectAttempts),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }
}
