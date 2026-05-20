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
// '30d' deliberately omitted — backend rejects it (cost ~25x the matview-backed
// 'all' path while returning the same data at current history < 30 days).
export type LeaderboardPeriod = '24h' | '7d' | 'all';
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
  total_bet_raw: string;
  total_payout_raw: string;
  house_pnl_raw: string;
  commit_proof_count: number;
}

export type DataQuality = 'fresh' | 'lagging' | 'unreliable';

export interface BankrollSummary {
  /** Rolling window length in days. UI label. */
  window_days: number;
  /** All amounts are NUSDC base-units (6 decimals), bigint-compatible strings. */
  bets: string;
  payouts: string;
  refunds: string;
  /** bets - payouts - refunds. Excludes treasury inflow (which is capital, not PnL). */
  net_pnl: string;
  treasury_deposits: string;
  /** Subset of treasury_deposits attributable to lottery (cut + sweep, conflated v1). */
  lottery_treasury_inflow: string;
  /**
   * Raw share_price_scaled from chain. Divide by 1e9 for display.
   * 1e9 = 1.0 pps. Pre-seed pools also return 1e9.
   */
  share_price_current_scaled: string;
  /**
   * UI contract:
   *   'fresh'      — render numerics normally.
   *   'lagging'    — render numerics + "data sync delayed" subnote.
   *   'unreliable' — replace numerics with em-dash, show "data unavailable".
   */
  data_quality: DataQuality;
  /** Debug. UI drives on data_quality, not this. */
  cursor_lag_ms: number;
}

/**
 * Risk Dashboard (Tier 1.3) block. Returned as `risk` on the transparency
 * endpoint. All raw amounts are NUSDC base units (6 decimals).
 * See ~/.claude/plans/tier1-chunk3-risk-dashboard.md.
 */
export interface RiskWindowPnl {
  window_ms: number;
  net_pnl_raw: string;
  data_quality: DataQuality;
}

export interface RiskMetricsBlock {
  /** Pool balance from chain at snapshot time. */
  tvl_raw: string;
  /** 24h / 7d / 30d net PnL trio. */
  pnl: {
    '24h': RiskWindowPnl;
    '7d': RiskWindowPnl;
    '30d': RiskWindowPnl;
  };
  /**
   * Open exposure (max house liability) from bankroll_pool v0.0.4
   * `open_exposure`, surfaced via OpenExposureSnapshot. Pair with
   * `active_exposure_chain_status`: when 'dormant' the raw value is N/A
   * (v0.0.4 published but game contracts linkage-frozen to v0.0.2/v0.0.3,
   * lockstep upgrade pending). The dashboard then renders a provisional
   * placeholder rather than a misleading 0.
   */
  active_exposure_raw: string;
  /** 'live' = recent snapshot present; 'dormant' = no snapshot or stale. */
  active_exposure_chain_status?: 'live' | 'dormant';
  /** Epoch ms of the latest indexed OpenExposureSnapshot, null when none. */
  active_exposure_last_snapshot_ms?: number | null;
  /** active_exposure × 10_000 / pool.balance, basis points. */
  utilization_ratio_bps: number;
  /**
   * Latest on-chain utilization cap (basis points). 0 = disabled by admin,
   * null = no cap-update event ever indexed (pre-v0.0.3 pool).
   */
  utilization_cap_bps: number | null;
  /** MAX(payout) all-time, game_id 2..6. */
  largest_single_payout_raw: string;
  /** (pps - 1.0) × total_shares — approximate cumulative LP yield. Signed. */
  cumulative_lp_distributions_raw: string;
  /** Worst peak-to-trough drawdown of running cumulative PnL, basis points. */
  max_drawdown_pct_bps: number;
  /** STDDEV of last 30 daily net_pnl rows, NUSDC raw. '0' when < 2 days history. */
  daily_pnl_volatility_30d_raw: string;
  /** Max consecutive days with negative net_pnl. */
  longest_house_losing_streak_days: number;
  /**
   * Top 5 LP positions by net shares. Public payload — addresses are
   * always masked (N7). Authenticated viewers learn their own rank via
   * /api/gostop/me/lp/position and match against `address_hash`.
   */
  top_lp_5: TopLpEntry[];
  /**
   * Aggregate residual for LPs ranked outside top 5. Null (or absent) when
   * lp_count ≤ 5. share_pct_bps is computed as `10_000 - sum(top5.share_pct_bps)`
   * so the UI's top5 + Other stack sums to exactly 100%. Aggregate-only, no
   * per-wallet attribution.
   */
  other_lp_summary?: OtherLpSummary | null;
  /**
   * Single-LP concentration signal for the rank-1 LP. Thresholds: ≥8000 bps =
   * 'extreme', ≥5000 bps = 'concentrated', else 'healthy'. 'unknown' when no
   * LP rows yet. Used by the dashboard to surface a badge when one wallet
   * controls a disproportionate share of pool liquidity.
   */
  lp_concentration?: {
    top1_share_pct_bps: number;
    status: 'healthy' | 'concentrated' | 'extreme' | 'unknown';
    lp_count: number;
  };
  /** Worst of bankrollPnl + matview-age qualities. */
  data_quality: DataQuality;
  /** Matview age debug (ms). */
  matview_age_ms: number;
  /** Snapshot timestamp (epoch ms). */
  generated_at_ms: number;
}

