/**
 * Risk Metrics for the Public Risk Dashboard (Tier 1.3).
 *
 * Aggregates a small bundle of BankrollPool-derived risk signals for the
 * `/api/gostop/transparency` `risk` block. Tier 1 chunk3 v1 scope (9 of 11
 * metrics from master plan §Sub-Plan B Tier 1.3); top_lp_5 and
 * win_rate_variance are deferred to v1.1 (see chunk3 plan §1).
 *
 * Single Source of Truth boundary:
 *   - Per-window PnL  → `bankrollPnl()`  (chain pool.balance + DB aggregates)
 *   - Per-day series  → `gostop.bankroll_daily_pnl` matview (game_id 2..6)
 *   - Active exposure → `gostop.game_round` status-based (pending_resolve /
 *                       pending_claim). Honest v1 naming: "pending round
 *                       commitments", NOT max liability. Proper max-liability
 *                       tracking requires Move v0.0.4 open_exposure
 *                       (plan §10.B), out of scope this chunk.
 *   - Utilization cap → latest `bankroll_event.event_type='cap_updated'`
 *                       cap_bps. Avoids an extra RPC round-trip.
 *
 * No internal caching — caller (transparency route) wraps with TTL.
 *
 * @perf
 *   - bankrollPnl × 3 (24h/7d/30d) in parallel
 *   - 1 matview scan (≤365 rows/yr, trivial)
 *   - 2 small DB queries (active_exposure, largest_payout, cap)
 *   - Chain reads piggyback on bankrollPnl (no extra calls)
 *   Total ≈ 100-150ms wall clock @ node-3 colocation.
 */

import { createHash } from 'node:crypto';
import { reader } from '../../db/client.js';
import { bankrollPnl, type DataQuality } from './bankroll-pnl.js';

const PNL_WINDOWS = {
  '24h': 86_400_000,
  '7d':  7  * 86_400_000,
  '30d': 30 * 86_400_000,
} as const;

type PnlWindowKey = keyof typeof PNL_WINDOWS;

/** Cap of 100% expressed in basis points (matches Move MAX_CAP_BPS). */
const BPS_FULL = 10_000;

/** Matview staleness budget. Beyond this, risk.data_quality degrades. */
const MATVIEW_FRESH_MS = 30 * 60_000;     // 30 min
const MATVIEW_LAGGING_MS = 6 * 3_600_000; // 6 h

export interface RiskWindowPnl {
  /** Window length in ms (echoed for client cache-key sanity). */
  window_ms: number;
  /** bets - payouts - refunds (game_id 2..6) over the window, NUSDC raw units. */
  net_pnl_raw: string;
  /** Per-call data_quality (chain + reconciler health). */
  data_quality: DataQuality;
}

export interface TopLpEntry {
  /** 1..5 */
  rank: number;
  /** Display address with middle bytes elided. Never the raw address. */
  address_masked: string;
  /**
   * SHA-256(wallet_lowercase) first 16 hex chars. Lets the frontend match
   * "is this me?" without ever transmitting raw addresses through the public
   * payload. The viewer's own wallet is in their JWT, never in this list.
   */
  address_hash: string;
  /** Net shares = liquidity_provided cumulative - liquidity_redeemed cumulative. BigInt string. */
  shares: string;
  /** shares × 10_000 / total_positive_shares. Basis points. */
  share_pct_bps: number;
}

