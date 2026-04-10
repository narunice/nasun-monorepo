import type { WebSocket } from 'ws';

// ===== Protocol Messages (Client -> Server) =====

export interface AuthResponseMessage {
  type: 'auth_response';
  signature: string;
  address: string;
  authMethod?: 'personal_sign' | 'ephemeral';
  ephemeralPubKey?: string;
}

export interface SendMessagePayload {
  type: 'send_message';
  content: string;
  roomId?: number;
  replyToId?: number;
}

export interface LoadHistoryPayload {
  type: 'load_history';
  roomId?: number;
  before?: number; // message ID cursor
  limit?: number;
}

export interface ListRoomsPayload {
  type: 'list_rooms';
}

export interface ToggleReactionPayload {
  type: 'toggle_reaction';
  messageId: number;
  emojiCode: string;
}

export type ClientMessage =
  | AuthResponseMessage
  | SendMessagePayload
  | LoadHistoryPayload
  | ListRoomsPayload
  | ToggleReactionPayload;

// ===== Protocol Messages (Server -> Client) =====

export interface AuthChallengeMessage {
  type: 'auth_challenge';
  challenge: string;
}

export interface AuthSuccessMessage {
  type: 'auth_success';
  address: string;
  displayName: string | null;
}

export interface AuthErrorMessage {
  type: 'auth_error';
  reason: string;
}

export interface ChatMessagePayload {
  type: 'chat_message';
  id: number;
  roomId: number;
  sender: string;       // walletAddress
  senderName: string;   // display name or shortened address
  content: string;
  messageType: 'text' | 'system';
  replyToId: number | null;
  timestamp: number;
  reactions?: Record<string, number>;
  myReaction?: string | null;
}

export interface ReactionUpdatePayload {
  type: 'reaction_update';
  messageId: number;
  roomId: number;
  reactions: Record<string, number>;
  myReaction: string | null;
}

export interface HistoryPayload {
  type: 'history';
  roomId: number;
  messages: ChatMessagePayload[];
  hasMore: boolean;
}

export interface RoomInfo {
  id: number;
  name: string;
}

export interface RoomsListPayload {
  type: 'rooms_list';
  rooms: RoomInfo[];
}

export interface OnlineCountPayload {
  type: 'online_count';
  count: number;
}

export interface ErrorPayload {
  type: 'error';
  code: string;
  message: string;
}

export interface HeartbeatMessage {
  type: 'heartbeat';
}

export type ServerMessage =
  | AuthChallengeMessage
  | AuthSuccessMessage
  | AuthErrorMessage
  | ChatMessagePayload
  | HistoryPayload
  | OnlineCountPayload
  | ErrorPayload
  | HeartbeatMessage
  | RoomsListPayload
  | ReactionUpdatePayload;

// ===== Internal Types =====

export interface AuthenticatedClient {
  ws: WebSocket;
  address: string;       // walletAddress
  displayName: string;   // resolved or shortened address
  connectedAt: number;
  lastMessageAt: number;
}

export interface StoredMessage {
  id: number;
  roomId: number;
  sender: string;        // walletAddress
  senderName: string;
  content: string;
  messageType: 'text' | 'system';
  replyToId: number | null;
  timestamp: number;
}

// Room definitions
export const ROOMS: RoomInfo[] = [
  { id: 0, name: 'Global' },
  { id: 1, name: 'Korean' },
];

export const VALID_ROOM_IDS = new Set(ROOMS.map((r) => r.id));

// Reaction whitelist
export const REACTION_CODES = ['thumbsup', 'fire', 'rocket', 'gem', 'heart', 'smile', 'grin', 'laugh', 'sob', 'clap', 'eyes', 'hundred', 'thinking', 'whale'] as const;
export type ReactionCode = typeof REACTION_CODES[number];
export const VALID_REACTION_CODES = new Set<string>(REACTION_CODES);

// ===== Config =====

export interface ChatServerConfig {
  port: number;
  maxMessageLength: number;
  maxWsMessageBytes: number;
  rateLimitMs: number;
  historyRateLimitMs: number;
  maxConnectionsPerIp: number;
  authTimeoutMs: number;
  maxSessionMs: number;
  dbPath: string;
  messageRetentionDays: number;
  retentionCleanupIntervalMs: number;
  allowedOrigins: string[];
  nasunProfileApiUrl: string;
  trustProxy: boolean;
}

export const DEFAULT_CONFIG: ChatServerConfig = {
  port: parseInt(process.env.PORT || '3101', 10),
  maxMessageLength: 500,
  maxWsMessageBytes: 10 * 1024, // 10KB
  rateLimitMs: 500,
  historyRateLimitMs: 2000,
  maxConnectionsPerIp: 5,
  authTimeoutMs: 30_000,
  maxSessionMs: 24 * 60 * 60 * 1000, // 24 hours
  dbPath: process.env.CHAT_DB_PATH || './data/chat.db',
  messageRetentionDays: 30,
  retentionCleanupIntervalMs: 24 * 60 * 60 * 1000, // Daily
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5174').split(','),
  nasunProfileApiUrl: process.env.NASUN_PROFILE_API_URL || '',
  trustProxy: process.env.TRUST_PROXY === 'true',
};
