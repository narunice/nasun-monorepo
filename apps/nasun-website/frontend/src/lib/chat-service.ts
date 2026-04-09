/**
 * ChatService - WebSocket chat client for nasun-website
 *
 * Singleton pattern. Manages connection, Cognito JWT auth, message handling.
 * Pushes events to Zustand chatStore via listeners.
 */

// ===== Protocol types (mirror server types) =====

interface AuthRequiredMsg { type: 'auth_required' }
interface AuthSuccessMsg { type: 'auth_success'; userId: string; displayName: string }
interface AuthErrorMsg { type: 'auth_error'; reason: string }
interface ChatMessageMsg {
  type: 'chat_message';
  id: number;
  sender: string;
  senderName: string;
  content: string;
  messageType: 'text' | 'system';
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
interface HeartbeatMsg { type: 'heartbeat' }

type ServerMessage =
  | AuthRequiredMsg | AuthSuccessMsg | AuthErrorMsg
  | ChatMessageMsg | HistoryMsg | OnlineCountMsg | ErrorMsg | HeartbeatMsg;

// ===== Public types =====

export interface ChatMessage {
  id: number;
  sender: string;
  senderName: string;
  content: string;
  messageType: 'text' | 'system';
  replyToId: number | null;
  timestamp: number;
}

export type ChatConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type ChatEventType = 'message' | 'history' | 'status' | 'online_count' | 'error';

export interface ChatEventMap {
  message: ChatMessage;
  history: { messages: ChatMessage[]; hasMore: boolean };
  status: ChatConnectionStatus;
  online_count: number;
  error: { code: string; message: string };
}

type ChatListener<T extends ChatEventType> = (data: ChatEventMap[T]) => void;

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
  private token: string = '';
  private displayName: string = '';
  private wsUrl: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<ChatEventType, Set<ChatListener<ChatEventType>>>();
  private seenMessageIds = new Set<number>();

  on<T extends ChatEventType>(event: T, listener: ChatListener<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as ChatListener<ChatEventType>);
  }

  off<T extends ChatEventType>(event: T, listener: ChatListener<T>): void {
    this.listeners.get(event)?.delete(listener as ChatListener<ChatEventType>);
  }

  private emit<T extends ChatEventType>(event: T, data: ChatEventMap[T]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const fn of set) {
        try { fn(data); } catch (e) { console.error('Chat listener error:', e); }
      }
    }
  }

  private setStatus(s: ChatConnectionStatus): void {
    this.status = s;
    this.emit('status', s);
  }

  getStatus(): ChatConnectionStatus {
    return this.status;
  }

  connect(wsUrl: string, token: string, displayName: string): void {
    // If already connected with same token, skip
    if (this.ws && this.status === 'connected' && this.token === token) {
      return;
    }

    this.wsUrl = wsUrl;
    this.token = token;
    this.displayName = displayName;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.reconnectAttempts = 0;
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

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      console.error('WS connection error:', err);
      this.scheduleReconnect();
      return;
    }

    // Connection timeout
    this.connectionTimer = setTimeout(() => {
      if (this.status === 'connecting') {
        this.ws?.close();
        this.scheduleReconnect();
      }
    }, CONNECTION_TIMEOUT_MS);

    this.ws.onopen = () => {
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      // Wait for auth_required from server, then send auth
    };

    this.ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      if (this.status !== 'disconnected') {
        this.setStatus('disconnected');
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'auth_required':
        // Server is ready for auth, send our JWT
        this.sendRaw({
          type: 'auth',
          token: this.token,
          displayName: this.displayName,
        });
        break;

      case 'auth_success':
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        // Load initial history
        this.loadHistory();
        break;

      case 'auth_error':
        console.warn('Chat auth error:', msg.reason);
        this.emit('error', { code: 'AUTH_ERROR', message: msg.reason });
        // Don't reconnect on auth errors (token is invalid)
        this.ws?.close();
        this.ws = null;
        this.setStatus('disconnected');
        break;

      case 'chat_message': {
        // Dedup
        if (this.seenMessageIds.has(msg.id)) return;
        this.seenMessageIds.add(msg.id);
        // Cap dedup set
        if (this.seenMessageIds.size > 2000) {
          const ids = Array.from(this.seenMessageIds);
          this.seenMessageIds = new Set(ids.slice(-1000));
        }
        this.emit('message', {
          id: msg.id,
          sender: msg.sender,
          senderName: msg.senderName,
          content: msg.content,
          messageType: msg.messageType,
          replyToId: msg.replyToId,
          timestamp: msg.timestamp,
        });
        break;
      }

      case 'history':
        this.emit('history', {
          messages: msg.messages.map((m) => ({
            id: m.id,
            sender: m.sender,
            senderName: m.senderName,
            content: m.content,
            messageType: m.messageType,
            replyToId: m.replyToId,
            timestamp: m.timestamp,
          })),
          hasMore: msg.hasMore,
        });
        // Add to dedup set
        for (const m of msg.messages) {
          this.seenMessageIds.add(m.id);
        }
        break;

      case 'online_count':
        this.emit('online_count', msg.count);
        break;

      case 'error':
        this.emit('error', { code: msg.code, message: msg.message });
        break;

      case 'heartbeat':
        // Server keepalive, no action needed
        break;
    }
  }

  private sendRaw(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendMessage(content: string, replyToId?: number): void {
    this.sendRaw({ type: 'send_message', content, replyToId });
  }

  loadHistory(beforeId?: number, limit?: number): void {
    this.sendRaw({ type: 'load_history', before: beforeId, limit });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(RECONNECT_MULTIPLIER, this.reconnectAttempts),
      RECONNECT_MAX_MS
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token) {
        this.doConnect();
      }
    }, delay);
  }
}