export interface RiskMetricsResult {
  /** Pool balance from chain (NUSDC raw units), echoed from bankrollPnl 7d call. */
  tvl_raw: string;
  /** 24h / 7d / 30d net PnL with per-call data_quality. */
  pnl: Record<PnlWindowKey, RiskWindowPnl>;
  /**
   * Active exposure = SUM(bet_amount) over game_round rows with status IN
   * ('pending_resolve','pending_claim') AND game_id BETWEEN 2 AND 6.
   * v1 honest naming: "pending round commitments" — NOT max liability.
   * Move v0.0.4 open_exposure (plan §10.B) would track true max-payout
   * exposure; out of scope here.
   */
  active_exposure_raw: string;
  /**
   * utilization_ratio_bps = active_exposure × 10_000 / pool.balance.
   * Returned in basis points (matches on-chain cap units). 0 when balance=0.
   */
  utilization_ratio_bps: number;
  /**
   * Latest on-chain utilization cap (basis points). 0 = disabled. Null when
   * no UtilizationCapUpdated event has ever been indexed (pre-v0.0.3 pool).
   */
  utilization_cap_bps: number | null;
  /** MAX(payout) all-time over game_round (game_id 2..6, status='final'). */
  largest_single_payout_raw: string;
  /**
   * (pps - 1.0) × total_shares — approximate cumulative LP yield in NUSDC.
   * Indexer-snapshot based; precise historical replay deferred to plan §10.E.
   */
  cumulative_lp_distributions_raw: string;
  /**
   * Worst peak-to-trough drawdown of running cumulative net_pnl (since matview
   * inception). In basis points relative to running peak. 0 when peak <= 0
   * (pool has been net-negative since day 1).
   */
  max_drawdown_pct_bps: number;
  /**
   * STDDEV of daily net_pnl over the last 30 matview rows (raw NUSDC). Returns
   * '0' when fewer than 2 days of history.
   */
  daily_pnl_volatility_30d_raw: string;
  /** Max consecutive days where bankroll_daily_pnl.net_pnl_raw < 0. */
  longest_house_losing_streak_days: number;
  /**
   * Top 5 LP positions by net shares, masked. Always public — N7 compliance
   * means raw addresses never appear here. Authenticated viewers learn their
   * own rank via /api/gostop/me/lp/position. Order is rank ASC.
   */
  top_lp_5: TopLpEntry[];
  /** Aggregate data quality: worst of bankrollPnl + matview age. */
  data_quality: DataQuality;
  /** Matview freshness debug. */
  matview_age_ms: number;
  /** When this snapshot was computed (epoch ms). */
  generated_at_ms: number;
}

/**
 * Worst of two DataQuality enums, ordered fresh < lagging < unreliable.
 */
