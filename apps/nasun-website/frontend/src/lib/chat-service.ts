/**
 * ChatService - WebSocket chat client for nasun-website
 *
 * Singleton pattern. Manages connection, wallet signature auth, message handling.
 * Pushes events to Zustand chatStore via listeners.
 */

// Callback that signs a challenge message and returns signature data
export type ChatSignResult = {
  signature: string;
  address: string;
  authMethod?: 'personal_sign' | 'ephemeral';
  ephemeralPubKey?: string;
  displayName?: string;
};
export type ChatSignFn = (challenge: string) => Promise<ChatSignResult>;

// ===== Protocol types (mirror server types) =====

interface AuthChallengeMsg { type: 'auth_challenge'; challenge: string }
export interface NicknameRateLimit {
  canChange: boolean;
  changesRemaining: number;
  lockedUntil: number | null; // epoch ms
}
interface AuthSuccessMsg { type: 'auth_success'; address: string; displayName: string | null; nickname: string | null; rateLimit?: NicknameRateLimit; sessionToken?: string }
interface AuthErrorMsg { type: 'auth_error'; reason: string }
interface ChatMessageMsg {
  type: 'chat_message';
  id: number;
  roomId: number;
  sender: string;
  senderName: string;
  senderNickname: string | null;
  senderBadge?: string | null;
  senderProfileImageUrl?: string | null;
  content: string;
  messageType: 'text' | 'system';
  replyToId: number | null;
  timestamp: number;
  reactions?: Record<string, number>;
  myReaction?: string | null;
}
interface ReactionUpdateMsg {
  type: 'reaction_update';
  messageId: number;
  roomId: number;
  reactions: Record<string, number>;
  myReaction: string | null;
}
interface HistoryMsg {
  type: 'history';
  roomId: number;
  messages: ChatMessageMsg[];
  hasMore: boolean;
}
interface RoomsListMsg { type: 'rooms_list'; rooms: { id: number; name: string }[] }
interface OnlineCountMsg { type: 'online_count'; count: number }
interface ErrorMsg { type: 'error'; code: string; message: string }
interface HeartbeatMsg { type: 'heartbeat' }
interface NicknameResultMsg { type: 'nickname_result'; ok: boolean; nickname?: string; error?: string; rateLimit?: NicknameRateLimit }
interface NicknameCheckMsg { type: 'nickname_check'; available: boolean; nickname: string }
interface FollowResultMsg { type: 'follow_result'; target: string; following: boolean; followerCount: number; error?: string }
interface FollowingListMsg { type: 'following_list'; addresses: string[] }

type ServerMessage =
  | AuthChallengeMsg | AuthSuccessMsg | AuthErrorMsg
  | ChatMessageMsg | HistoryMsg | RoomsListMsg | ReactionUpdateMsg | OnlineCountMsg | ErrorMsg | HeartbeatMsg
  | NicknameResultMsg | NicknameCheckMsg | FollowResultMsg | FollowingListMsg;

// ===== Public types =====

export interface ChatMessage {
  id: number;
  roomId: number;
  sender: string;
  senderName: string;
  senderNickname?: string | null;
  senderBadge?: string | null;
  senderProfileImageUrl?: string | null;
  content: string;
  messageType: 'text' | 'system';
  replyToId: number | null;
  timestamp: number;
  reactions?: Record<string, number>;
  myReaction?: string | null;
}

export interface RoomInfo {
  id: number;
  name: string;
  category?: 'language' | 'market';
}

export type ChatConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type ChatEventType = 'message' | 'history' | 'status' | 'online_count' | 'error' | 'rooms_list' | 'reaction_update' | 'nickname' | 'nickname_check' | 'follow_result' | 'following_list' | 'captcha_required';

