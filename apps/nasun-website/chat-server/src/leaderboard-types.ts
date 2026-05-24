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
  taker_is_bid: number; // 0 or 1. NOTE: for prediction:* pool_id rows, this stores
                        // MAKER's is_bid (see indexer.ts/prediction_market.move:202).
  is_yes: number | null; // YES side flag for prediction:* fills; NULL for spot.
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
  // Optional: Pado prediction market package. When set, the indexer also
  // ingests `prediction_market::OrderFilled` into trade_fills with pool_id
  // prefixed `prediction:${market_id}` so source can be distinguished without
  // a schema change.
  predictionPackage?: string;
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

export type ScoreScope = 'alltime' | 'weekly';
export const VALID_SCORE_SCOPES = new Set<string>(['alltime', 'weekly']);

// MUST stay in sync with apps/pado/frontend/src/features/leaderboard/types.ts
// (ScoreLeaderboardTrader). The two are duplicated because chat-server runs as
// its own deploy unit. Adding a field here without the frontend side leaves
// `undefined` in the UI; both must change in one commit.
export interface ScoreLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass: boolean;
  profileImageUrl: string | null;
  xHandle: string | null;
  totalScore: number;
  tradeCount: number;
  volumeUsd: string;
  rankChange: number;
  followerCount: number;
  hasGoogle?: boolean;
  hasTelegram?: boolean;
}

export interface ScoreLeaderboardResponse {
  scope: ScoreScope;
  traders: ScoreLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
  weekId?: string;    // present when scope === 'weekly'
  weekStart?: number; // ms timestamp of week start; used by frontend for reset-gap UI
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
    predictionPnl?: number; // present on weekly scope; undefined for alltime (no per-week resolve table)
  };
  rank: number;
  scope: ScoreScope;
}

// Points formula constants
export const POINTS = {
  PER_TRADE: 2,
  PER_500_VOLUME: 1,             // per $500 NUSDC volume in the linear region (≤ VOLUME_LINEAR_SOFT_CAP_USD)
  VOLUME_LINEAR_SOFT_CAP_USD: 1_000_000, // below this volume, score grows linearly (1pt/$500)
  VOLUME_LOG_K: 4_000,           // above the soft cap, score grows as K · log10(vol / softCap) (lowered 6500→4000 on 2026-05-22 to reduce whale volume dominance)
  WEEKLY_VOLUME_SCORE_CAP: 10_000, // hard ceiling on volume score (lowered 15000→10000 same date to dampen volume-only top-10 entries)
  PER_UNIQUE_POOL: 15,           // per unique pool traded
  FIRST_TRADE_BONUS: 50,         // one-time bonus for first trade
  DAILY_TRADE_CAP: 24,           // max trades counted per day toward trade points
  PER_10_PNL: 2,                 // per $10 realized profit (raised 1→2 on 2026-05-22 to weight absolute profit modestly higher; option A tuning)
  PER_5PCT_RETURN: 60,           // per 5% return rate (lowered 100→60 same date to moderate small-capital high-% leaderboard dominance; option A tuning)
  PNL_PERCENT_SCORE_CAP: 150,    // cap on pnlPercent used for percent-return scoring (prevents low-capital pump-and-dump from dominating; 2026-05-24, lowered 200→150 same day)
  // Tiered loss penalty: applied to pnl score (floor 0). Highest matching tier wins.
  LOSS_PENALTY_TIERS: [
    { threshold: -20, penalty: 20 },
    { threshold: -15, penalty: 15 },
    { threshold: -10, penalty: 10 },
    { threshold: -5,  penalty: 5  },
  ],
  // Prediction-market loss penalty: amount-based (not percent), per-market accumulating.
  // Percent-based penalty is unusable here because binary outcomes produce -100% on
  // nearly every loss, flattening any tier. Only activates when weekly net realized
  // prediction PnL is negative (Hybrid A+B: per-market amount tier × net-negative gate).
  // Penalty values are half of LOSS_PENALTY_TIERS — prediction is high-variance by design,
  // discouraging it too hard would dry up market liquidity.
  PREDICTION_LOSS_PENALTY_TIERS_USD: [
    { lossUsdAtLeast: 10_000, penalty: 20 },
    { lossUsdAtLeast:  2_000, penalty: 10 },
    { lossUsdAtLeast:    500, penalty:  5 },
    { lossUsdAtLeast:    100, penalty:  2 },
  ],
  WEEKLY_PREDICTION_LOSS_PENALTY_CAP: 100, // weekly max prediction loss penalty (spot has implicit single-tier max ~20)
  WEEKLY_PREDICTION_GAIN_SCORE_CAP: 2_400, // weekly max prediction gain score (= 30 markets × 80pt cap; symmetric to loss cap scale)
  PREDICTION_MARKET_GAIN_CAP_USD: 800,     // per-market net gain ceiling for PnL scoring (long-shot single-hit suppression; 80pt at $10/pt)
  WEEKLY_SPOT_PNL_SCORE_CAP: 30_000,       // weekly max spot PnL score (prevents whale single-trade dominance; ~$300k profit ceiling)
} as const;

// Known bot wallet addresses - always excluded from leaderboards and points.
//
// Additional bot addresses can be supplied at deploy time via the
// `INDEXER_EXCLUDED_ADDRESSES` env var (comma-separated). Use the env path for
// rotating bot wallets (e.g. prediction LP bot per-market) so binary releases
// stay stable.
export const KNOWN_BOT_ADDRESSES: readonly string[] = [
  // Prod LP bot (common wallet, NBTC/NETH/NSOL)
  '0x9c8ef05cf0ec7a06a5019d01b8cf411ab0c749274182d36f6e714785af92b732',
  // Prod LP bot (main LP_PRIVATE_KEY wallet)
  '0x6d33f7d624da24c82ec46ac62a431135dfc4a8c26542a05efcd499890e4e28bc',
  // Prod TPSL Keeper
  '0x74a7daf4b88ce870e4c0f05350f6907621a923e728ff027f04cef6fc73de4d24',
  // Staging LP bot
  '0x69377697cebb6a6a748b9a5492de51b2d0f67413551d87f62cc17899432952cd',
  // Prediction-market LP bots: add their addresses here (or via the
  // INDEXER_EXCLUDED_ADDRESSES env var) once the bot wallets are provisioned.
  // Without this, bot↔bot self-matches inflate volume_count / unique_pools for
  // the few real users whose orders match against bot quotes.
];

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

// Pado prediction market: prediction_market::OrderFilled
// Distinct from DeepBook's OrderFilled — direct address fields (no balance
// manager indirection). `cost` is in NUSDC raw (6 decimals), matching DeepBook
// quote_quantity unit. `fill_shares` is share count and is NOT comparable to
// DeepBook base_quantity in absolute terms (different decimals); aggregator
// must isolate prediction pools via `pool_id LIKE 'prediction:%'`.
export interface PredictionOrderFilledParsedJson {
  market_id: string;
  order_id: string;
  maker: string;
  taker: string;
  is_yes: boolean;
  is_bid: boolean;
  price: string;
  fill_shares: string;
  cost: string;
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
