import type { WebSocket } from 'ws';

// ===== Protocol Messages (Client -> Server) =====

export interface AuthResponseMessage {
  type: 'auth_response';
  signature: string;
  address: string;
  authMethod?: 'personal_sign' | 'ephemeral';
  ephemeralPubKey?: string;
  displayName?: string;
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

export interface SetNicknamePayload {
  type: 'set_nickname';
  nickname: string;
}

export interface CheckNicknamePayload {
  type: 'check_nickname';
  nickname: string;
}

export interface ClearNicknamePayload {
  type: 'clear_nickname';
}

export interface ToggleFollowPayload {
  type: 'toggle_follow';
  target: string;
}

export interface GetFollowingPayload {
  type: 'get_following';
}

export type ClientMessage =
  | AuthResponseMessage
  | SendMessagePayload
  | LoadHistoryPayload
  | ListRoomsPayload
  | ToggleReactionPayload
  | SetNicknamePayload
  | CheckNicknamePayload
  | ClearNicknamePayload
  | ToggleFollowPayload
  | GetFollowingPayload;

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
  displayName: string | null;
  nickname: string | null;
  rateLimit?: NicknameRateLimit;
  sessionToken?: string;
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
  senderNickname: string | null;
  senderBadge?: string | null;
  senderProfileImageUrl?: string | null;
  content: string;
  messageType: 'text' | 'system' | 'reply';
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
  category: 'language' | 'market';
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

export interface FollowResultPayload {
  type: 'follow_result';
  target: string;
  following: boolean;
  followerCount: number;
  error?: string;
}

export interface FollowingListPayload {
  type: 'following_list';
  addresses: string[];
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
  | ReactionUpdatePayload
  | NicknameResultMessage
  | NicknameCheckMessage
  | FollowResultPayload
  | FollowingListPayload;

// ===== Internal Types =====

export interface AuthenticatedClient {
  ws: WebSocket;
  address: string;       // walletAddress
  displayName: string;   // resolved or shortened address
  profileImageUrl: string | null;
  connectedAt: number;
  lastMessageAt: number;
  hasGenesisPass: boolean;
}

export interface StoredMessage {
  id: number;
  roomId: number;
  sender: string;        // walletAddress
  senderName: string;
  content: string;
  messageType: 'text' | 'system' | 'reply';
  replyToId: number | null;
  timestamp: number;
}

// Room definitions
// Language rooms: 0-99, Market rooms: 100+
export const ROOMS: RoomInfo[] = [
  { id: 0, name: 'Global', category: 'language' },
  { id: 1, name: 'Korean', category: 'language' },
  { id: 2, name: 'Vietnamese', category: 'language' },
  { id: 100, name: 'Pado', category: 'market' },
  { id: 101, name: 'NBTC', category: 'market' },
  { id: 102, name: 'NSN', category: 'market' },
  { id: 103, name: 'NETH', category: 'market' },
  { id: 104, name: 'NSOL', category: 'market' },
];

export const VALID_ROOM_IDS = new Set(ROOMS.map((r) => r.id));

// Reaction whitelist
export const REACTION_CODES = ['thumbsup', 'fire', 'rocket', 'gem', 'heart', 'smile', 'grin', 'laugh', 'sob', 'clap', 'eyes', 'hundred', 'thinking', 'whale', 'wave'] as const;
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
  genesisPassApiUrl: string;
  trustProxy: boolean;
  // Leaderboard indexer (enabled when deepbookPackage is set)
  leaderboardDbPath: string;
  deepbookPackage: string;
  rpcUrl: string;
  indexerPollIntervalMs: number;
  aggregationIntervalMs: number;
  excludedAddresses: string[];
  // Competition admin
  competitionAdminKey: string;
  // Large trade broadcast threshold (NUSDC, min 100)
  largeTradeThresholdNusdc: number;
  // Order event retention
  orderEventRetentionDays: number;
}

export const DEFAULT_CONFIG: ChatServerConfig = {
  port: parseInt(process.env.PORT || '3101', 10),
  maxMessageLength: 500,
  maxWsMessageBytes: 10 * 1024, // 10KB
  rateLimitMs: 500,
  historyRateLimitMs: 2000,
  maxConnectionsPerIp: parseInt(process.env.MAX_CONNECTIONS_PER_IP || '30', 10),
  authTimeoutMs: 30_000,
  maxSessionMs: 24 * 60 * 60 * 1000, // 24 hours
  dbPath: process.env.CHAT_DB_PATH || './data/chat.db',
  messageRetentionDays: 30,
  retentionCleanupIntervalMs: 24 * 60 * 60 * 1000, // Daily
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5174').split(','),
  nasunProfileApiUrl: process.env.NASUN_PROFILE_API_URL || '',
  genesisPassApiUrl: process.env.GENESIS_PASS_API_URL || '',
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Leaderboard indexer
  leaderboardDbPath: process.env.LEADERBOARD_DB_PATH || './data/leaderboard.db',
  deepbookPackage: process.env.DEEPBOOK_PACKAGE || '',
  rpcUrl: process.env.RPC_URL || 'https://rpc.devnet.nasun.io',
  indexerPollIntervalMs: parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10),
  aggregationIntervalMs: parseInt(process.env.AGGREGATION_INTERVAL_MS || '60000', 10),
  excludedAddresses: (process.env.INDEXER_EXCLUDED_ADDRESSES || '').split(',').filter(Boolean),
  // Competition admin
  competitionAdminKey: process.env.COMPETITION_ADMIN_KEY || '',
  largeTradeThresholdNusdc: Math.max(parseInt(process.env.LARGE_TRADE_THRESHOLD_NUSDC || '1000', 10), 100),
  orderEventRetentionDays: parseInt(process.env.ORDER_EVENT_RETENTION_DAYS || '3', 10),
};