export interface ChatEventMap {
  message: ChatMessage;
  history: { roomId: number; messages: ChatMessage[]; hasMore: boolean };
  status: ChatConnectionStatus;
  online_count: number;
  error: { code: string; message: string };
  rooms_list: RoomInfo[];
  reaction_update: { messageId: number; roomId: number; reactions: Record<string, number>; myReaction: string | null };
  nickname: { ok: boolean; nickname?: string; error?: string; rateLimit?: NicknameRateLimit };
  nickname_check: { available: boolean; nickname: string };
  follow_result: { target: string; following: boolean; followerCount: number; error?: string };
  following_list: { addresses: string[] };
  captcha_required: undefined;
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
  private signFn: ChatSignFn | null = null;
  private wsUrl: string = '';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Map<ChatEventType, Set<ChatListener<ChatEventType>>>();
  private seenMessageIds = new Set<number>();
  private currentNickname: string | null = null;
  private currentRateLimit: NicknameRateLimit | null = null;
  private pendingTurnstileToken: string | null = null;
  private captchaRequired = false;
  // Once a Turnstile token has been used, every subsequent reconnect needs a fresh one.
  // Without this flag we would silently send an empty token on reconnect and only learn
  // the token is missing after the server rejects the auth.
  private turnstileEverUsed = false;

  setTurnstileToken(token: string): void {
    this.pendingTurnstileToken = token;
    this.captchaRequired = false;
  }

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

  connect(wsUrl: string, signFn: ChatSignFn): void {
    // Always refresh wsUrl/signFn so the next challenge uses the latest signer
    this.wsUrl = wsUrl;
    this.signFn = signFn;
    // If already connected, do nothing further — signFn is now up to date for future challenges
    if (this.ws && this.status === 'connected') {
      return;
    }
    // Clear any pending reconnect before starting a fresh connection
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // NOTE: do not reset reconnectAttempts here. Resetting on every connect() call would
    // let React effect churn defeat the exponential backoff. Counter is reset only on
    // successful auth (auth_success) or explicit disconnect().
    this.doConnect();
  }