function worstQuality(a: DataQuality, b: DataQuality): DataQuality {
  const order: DataQuality[] = ['fresh', 'lagging', 'unreliable'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}

function matviewQuality(ageMs: number): DataQuality {
  if (ageMs <= MATVIEW_FRESH_MS) return 'fresh';
  if (ageMs <= MATVIEW_LAGGING_MS) return 'lagging';
  return 'unreliable';
}

/**
 * Pull the latest cap_bps from bankroll_event. Returns null if no cap event
 * has been indexed. Treasury-pool pre-v0.0.3 deploys legitimately have no
 * such event; the UI distinguishes null (no cap configured) from 0 (cap
 * explicitly disabled by admin).
 */
async function latestUtilizationCapBps(): Promise<number | null> {
  const sql = reader();
  const rows = await sql<{ cap_bps: number | null }[]>`
    SELECT cap_bps
    FROM gostop.bankroll_event
    WHERE event_type = 'cap_updated'
    ORDER BY timestamp_ms DESC, id DESC
    LIMIT 1
  `;
  const raw = rows[0]?.cap_bps;
  if (raw === undefined || raw === null) return null;
  return Number(raw);
}

/**
 * Pending committed bets — single SUM over game_round non-final statuses.
 * Status filter matches the partial index `idx_gr_status` so this query is
 * O(open_rounds), not O(all_rounds).
 */
async function pendingCommitments(): Promise<bigint> {
  const sql = reader();
  const rows = await sql<{ exposure: string }[]>`
    SELECT COALESCE(SUM(bet_amount), 0)::text AS exposure
    FROM gostop.game_round
    WHERE status IN ('pending_resolve', 'pending_claim')
      AND game_id BETWEEN 2 AND 6
  `;
  return BigInt(rows[0]?.exposure ?? '0');
}

/** Sui address pretty-print: 0xabcd…1234 (6 prefix + 4 suffix). */
export function maskAddress(addr: string): string {
  if (typeof addr !== 'string' || addr.length < 12) return '0x…';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Stable 16-hex-char digest of a wallet for client-side self-match. */
export function walletHash(addr: string): string {
  return createHash('sha256').update(addr.toLowerCase()).digest('hex').slice(0, 16);
}

interface TopLpRow {
  actor: string;
  net_shares: string;
}

/**
 * Top-5 LP positions by net shares.
 *
 * Aggregates `liquidity_provided` minus `liquidity_redeemed` shares per actor
 * over the full `bankroll_event` history. Filters positive net only (zero or
 * negative shouldn't happen given chain invariants, but defensive). Returns
 * up to 5 entries with masked addresses + hash for client-side self-match.
 *
 * Total denominator for share_pct uses the sum of positive net shares across
 * all actors (NOT chain total_shares) so percentages always sum to ≤ 100%.
 * Chain total_shares may differ slightly during indexer catch-up windows;
 * within-query consistency is more important than chain-alignment here.
 */
async function topLp5(): Promise<TopLpEntry[]> {
  const sql = reader();
  const rows = await sql<TopLpRow[]>`
    WITH per_actor AS (
      SELECT actor,
             COALESCE(SUM(CASE WHEN event_type='liquidity_provided' THEN shares ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN event_type='liquidity_redeemed' THEN shares ELSE 0 END), 0)
             AS net_shares
      FROM gostop.bankroll_event
      WHERE actor IS NOT NULL
        AND event_type IN ('liquidity_provided','liquidity_redeemed')
      GROUP BY actor
    ),
    positive AS (
      SELECT actor, net_shares FROM per_actor WHERE net_shares > 0
    ),
    totals AS (
      SELECT COALESCE(SUM(net_shares), 0) AS total_shares FROM positive
    )
    SELECT positive.actor,
           positive.net_shares::text AS net_shares
    FROM positive
    ORDER BY positive.net_shares DESC
    LIMIT 5
  `;
  // Recompute the denominator client-side to keep the SQL output single-row-per-actor
  // (avoids window functions complicating the response shape).
  const totalRows = await sql<{ total: string }[]>`
    WITH per_actor AS (
      SELECT actor,
             COALESCE(SUM(CASE WHEN event_type='liquidity_provided' THEN shares ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN event_type='liquidity_redeemed' THEN shares ELSE 0 END), 0)
             AS net_shares
      FROM gostop.bankroll_event
      WHERE actor IS NOT NULL
        AND event_type IN ('liquidity_provided','liquidity_redeemed')
      GROUP BY actor
    )
    SELECT COALESCE(SUM(net_shares), 0)::text AS total
    FROM per_actor
    WHERE net_shares > 0
  `;
  const totalShares = BigInt(totalRows[0]?.total ?? '0');

  return rows.map((r, i) => {
    const shares = BigInt(r.net_shares);
    const pctBps = totalShares > 0n ? Number((shares * 10_000n) / totalShares) : 0;
    return {
      rank: i + 1,
      address_masked: maskAddress(r.actor),
      address_hash: walletHash(r.actor),
      shares: shares.toString(),
      share_pct_bps: pctBps,
    };
  });
}

/**
 * MAX(payout) all-time over bankroll-pool games. No window filter — biggest
 * single payout the house has ever paid out is what the risk dashboard wants.
 */
async function largestSinglePayout(): Promise<bigint> {
  const sql = reader();
  const rows = await sql<{ max_payout: string | null }[]>`
    SELECT MAX(payout)::text AS max_payout
    FROM gostop.game_round
    WHERE status = 'final'
      AND game_id BETWEEN 2 AND 6
  `;
  return BigInt(rows[0]?.max_payout ?? '0');
}

interface MatviewStats {
  ageMs: number;
  maxDrawdownBps: number;
  volatility30dRaw: string;
  longestLosingStreakDays: number;
}

/**
 * Single roundtrip over `gostop.bankroll_daily_pnl` computes drawdown,
 * volatility, streak, and matview age. Uses window functions for the running
 * peak and a consecutive-day streak walk via row_number() difference.
 *
 * Matview is small (≤365 rows/yr); a full scan is fine and lets us avoid a
 * second matview just to materialize the running max.
 */
async function matviewStats(): Promise<MatviewStats> {
  const sql = reader();
  const rows = await sql<
    {
      max_drawdown_bps: string | null;
      volatility_30d: string | null;
      longest_losing_streak: number | null;
      matview_age_ms: string;
    }[]
  >`
    WITH series AS (
      SELECT
        day,
        net_pnl_raw,
        SUM(net_pnl_raw) OVER (ORDER BY day) AS cum_pnl_raw
      FROM gostop.bankroll_daily_pnl
    ),
    drawdown AS (
      SELECT
        cum_pnl_raw,
        MAX(cum_pnl_raw) OVER (ORDER BY day) AS running_peak_raw
      FROM series
    ),
    drawdown_bps AS (
      -- Drawdown only meaningful when running_peak > 0. When peak <= 0 the
      -- pool has been net-negative since inception; report 0 to avoid
      -- divide-by-zero / nonsensical >100% values.
      SELECT
        CASE
          WHEN running_peak_raw > 0 AND cum_pnl_raw < running_peak_raw
          THEN ((running_peak_raw - cum_pnl_raw) * 10000 / running_peak_raw)::bigint
          ELSE 0::bigint
        END AS dd_bps
      FROM drawdown
    ),
    vol AS (
      SELECT COALESCE(STDDEV_SAMP(net_pnl_raw), 0)::text AS volatility_30d
      FROM (
        SELECT net_pnl_raw
        FROM gostop.bankroll_daily_pnl
        ORDER BY day DESC
        LIMIT 30
      ) v
    ),
    losing_groups AS (
      -- Consecutive losing days form a group when row_number() - row_number()
      -- of losing-only rows is constant. Standard "gaps and islands".
      SELECT
        day,
        ROW_NUMBER() OVER (ORDER BY day)
        - ROW_NUMBER() OVER (PARTITION BY (net_pnl_raw < 0) ORDER BY day)
          AS grp,
        (net_pnl_raw < 0) AS is_loss
      FROM gostop.bankroll_daily_pnl
    ),
    losing_streaks AS (
      SELECT COUNT(*)::int AS streak_len
      FROM losing_groups
      WHERE is_loss
      GROUP BY grp
    ),
    age AS (
      SELECT (
        (EXTRACT(EPOCH FROM now()) * 1000)::bigint
        - COALESCE(
            (EXTRACT(EPOCH FROM (
              SELECT MAX(day) FROM gostop.bankroll_daily_pnl
            )) * 1000)::bigint + 86400000,  -- end of latest day
            (EXTRACT(EPOCH FROM now()) * 1000)::bigint
          )
      )::text AS matview_age_ms
    )
    SELECT
      (SELECT MAX(dd_bps)::text FROM drawdown_bps)          AS max_drawdown_bps,
      (SELECT volatility_30d FROM vol)                       AS volatility_30d,
      (SELECT COALESCE(MAX(streak_len), 0) FROM losing_streaks) AS longest_losing_streak,
      (SELECT matview_age_ms FROM age)                       AS matview_age_ms
  `;

  const row = rows[0];
  const ageMs = Math.max(0, Number(row?.matview_age_ms ?? '0'));
  return {
    ageMs,
    maxDrawdownBps: Number(row?.max_drawdown_bps ?? '0'),
    volatility30dRaw: row?.volatility_30d ?? '0',
    longestLosingStreakDays: Number(row?.longest_losing_streak ?? 0),
  };
}

/**
 * Compute the full Risk Dashboard payload.
 */
export async function riskMetrics(opts: { asOfMs?: number } = {}): Promise<RiskMetricsResult> {
  const now = opts.asOfMs ?? Date.now();

  // Three windows in parallel — each is its own bankrollPnl call (chain RPC
  // + DB CTE). bankrollPnl has no internal cache so parallel is safe.
  const [pnl24h, pnl7d, pnl30d, cap, exposure, largest, mv, topLps] = await Promise.all([
    bankrollPnl({ fromMs: now - PNL_WINDOWS['24h'], toMs: now }),
    bankrollPnl({ fromMs: now - PNL_WINDOWS['7d'],  toMs: now }),
    bankrollPnl({ fromMs: now - PNL_WINDOWS['30d'], toMs: now }),
    latestUtilizationCapBps(),
    pendingCommitments(),
    largestSinglePayout(),
    matviewStats(),
    topLp5(),
  ]);

  // TVL + cumulative LP yield reuse the 7d bankrollPnl chain read.
  // share_price_current_scaled = pool.balance × 1e9 / total_shares.
  // We don't have direct chain pool.balance back from bankrollPnl (it only
  // returns the derived pps), so we recover balance from pps × shares.
  // total_shares isn't directly returned either — but cumulative_lp_dist
  // is the only metric that needs it. For TVL we'd ideally pass the raw
  // chain read through; v1 trade-off: derive TVL via a single second
  // bankroll-event read for total_shares (very cheap) + the returned pps.
  //
  // Simpler v1: skip a redundant chain call — use latest reconciled
  // total_shares from bankroll_event (which the reconciler keeps current
  // after PR-A) and pps from bankrollPnl 7d call.
  const sharesRow = await reader()<{ shares: string | null }[]>`
    SELECT total_shares_after::text AS shares
    FROM gostop.bankroll_event
    WHERE total_shares_after IS NOT NULL
    ORDER BY timestamp_ms DESC, id DESC
    LIMIT 1
  `;
  const totalShares = BigInt(sharesRow[0]?.shares ?? '0');
  const ppsScaled = BigInt(pnl7d.share_price_current_scaled);
  const SHARE_PRICE_SCALE = 1_000_000_000n;
  const tvlRaw = (ppsScaled * totalShares) / SHARE_PRICE_SCALE;

  // Cumulative LP distributions ≈ (pps - 1.0) × total_shares / SCALE.
  // Negative when the pool is underwater; clamped to 0 in UI but kept signed
  // here so the API is honest.
  const ppsExcess = ppsScaled - SHARE_PRICE_SCALE;
  const cumulativeLpDist = (ppsExcess * totalShares) / SHARE_PRICE_SCALE;

  const utilizationBps = tvlRaw > 0n
    ? Number((exposure * BigInt(BPS_FULL)) / tvlRaw)
    : 0;

  const mvQuality = matviewQuality(mv.ageMs);
  const aggQuality = worstQuality(
    worstQuality(worstQuality(pnl24h.data_quality, pnl7d.data_quality), pnl30d.data_quality),
    mvQuality,
  );

  return {
    tvl_raw: tvlRaw.toString(),
    pnl: {
      '24h': { window_ms: PNL_WINDOWS['24h'], net_pnl_raw: pnl24h.net_pnl, data_quality: pnl24h.data_quality },
      '7d':  { window_ms: PNL_WINDOWS['7d'],  net_pnl_raw: pnl7d.net_pnl,  data_quality: pnl7d.data_quality },
      '30d': { window_ms: PNL_WINDOWS['30d'], net_pnl_raw: pnl30d.net_pnl, data_quality: pnl30d.data_quality },
    },
    active_exposure_raw: exposure.toString(),
    utilization_ratio_bps: utilizationBps,
    utilization_cap_bps: cap,
    largest_single_payout_raw: largest.toString(),
    cumulative_lp_distributions_raw: cumulativeLpDist.toString(),
    max_drawdown_pct_bps: mv.maxDrawdownBps,
    daily_pnl_volatility_30d_raw: mv.volatility30dRaw,
    longest_house_losing_streak_days: mv.longestLosingStreakDays,
    top_lp_5: topLps,
    data_quality: aggQuality,
    matview_age_ms: mv.ageMs,
    generated_at_ms: now,
  };
}

// Test-only exports.
export { worstQuality, matviewQuality };
