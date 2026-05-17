/**
 * Response shapes for the gostop Tier 0 backend.
 *
 * Backend NUMERIC(30,0) columns (total_bet/total_payout/net_pnl/biggest_win/
 * bet_amount/payout) come back as decimal strings. The frontend keeps them
 * as strings end-to-end and formats with the USDC 6-decimal helper at the
 * render boundary; converting to JS number would truncate large positions.
 */

export type StatsPeriod = '24h' | '7d' | '30d' | 'all';
export type FeedVisibility = 'public' | 'anonymous' | 'delayed' | 'opt-out';

export interface NftHealth {
  alliance: number | null;
  genesis_pass: number | null;
}

export interface MeProfile {
  wallet: string;
  ecosystem_points: number;
  last_snapshot_date: string | null;
  nft_health: NftHealth | null;
  total_rounds: number;
  total_bet: string;
  total_payout: string;
  net_pnl: string;
  first_played_ms: number | null;
  last_played_ms: number | null;
  // Nasun identity fields — null when explorer-api is unavailable or wallet unregistered
  display_name: string | null;
  x_handle: string | null;
  profile_image_url: string | null;
  generated_at: number;
}

export interface RecentRound {
  game_id: number;
  key: string;
  session_id_hex: string;
  bet_amount: string;
  payout: string;
  multiplier_bps: number;
  timestamp_ms: number;
  status: string;
  tx_digest: string;
}

export interface MeRecentRounds {
  limit: number;
  rounds: RecentRound[];
  generated_at: number;
}

export interface StatsByGame {
  game_id: number;
  key: string;
  rounds: number;
  net_pnl: string;
}

export interface MeStats {
  period: StatsPeriod;
  rounds: number;
  total_bet: string;
  total_payout: string;
  net_pnl: string;
  win_rate_bps: number;
  biggest_win: string;
  by_game: StatsByGame[];
  generated_at: number;
}

export interface MeSettings {
  feed_visibility: FeedVisibility;
  updated_at: string | null;
}

export interface ScoreHistoryEntry {
  snapshot_date: string;
  all_time_score: number;
  base_score: number;
  multiplier_v2: number;
  alliance_health: number;
  gp_health: number;
}

export interface MeEcosystem {
  wallet: string;
  identity_id: string | null;
  ecosystem_points: number;
  last_snapshot_date: string | null;
  nft_health: NftHealth | null;
  active_missions: string[];
  score_history: ScoreHistoryEntry[];
  generated_at: number;
}

export interface LeaderboardRankRow {
  player: string;
  rank: number;
  metric_value: string;
  rounds: number;
  net_pnl: string;
  volume: string;
}

export interface MeLeaderboardRank {
  period: string;
  game: string | number;
  metric: string;
  row: LeaderboardRankRow | null;
}

// GET /api/gostop/leaderboard query/response.
// `game` matches the backend GameFilter enum: 'all' | 1..6.
export type LeaderboardPeriod = '24h' | '7d' | '30d' | 'all';
export type LeaderboardGame = 'all' | 1 | 2 | 3 | 4 | 5 | 6;
export type LeaderboardMetric = 'net_pnl' | 'volume' | 'rounds';

export interface LeaderboardRow {
  rank: number;
  player: string;
  rounds: number;
  total_bet: string;
  total_payout: string;
  net_pnl: string;
  last_played_ms: number | null;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  game: LeaderboardGame;
  metric: LeaderboardMetric;
  limit: number;
  rows: LeaderboardRow[];
  generated_at: number;
}

export interface StreakSummary {
  player: string;
  // null = no streak (no rounds yet, or most recent round was a push).
  kind: 'win' | 'loss' | null;
  length: number;
  started_ts_ms: number | null;
  generated_at: number;
}

export interface GameTransparency {
  game_id: number;
  key: string;
  rtp_bps: number;
  house_pnl_raw: string;
  commit_proof_count: number;
}

export interface TransparencyResponse {
  games: GameTransparency[];
  generated_at: number;
}

export interface LotteryDraw {
  round_number: number;
  draw_time_ms: number | null;
  drawn_numbers: number[];
  drawn_at_ms: number | null;
  tier1_winners: number;
  tier2_winners: number;
  tier3_winners: number;
  tier1_payout: string;
  tier2_payout: string;
  tier3_payout: string;
  treasury_amount: string;
  claim_deadline_ms: number | null;
  fully_claimed_at_ms: number | null;
  draw_tx_digest: string | null;
}

export interface LotteryDrawsResponse {
  draws: LotteryDraw[];
  limit: number;
  generated_at: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Round replay (GET /api/gostop/round/:game/:session_id)
// ──────────────────────────────────────────────────────────────────────────

export type GameKey = 'lottery' | 'scratchcard' | 'numbermatch' | 'crash' | 'mines' | 'wheel';

export interface RoundCore {
  id: number;
  tx_digest: string;
  event_seq: number;
  game_id: number;
  player: string;
  anonymous: boolean;
  bet_amount: string;
  payout: string;
  multiplier_bps: string;
  timestamp_ms: number;
  status: string;
}

export interface LotteryTicketExtra {
  round_number: number;
  ticket_id: string;
  numbers: number[];
  match_count: number | null;
  tier: number | null;
  expected_payout: string;
  claim_tx: string | null;
  claim_ts_ms: number | null;
  claimed_payout: string;
  status: string;
}

export interface LotteryRoundExtra {
  round_number: number;
  drawn_numbers: number[];
  drawn_at_ms: number | null;
  claim_deadline_ms: number | null;
  tier1_payout: string;
  tier2_payout: string;
  tier3_payout: string;
}

export interface CrashRoundExtra {
  round_id: string;
  commit_hash: string | null;
  salt: string | null;
  resolved: boolean;
  resolve_ts_ms: number | null;
  crash_point_bps: string;
  crash_time_ms: number | null;
  total_bet: string;
  total_payout: string;
  cashout_count: number;
  commit_verified: boolean | null;
}

export interface CrashCashout {
  player: string;
  cashout_mul_bps: string;
  cashout_ts_ms: number;
}

export type RoundExtras =
  | { kind: 'lottery'; ticket: LotteryTicketExtra | null; round: LotteryRoundExtra | null }
  | { kind: 'crash'; round: CrashRoundExtra | null; cashouts: CrashCashout[] }
  | { kind: 'generic' };

export interface RoundDetail {
  game: GameKey;
  session_id: string;
  round: RoundCore;
  extras: RoundExtras;
  generated_at: number;
}
