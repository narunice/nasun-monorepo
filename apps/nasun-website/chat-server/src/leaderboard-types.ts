// ===== Leaderboard Types =====

export type Period = '24h' | '7d' | '30d' | 'all';
export type LeaderboardMode = 'volume' | 'pnl';
export const VALID_MODES = new Set<string>(['volume', 'pnl']);

export const PERIOD_MS: Record<Period, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': 0, // no cutoff
};

export const VALID_PERIODS = new Set<string>(['24h', '7d', '30d', 'all']);

// ===== SQLite Row Types =====

export interface TradeFillRow {
  id: number;
  tx_digest: string;
  event_seq: string;
  pool_id: string;
  maker_address: string;
  taker_address: string;
  maker_order_id: string | null;
  taker_order_id: string | null;
  price: string;
  base_quantity: string;
  quote_quantity: string;
  taker_is_bid: number; // 0 or 1
  timestamp_ms: number;
}

export interface TraderStatsRow {
  address: string;
  period: string;
  volume_quote: string;
  trade_count: number;
  unique_pools: number;
  last_trade_at: number;
  rank: number;
  prev_rank: number;
  updated_at: number;
}

export interface TraderPnlStatsRow {
  address: string;
  period: string;
  realized_pnl: string; // raw NUSDC amount (can be negative)
  pnl_percent: number;
  trade_count: number;
  rank: number;
  prev_rank: number;
  updated_at: number;
}

export interface BalanceManagerRow {
  balance_manager_id: string;
  owner_address: string;
  discovered_at: number;
}

export interface IndexerStateRow {
  key: string;
  value: string;
  updated_at: number;
}

// ===== API Response Types =====

export interface LeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass: boolean;
  volumeUsd: string;
  tradeCount: number;
  uniquePools: number;
  rankChange: number;
  lastTradeAt: number;
}

export interface LeaderboardResponse {
  period: Period;
  traders: LeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface TraderPeriodStats {
  rank: number;
  volume: string;
  tradeCount: number;
  uniquePools: number;
  rankChange: number;
}

export interface TraderStatsResponse {
  address: string;
  nickname: string | null;
  hasGenesisPass: boolean;
  stats: Record<Period, TraderPeriodStats | null>;
}

export interface PnlLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass: boolean;
  pnlUsd: string;
  pnlPercent: number;
  tradeCount: number;
  rankChange: number;
}

export interface PnlLeaderboardResponse {
  mode: 'pnl';
  period: Period;
  traders: PnlLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface LeaderboardStatusResponse {
  indexerRunning: boolean;
  lastIndexedAt: number;
  totalFillsIndexed: number;
  totalTradersTracked: number;
}

// ===== Indexer Config =====

export interface LeaderboardConfig {
  leaderboardDbPath: string;
  deepbookPackage: string;
  rpcUrl: string;
  indexerPollIntervalMs: number;
  aggregationIntervalMs: number;
  excludedAddresses: Set<string>;
}

// ===== Competition Types =====

export type CompetitionStatus = 'upcoming' | 'active' | 'ended';

export interface CompetitionRow {
  id: string;
  title: string;
  description: string;
  start_ms: number;
  end_ms: number;
  status: CompetitionStatus;
  prize_description: string;
  min_volume: string;
  created_at: number;
  updated_at: number;
}

export interface CompetitionResultRow {
  competition_id: string;
  address: string;
  volume_quote: string;
  trade_count: number;
  rank: number;
  updated_at: number;
}

// ===== Points Types =====

export interface TraderPointsRow {
  address: string;
  total_points: number;
  points_from_trades: number;
  points_from_volume: number;
  points_from_diversity: number;
  points_from_pnl: number;
  trade_count: number;
  volume_quote: string;
  rank: number;
  prev_rank: number;
  updated_at: number;
}

export interface PointsLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass: boolean;
  totalPoints: number;
  tradeCount: number;
  volumeUsd: string;
  rankChange: number;
}

export interface PointsLeaderboardResponse {
  traders: PointsLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface TraderPointsResponse {
  address: string;
  nickname: string | null;
  totalPoints: number;
  breakdown: {
    trades: number;
    volume: number;
    diversity: number;
    pnl: number;
  };
  rank: number;
}

// ===== Score (pado-specific, /api/pado/leaderboard/score) =====
// Table trader_points is historical name; functional score. DB rename is follow-up.

export type ScoreScope = 'alltime';
export const VALID_SCORE_SCOPES = new Set<string>(['alltime']);

export interface ScoreLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass: boolean;
  totalScore: number;
  tradeCount: number;
  volumeUsd: string;
  rankChange: number;
  followerCount: number;
}

export interface ScoreLeaderboardResponse {
  scope: ScoreScope;
  traders: ScoreLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface TraderScoreResponse {
  address: string;
  nickname: string | null;
  totalScore: number;
  breakdown: {
    trades: number;
    volume: number;
    diversity: number;
    pnl: number;
  };
  rank: number;
  scope: ScoreScope;
}

// Points formula constants
export const POINTS = {
  PER_TRADE: 10,
  PER_1K_VOLUME: 5,        // per $1000 NUSDC volume
  PER_UNIQUE_POOL: 25,     // per unique pool traded
  FIRST_TRADE_BONUS: 100,  // one-time bonus for first trade
  PER_1K_PNL: 20,          // per $1000 realized profit (losses = 0)
  PER_10PCT_RETURN: 15,    // per 10% return rate (negative = 0)
} as const;

// ===== RPC Event Types =====

export interface OrderFilledParsedJson {
  pool_id: string;
  maker_order_id: string;
  taker_order_id: string;
  price: string;
  taker_is_bid: boolean;
  base_quantity: string;
  quote_quantity: string;
  maker_balance_manager_id: string;
  taker_balance_manager_id: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface OrderPlacedParsedJson {
  balance_manager_id: string;
  pool_id: string;
  order_id: string;
  price: string;
  placed_quantity: string;
  is_bid: boolean;
  [key: string]: unknown;
}

export interface OrderCanceledParsedJson {
  balance_manager_id: string;
  pool_id: string;
  order_id: string;
  price: string;
  base_quantity?: string;
  is_bid: boolean;
  [key: string]: unknown;
}

// ===== Order Event Row (for order_events table) =====

export type OrderEventType = 'placed' | 'canceled' | 'filled';

export interface OrderEventRow {
  tx_digest: string;
  event_seq: string;
  event_type: OrderEventType;
  pool_id: string;
  balance_manager_id: string;
  owner_address: string;
  order_id: string;
  price: string;
  quantity: string;
  is_bid: number; // 0 or 1
  timestamp_ms: number;
}

// ===== Market Narrator Types =====

export interface TradeFillData {
  poolId: string;
  price: number;        // USD (converted from 9 decimals)
  baseQuantity: number; // base token amount (converted from 9 decimals)
  quoteQuantity: number; // NUSDC amount (converted from 6 decimals)
  takerIsBid: boolean;
  timestampMs: number;
}
