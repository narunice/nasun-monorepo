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

export type ClientMessage = AuthResponseMessage | SendMessagePayload | LoadHistoryPayload;

// ===== Protocol Messages (Server -> Client) =====

export interface AuthChallengeMessage {
  type: 'auth_challenge';
  challenge: string;
}

export interface AuthSuccessMessage {
  type: 'auth_success';
  address: string;
}

export interface AuthErrorMessage {
  type: 'auth_error';
  reason: string;
}

export interface ChatMessagePayload {
  type: 'chat_message';
  id: number;
  roomId: number;
  sender: string;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
}

export interface HistoryPayload {
  type: 'history';
  messages: ChatMessagePayload[];
  hasMore: boolean;
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

export type ServerMessage =
  | AuthChallengeMessage
  | AuthSuccessMessage
  | AuthErrorMessage
  | ChatMessagePayload
  | HistoryPayload
  | OnlineCountPayload
  | ErrorPayload;

// ===== Internal Types =====

export interface AuthenticatedClient {
  ws: WebSocket;
  address: string;
  connectedAt: number;
  lastMessageAt: number;
}

export interface RoomInfo {
  id: number;
  name: string;
  description: string;
}

export interface StoredMessage {
  id: number;
  roomId: number;
  sender: string;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
}

// ===== Config =====

export interface ChatServerConfig {
  port: number;
  maxMessageLength: number;
  maxWsMessageBytes: number;
  rateLimitMs: number;
  historyRateLimitMs: number;
  maxConnectionsPerIp: number;
  authTimeoutMs: number;
  dbPath: string;
  messageRetentionDays: number;
  retentionCleanupIntervalMs: number;
  allowedOrigins: string[];
}

export const DEFAULT_CONFIG: ChatServerConfig = {
  port: parseInt(process.env.CHAT_PORT || '3100', 10),
  maxMessageLength: 500,
  maxWsMessageBytes: 10 * 1024, // 10KB
  rateLimitMs: 1000,
  historyRateLimitMs: 2000,
  maxConnectionsPerIp: 5,
  authTimeoutMs: 30_000,
  dbPath: process.env.CHAT_DB_PATH || './data/chat.db',
  messageRetentionDays: 90,
  retentionCleanupIntervalMs: 24 * 60 * 60 * 1000, // Daily
  allowedOrigins: (process.env.CHAT_ALLOWED_ORIGINS || 'https://pado.nasun.io,http://localhost:5176').split(','),
};
