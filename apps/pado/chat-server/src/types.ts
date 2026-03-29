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

export interface SetNicknamePayload {
  type: 'set_nickname';
  nickname: string;
}

export interface CheckNicknamePayload {
  type: 'check_nickname';
  nickname: string;
}

export interface ListRoomsPayload {
  type: 'list_rooms';
}

export type ClientMessage =
  | AuthResponseMessage
  | SendMessagePayload
  | LoadHistoryPayload
  | SetNicknamePayload
  | CheckNicknamePayload
  | ListRoomsPayload;

// ===== Protocol Messages (Server -> Client) =====

export interface AuthChallengeMessage {
  type: 'auth_challenge';
  challenge: string;
}

export interface NicknameRateLimit {
  canChange: boolean;
  changesRemaining: number;
  lockedUntil: number | null; // epoch ms
}

export interface AuthSuccessMessage {
  type: 'auth_success';
  address: string;
  nickname: string | null;
  rateLimit?: NicknameRateLimit;
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
  senderNickname: string | null;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
}

export interface HistoryPayload {
  type: 'history';
  roomId: number;
  messages: ChatMessagePayload[];
  hasMore: boolean;
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

export interface NicknameResultMessage {
  type: 'nickname_result';
  ok: boolean;
  nickname?: string;
  error?: string;
  rateLimit?: NicknameRateLimit;
}

export interface NicknameCheckMessage {
  type: 'nickname_check';
  available: boolean;
  nickname: string;
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
  | NicknameResultMessage
  | NicknameCheckMessage
  | HeartbeatMessage
  | RoomsListPayload;

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
  orderEventRetentionDays: number;
  retentionCleanupIntervalMs: number;
  allowedOrigins: string[];
  // Leaderboard indexer
  leaderboardDbPath: string;
  deepbookPackage: string;
  rpcUrl: string;
  indexerPollIntervalMs: number;
  aggregationIntervalMs: number;
  excludedAddresses: string[];
  // Competitions
  competitionAdminKey: string;
  // Large trade broadcast
  largeTradeThresholdNusdc: number;
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
  messageRetentionDays: 5,
  orderEventRetentionDays: parseInt(process.env.ORDER_EVENT_RETENTION_DAYS || '3', 10),
  retentionCleanupIntervalMs: 24 * 60 * 60 * 1000, // Daily
  allowedOrigins: (process.env.CHAT_ALLOWED_ORIGINS || 'https://pado.finance,https://staging.pado.finance,http://localhost:5176').split(','),
  // Leaderboard indexer
  leaderboardDbPath: process.env.LEADERBOARD_DB_PATH || './data/leaderboard.db',
  deepbookPackage: process.env.DEEPBOOK_PACKAGE || '',
  rpcUrl: process.env.RPC_URL || 'https://rpc.devnet.nasun.io',
  indexerPollIntervalMs: parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10),
  aggregationIntervalMs: parseInt(process.env.AGGREGATION_INTERVAL_MS || '60000', 10),
  excludedAddresses: (process.env.INDEXER_EXCLUDED_ADDRESSES || '').split(',').filter(Boolean),
  // Competitions
  competitionAdminKey: process.env.COMPETITION_ADMIN_KEY || '',
  largeTradeThresholdNusdc: Math.max(parseInt(process.env.LARGE_TRADE_THRESHOLD_NUSDC || '1000', 10), 100),
};