export interface TopLpEntry {
  /** 1..5 */
  rank: number;
  /** Masked display, e.g. "0x1234…5678". Raw addresses never appear in public payloads. */
  address_masked: string;
  /** SHA-256(wallet_lowercase) first 16 hex chars. Frontend self-match key. */
  address_hash: string;
  /** Net shares as a BigInt-compatible string. */
  shares: string;
  /** Share of total positive net shares, in basis points (10_000 = 100%). */
  share_pct_bps: number;
}

export interface OtherLpSummary {
  /** Number of LPs not in top 5 (= total positive LP count − top5 entries). */
  lp_count: number;
  /** Sum of net shares across all non-top5 LPs. BigInt-compatible string. */
  shares: string;
  /** Residual share in basis points so top5 + Other sums to exactly 10_000. */
  share_pct_bps: number;
}

/**
 * /api/gostop/me/lp/position — authenticated, never edge-cached. Wallet
 * comes from JWT, not URL/query.
 */
export interface MeLpPosition {
  wallet: string;
  net_shares: string;
  share_pct_bps: number;
  /** 1..5 when caller is a top-5 LP, null otherwise. */
  rank_in_top_5: number | null;
}

export interface TransparencyResponse {
  games: GameTransparency[];
  bankroll: BankrollSummary;
  /** Tier 1.3 Risk Dashboard block. */
  risk: RiskMetricsBlock;
  generated_at: number;
}

// ──────────────────────────────────────────────────────────────────────────
// LP endpoints (Tier 1.2)
// ──────────────────────────────────────────────────────────────────────────

export interface LpPoolState {
  data_quality: DataQuality;
  /** NUSDC base units (6 decimals), bigint-compatible string. */
  pool_balance: string;
  /** u128 raw — may exceed Number.MAX_SAFE_INTEGER, treat as BigInt. */
  total_shares: string;
  /** Raw scaled int; 1e9 = 1.0 pps. */
  share_price_scaled: string;
  /** false until admin calls seed_pool_shares. v0.0.3 live pool: true. */
  is_seeded: boolean;
  paused: boolean;
  generated_at: number;
}

export interface LpApy {
  window_days: number;
  /** Null when data_quality !== 'fresh'. UI must label as estimate. */
  apy_pct: number | null;
  net_pnl: string;
  tvl_approx: string;
  data_quality: DataQuality;
  cursor_lag_ms: number;
  note: string;
  generated_at: number;
}

export interface LpPosition {
  lp_token_id: string;
  shares: string;
  estimated_value_nusdc: string;
  /**
   * Original deposit amount (NUSDC raw, 6 decimals). Backend joins on
   * (actor, deposit_time, shares) against bankroll_event.liquidity_provided.
   * `null` when the indexer has not yet caught up to the deposit event or
   * the (ts, shares) tuple did not match (extreme edge cases). UI falls
   * back to omitting PnL when null.
   */
  deposit_amount_nusdc: string | null;
  deposit_time_ms: string;
  /** Null if user has not yet called request_withdraw on this LPToken. */
  withdraw_requested_at_ms: string | null;
  /** null mirrors withdraw_requested_at_ms; non-null = withdraw_requested + 24h. */
  claimable_at_ms: string | null;
}

export interface LpPositions {
  address: string;
  positions: LpPosition[];
  data_quality: DataQuality;
  generated_at: number;
}

export interface LpCooldown {
  lp_token_id: string;
  shares: string;
  withdraw_requested_at_ms: string | null;
  claimable_at_ms: string | null;
  /** Convenience: claimable_at - now, clamped to 0. */
  remaining_ms: string;
  /** Server clock at response time; UI compares to its own clock for skew detection. */
  server_now_ms: string;
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