  disconnect(): void {
    this.reconnectAttempts = 0;
    this.captchaRequired = false;
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
        // Don't auto-reconnect when captcha is required — wait for new token
        if (!this.captchaRequired) {
          this.scheduleReconnect();
        }
      }
    };

    this.ws.onerror = () => {};
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'auth_challenge':
        if (!this.signFn) {
          this.emit('error', { code: 'NO_SIGNER', message: 'No wallet signer available' });
          this.ws?.close();
          break;
        }
        const turnstileToken = this.pendingTurnstileToken ?? undefined;
        this.pendingTurnstileToken = null;
        // If Turnstile was used before but no fresh token is pending (typical on
        // reconnect after server restart or transient drop), don't send an empty
        // auth_response. Trigger widget remount through captcha_required instead.
        if (this.turnstileEverUsed && !turnstileToken) {
          this.captchaRequired = true;
          this.emit('captcha_required', undefined);
          this.ws?.close(4403, 'Captcha refresh');
          break;
        }
        if (turnstileToken) this.turnstileEverUsed = true;
        this.signFn(msg.challenge)
          .then(({ signature, address, authMethod, ephemeralPubKey, displayName }) => {
            this.sendRaw({ type: 'auth_response', signature, address, authMethod, ephemeralPubKey, displayName, turnstileToken });
          })
          .catch((err) => {
            console.error('Chat sign error:', err);
            this.emit('error', { code: 'SIGN_ERROR', message: 'Failed to sign challenge' });
            this.ws?.close();
          });
        break;

      case 'auth_success':
        this.reconnectAttempts = 0;
        this.currentNickname = msg.nickname ?? null;
        if (msg.rateLimit) this.currentRateLimit = msg.rateLimit;
        this.setStatus('connected');
        this.emit('nickname', { ok: true, nickname: msg.nickname ?? undefined, rateLimit: msg.rateLimit });
        break;

      case 'auth_error':
        console.warn('Chat auth error:', msg.reason);
        if (msg.reason === 'Captcha required' || msg.reason === 'Captcha verification failed') {
          this.captchaRequired = true;
          this.emit('captcha_required', undefined);
        }
        this.emit('error', { code: 'AUTH_ERROR', message: msg.reason });
        this.ws?.close();
        this.ws = null;
        this.setStatus('disconnected');
        break;

      case 'rooms_list':
        this.emit('rooms_list', msg.rooms);
        break;

      case 'reaction_update':
        this.emit('reaction_update', { messageId: msg.messageId, roomId: msg.roomId, reactions: msg.reactions, myReaction: msg.myReaction });
        break;

      case 'chat_message': {
        if (this.seenMessageIds.has(msg.id)) return;
        this.seenMessageIds.add(msg.id);
        if (this.seenMessageIds.size > 2000) {
          const ids = Array.from(this.seenMessageIds);
          this.seenMessageIds = new Set(ids.slice(-1000));
        }
        this.emit('message', {
          id: msg.id,
          roomId: msg.roomId,
          sender: msg.sender,
          senderName: msg.senderName,
          senderNickname: msg.senderNickname,
          senderBadge: msg.senderBadge,
          senderProfileImageUrl: msg.senderProfileImageUrl,
          content: msg.content,
          messageType: msg.messageType,
          replyToId: msg.replyToId,
          timestamp: msg.timestamp,
        });
        break;
      }

      case 'history':
        this.emit('history', {
          roomId: msg.roomId,
          messages: msg.messages.map((m) => ({
            id: m.id,
            roomId: m.roomId,
            sender: m.sender,
            senderName: m.senderName,
            senderNickname: m.senderNickname,
            senderBadge: m.senderBadge,
            senderProfileImageUrl: m.senderProfileImageUrl,
            content: m.content,
            messageType: m.messageType,
            replyToId: m.replyToId,
            timestamp: m.timestamp,
            reactions: m.reactions,
            myReaction: m.myReaction,
          })),
          hasMore: msg.hasMore,
        });
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

      case 'nickname_result':
        if (msg.ok) this.currentNickname = msg.nickname ?? null;
        if (msg.rateLimit) this.currentRateLimit = msg.rateLimit;
        this.emit('nickname', { ok: msg.ok, nickname: msg.nickname, error: msg.error, rateLimit: msg.rateLimit });
        break;

      case 'nickname_check':
        this.emit('nickname_check', { available: msg.available, nickname: msg.nickname });
        break;

      case 'follow_result':
        this.emit('follow_result', { target: msg.target, following: msg.following, followerCount: msg.followerCount, error: msg.error });
        break;

      case 'following_list':
        this.emit('following_list', { addresses: msg.addresses });
        break;

      case 'heartbeat':
        break;
    }
  }

  private sendRaw(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  getNickname(): string | null { return this.currentNickname; }
  getRateLimit(): NicknameRateLimit | null { return this.currentRateLimit; }

  toggleReaction(messageId: number, emojiCode: string): void {
    this.sendRaw({ type: 'toggle_reaction', messageId, emojiCode });
  }

  sendMessage(content: string, roomId: number = 0, replyToId?: number): void {
    this.sendRaw({ type: 'send_message', content, roomId, replyToId });
  }

  loadHistory(roomId: number = 0, beforeId?: number, limit?: number): void {
    this.sendRaw({ type: 'load_history', roomId, before: beforeId, limit });
  }

  setNickname(nickname: string): void {
    this.sendRaw({ type: 'set_nickname', nickname });
  }

  checkNickname(nickname: string): void {
    this.sendRaw({ type: 'check_nickname', nickname });
  }

  clearNickname(): void {
    this.sendRaw({ type: 'clear_nickname' });
  }

  toggleFollow(target: string): void {
    this.sendRaw({ type: 'toggle_follow', target });
  }

  getFollowing(): void {
    this.sendRaw({ type: 'get_following' });
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
      if (this.signFn) {
        this.doConnect();
      }
    }, delay);
  }
}
