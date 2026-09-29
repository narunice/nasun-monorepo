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
import { BANKROLL_POOL } from '../../config/contracts.js';
import { rpcCall } from '../../rpc.js';
import { bankrollPnl, type DataQuality } from './bankroll-pnl.js';
import {
  computeCumulativeLpDist,
  computeUtilizationBps,
} from './bankroll-pool-math.js';

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

export interface OtherLpSummary {
  /** Number of LPs not in top 5 (= total positive LP count − top5 entries). */
  lp_count: number;
  /** Sum of net shares across all non-top5 LPs. BigInt string. */
  shares: string;
  /** Residual share in basis points so top5 + Other sums to exactly 10_000. */
  share_pct_bps: number;
}

export interface RiskMetricsResult {
  /** Pool balance from chain (NUSDC raw units), echoed from bankrollPnl 7d call. */
  tvl_raw: string;
  /** 24h / 7d / 30d net PnL with per-call data_quality. */
  pnl: Record<PnlWindowKey, RiskWindowPnl>;
  /**
   * Open exposure (max house liability): chain-authoritative reading of
   * bankroll_pool `open_exposure`, surfaced via the OpenExposureSnapshot event.
   * Since v0.0.6 it is the most every in-flight round can still pay (each
   * reservation released exactly once when its round settles), plus the
   * legacy mines sessions opened before the rebind at their max_single_payout.
   *
   * Pair with `active_exposure_chain_status` before rendering: when status
   * is 'dormant' there is no recent reading and the UI must show a
   * provisional placeholder rather than 0 NUSDC. When status is 'degraded' the
   * reservations exceed the pool balance and the figure is withheld likewise.
   */
  active_exposure_raw: string;
  /**
   * 'live'     → recent OpenExposureSnapshot event present, raw value usable.
   * 'dormant'  → no usable reading (chain read failed and no recent indexed
   *              snapshot to fall back on). Treat the raw value as N/A.
   * 'degraded' → the paired reservations exceed pool.balance, so the figure
   *              is not publishable as utilization: the pool could not cover
   *              every open round at its maximum. Consumers withhold it.
   *
   *              Before bankroll_pool v0.0.6 (2026-09-28) the reservation
   *              ledger did not pair reserves with releases and every live
   *              reading was 'degraded'; see RESERVATION_LEDGER_PAIRS_EXACTLY
   *              for the measurement and the fix.
   */
  active_exposure_chain_status: 'live' | 'dormant' | 'degraded';
  /** Epoch ms of the latest indexed OpenExposureSnapshot, null when none. */
  active_exposure_last_snapshot_ms: number | null;
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
  /**
   * Aggregate residual for LPs ranked outside top 5. Present only when more
   * than 5 LPs exist; absent or null when total LP count ≤ 5. share_pct_bps
   * is computed as `10_000 - SUM(top_lp_5.share_pct_bps)` so the UI's visual
   * stack (top5 + Other) always sums to exactly 100%. N7-safe because it is
   * an aggregate, never a single-wallet attribution.
   */
  other_lp_summary: OtherLpSummary | null;
  /**
   * Single-LP concentration signal. `top1_share_pct_bps` is the rank-1 LP's
   * share of *total positive net shares* (NOT including the operator seed);
   * `concentration_status` buckets it for the dashboard badge.
   *
   * Thresholds (basis points):
   *   ≥ 8000 (80%)  → 'extreme'    — single LP can move share_price on exit
   *   ≥ 5000 (50%)  → 'concentrated' — material single-LP risk
   *   <  5000       → 'healthy'    — diversified
   *
   * `0` when no LP rows exist yet. Same denominator as top_lp_5 share_pct
   * (sum of positive LP net_shares) so the two numbers align.
   */
  lp_concentration: {
    top1_share_pct_bps: number;
    status: 'healthy' | 'concentrated' | 'extreme' | 'unknown';
    lp_count: number;
  };
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

/**
 * Whether the deployed contracts pair every `open_exposure` reservation with
 * exactly one release. That pairing is the only thing that makes the field a
 * liability measure.
 *
 * It did not hold before 2026-09-28. Measured 2026-09-27 over the whole
 * retained window of gostop.bankroll_event (event_type='open_exposure_snapshot',
 * reason_code 0=reserve / 1=release):
 *
 *   scratchcard   972,476 reserve / 1,192,865 release   net -220,389
 *   numbermatch   941,009 reserve /   941,009 release   net        0
 *   mines          90,217 reserve /    58,135 release   net  +32,082
 *   wheel         229,730 reserve /   103,588 release   net +126,142
 *
 * open_exposure read 13,720,500 against at most 150,000 of true in-flight
 * liability, ~91x.
 *
 * Fixed 2026-09-28 on chain: bankroll_pool v0.0.6 books reservations per game
 * and releases each exactly once (reserve_exposure / release_exposure); wheel,
 * scratch card and mines were upgraded in place onto it; their GameCaps moved
 * out of the field the pre-upgrade code reads, so that code aborts; and
 * mines::reset_legacy_exposure discarded the leak, leaving exactly the legacy
 * mines sessions still open (75 x 2,000 = 150,000 at the reset). numbermatch
 * still runs the legacy path, which pairs within one transaction. Set it back
 * to false if a game is ever rebound to the unpaired legacy collect_bet.
 */
const RESERVATION_LEDGER_PAIRS_EXACTLY: boolean = true;

/**
 * Downgrade a 'live' exposure reading to 'degraded' when `open_exposure` is not
 * usable as utilization.
 *
 * With the ledger paired, that is a reservation total above the balance
 * backing it: the pool could not cover every open round at its maximum, and
 * nothing on chain prevents it while no utilization cap is configured. While
 * RESERVATION_LEDGER_PAIRS_EXACTLY is false it is every reading instead,
 * since an unpaired ledger is not a liability figure at any value.
 *
 * 'dormant' passes through untouched: it already means "no usable reading",
 * and layering a second reason on top would only obscure the first.
 *
 * `chainBalance` null means the chain read failed, so there is nothing to
 * compare and data_quality is already 'unreliable'. A balance of exactly zero
 * is a real reading, not a missing one: a drained pool still carrying
 * reservations is the starkest form of the condition.
 */
function classifyExposureStatus(
  base: ActiveExposure['status'],
  exposureRaw: bigint,
  chainBalance: bigint | null,
): RiskMetricsResult['active_exposure_chain_status'] {
  if (base !== 'live') return base;
  if (!RESERVATION_LEDGER_PAIRS_EXACTLY) return 'degraded';
  return exposureExceedsBalance(exposureRaw, chainBalance) ? 'degraded' : 'live';
}

/**
 * Publishability check for a paired ledger: a reservation total above the
 * balance backing it is not a utilization figure, and no cap is configured to
 * stop reserve_exposure from getting there.
 *
 * A null balance means the chain read failed, so there is nothing to compare
 * and data_quality is already 'unreliable'. Zero is a real reading rather than
 * a missing one: a drained pool still carrying reservations is the starkest
 * form of the condition, so any reservation at all counts.
 */
function exposureExceedsBalance(exposureRaw: bigint, chainBalance: bigint | null): boolean {
  if (chainBalance === null) return false;
  if (chainBalance === 0n) return exposureRaw > 0n;
  return exposureRaw > chainBalance;
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
 * Active exposure: the bankroll_pool `open_exposure` dynamic field, read from
 * chain.
 *
 * Read directly rather than from the latest indexed OpenExposureSnapshot so
 * the figure does not depend on indexer lag or on recent activity. Deriving
 * freshness from snapshot age used to hide a valid reading after a quiet hour,
 * including the quiet that follows pausing bets in response to an
 * exposure-exceeds-balance alert, which silenced that alert while the
 * over-commitment was still on chain.
 *
 * Status semantics:
 *   - 'live'    → the chain read succeeded, or it failed and the latest
 *                  indexed snapshot is younger than FALLBACK_SNAPSHOT_MAX_AGE_MS.
 *                  Every write to the field emits a snapshot, so a recent row
 *                  is the chain value as of the indexer head.
 *   - 'dormant' → neither: no usable reading, rendered as a placeholder.
 */
const FALLBACK_SNAPSHOT_MAX_AGE_MS = 60 * 60_000;

const OPEN_EXPOSURE_FIELD_NAME = {
  type: 'vector<u8>',
  value: Array.from(Buffer.from('open_exposure')),
};

interface ActiveExposure {
  raw: bigint;
  status: 'live' | 'dormant';
  last_snapshot_ms: number | null;
}

/** null on a failed read. A pool whose field was never written reads 0. */
async function fetchChainOpenExposure(): Promise<bigint | null> {
  try {
    const res = await rpcCall<{
      data?: { content?: { fields?: { value?: string | number } } };
      error?: { code?: string };
    }>('suix_getDynamicFieldObject', [BANKROLL_POOL.bankrollPoolObjectId, OPEN_EXPOSURE_FIELD_NAME]);
    if (res?.error?.code === 'dynamicFieldNotFound') return 0n;
    const value = res?.data?.content?.fields?.value;
    return value === undefined ? null : BigInt(String(value));
  } catch (err) {
    console.warn(
      `[riskMetrics] open_exposure chain read failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function activeExposure(asOfMs: number): Promise<ActiveExposure> {
  const sql = reader();
  const [chain, rows] = await Promise.all([
    fetchChainOpenExposure(),
    sql<{ exposure: string | null; ts: string | null }[]>`
      SELECT open_exposure_after::text AS exposure,
             timestamp_ms::text       AS ts
      FROM gostop.bankroll_event
      WHERE event_type = 'open_exposure_snapshot'
        AND open_exposure_after IS NOT NULL
      ORDER BY timestamp_ms DESC, id DESC
      LIMIT 1
    `,
  ]);
  const ts = rows.length > 0 ? Number(rows[0]!.ts ?? '0') : null;
  if (chain !== null) {
    return { raw: chain, status: 'live', last_snapshot_ms: ts };
  }
  if (ts === null || asOfMs - ts > FALLBACK_SNAPSHOT_MAX_AGE_MS) {
    return { raw: 0n, status: 'dormant', last_snapshot_ms: ts };
  }
  return { raw: BigInt(rows[0]!.exposure ?? '0'), status: 'live', last_snapshot_ms: ts };
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
/** Concentration bucket thresholds, basis points (10_000 = 100%). */
const CONCENTRATION_EXTREME_BPS = 8_000;
const CONCENTRATION_WARN_BPS    = 5_000;

interface TopLp5Result {
  entries: TopLpEntry[];
  /** Aggregate residual for LPs ranked outside top 5. Null when lp_count ≤ 5. */
  other: OtherLpSummary | null;
  top1_share_pct_bps: number;
  status: 'healthy' | 'concentrated' | 'extreme' | 'unknown';
  lp_count: number;
}

async function topLp5(): Promise<TopLp5Result> {
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
  // Recompute the denominator + lp_count client-side to keep the SQL output
  // single-row-per-actor (avoids window functions complicating the shape).
  const totalRows = await sql<{ total: string; lp_count: string }[]>`
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
    SELECT COALESCE(SUM(net_shares), 0)::text AS total,
           COUNT(*)::text AS lp_count
    FROM per_actor
    WHERE net_shares > 0
  `;
  const totalShares = BigInt(totalRows[0]?.total ?? '0');
  const lpCount = Number(totalRows[0]?.lp_count ?? '0');

  const entries = rows.map((r, i) => {
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

  // Residual "Other" bucket so the UI's top5 + Other stack sums to 100%.
  // share_pct_bps is derived from `10_000 - sum(top5.share_pct_bps)` rather
  // than recomputing from (other_shares * 10_000 / totalShares) — the former
  // absorbs all per-row truncation losses into Other, guaranteeing visual
  // closure. Without this, 7 LPs at ~98.8% top1 round to 9997 bps total.
  let other: OtherLpSummary | null = null;
  if (lpCount > entries.length && totalShares > 0n) {
    const top5SharesSum = entries.reduce((acc, e) => acc + BigInt(e.shares), 0n);
    const top5PctSum = entries.reduce((acc, e) => acc + e.share_pct_bps, 0);
    other = {
      lp_count: lpCount - entries.length,
      shares: (totalShares - top5SharesSum).toString(),
      share_pct_bps: Math.max(0, 10_000 - top5PctSum),
    };
  }

  const top1 = entries[0]?.share_pct_bps ?? 0;
  let status: TopLp5Result['status'];
  if (lpCount === 0)                            status = 'unknown';
  else if (top1 >= CONCENTRATION_EXTREME_BPS)   status = 'extreme';
  else if (top1 >= CONCENTRATION_WARN_BPS)      status = 'concentrated';
  else                                          status = 'healthy';

  return { entries, other, top1_share_pct_bps: top1, status, lp_count: lpCount };
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
    activeExposure(now),
    largestSinglePayout(),
    matviewStats(),
    topLp5(),
  ]);

  // TVL is pool.balance, read from chain by the 7d bankrollPnl call and
  // passed through verbatim.
  //
  // It used to be reconstructed as `pps x total_shares`, taking pps from
  // chain and total_shares from the reconciled bankroll_event tail. That
  // identity holds only while both sides agree. On 2026-09-13 the DB tail
  // carried 17,603,748,855,652 shares against the chain's 6,418,628,255,535,
  // so the public transparency page published a 36.31M NUSDC TVL against a
  // real pool balance of 13.24M — 2.74x, with no guard anywhere. Meanwhile
  // /api/gostop/lp/apy read pool.balance directly and never had the bug, so
  // the two endpoints simply disagreed. One source now, so they cannot drift
  // apart again.
  // Null when the chain read failed — kept distinct from a real zero balance
  // so classifyExposureStatus can decline rather than misreport. tvl_raw and
  // the ratios below fall back to 0, which data_quality 'unreliable' already
  // marks as unusable.
  const chainBalanceOrNull = pnl7d.pool_balance_raw !== null
    ? BigInt(pnl7d.pool_balance_raw)
    : null;
  const chainBalance = chainBalanceOrNull ?? 0n;
  const chainShares = pnl7d.chain_total_shares !== null
    ? BigInt(pnl7d.chain_total_shares)
    : 0n;
  const ppsScaled = BigInt(pnl7d.share_price_current_scaled);

  // Cumulative LP distributions = (pps - 1.0) x total_shares / SCALE. Same
  // chain read as pps, for the same reason as TVL above: this metric was
  // inflated by the identical 2.74x. Negative when the pool is underwater;
  // clamped to 0 in the UI but kept signed here so the API stays honest.
  const cumulativeLpDist = computeCumulativeLpDist(ppsScaled, chainShares);

  // Utilization denominator is pool.balance, matching
  // bankroll_pool::collect_bet exactly — it compares the new reservation
  // against balance::value(&pool.balance). Dashboard and contract now derive
  // the same ratio; the inflated TVL previously made this read ~2.7x lower
  // than what the on-chain cap check would have seen.
  const utilizationBps = computeUtilizationBps(exposure.raw, chainBalance);

  const exposureStatus = classifyExposureStatus(
    exposure.status,
    exposure.raw,
    chainBalanceOrNull,
  );

  const mvQuality = matviewQuality(mv.ageMs);
  const aggQuality = worstQuality(
    worstQuality(worstQuality(pnl24h.data_quality, pnl7d.data_quality), pnl30d.data_quality),
    mvQuality,
  );

  return {
    tvl_raw: chainBalance.toString(),
    pnl: {
      '24h': { window_ms: PNL_WINDOWS['24h'], net_pnl_raw: pnl24h.net_pnl, data_quality: pnl24h.data_quality },
      '7d':  { window_ms: PNL_WINDOWS['7d'],  net_pnl_raw: pnl7d.net_pnl,  data_quality: pnl7d.data_quality },
      '30d': { window_ms: PNL_WINDOWS['30d'], net_pnl_raw: pnl30d.net_pnl, data_quality: pnl30d.data_quality },
    },
    active_exposure_raw: exposure.raw.toString(),
    active_exposure_chain_status: exposureStatus,
    active_exposure_last_snapshot_ms: exposure.last_snapshot_ms,
    utilization_ratio_bps: utilizationBps,
    utilization_cap_bps: cap,
    largest_single_payout_raw: largest.toString(),
    cumulative_lp_distributions_raw: cumulativeLpDist.toString(),
    max_drawdown_pct_bps: mv.maxDrawdownBps,
    daily_pnl_volatility_30d_raw: mv.volatility30dRaw,
    longest_house_losing_streak_days: mv.longestLosingStreakDays,
    top_lp_5: topLps.entries,
    other_lp_summary: topLps.other,
    lp_concentration: {
      top1_share_pct_bps: topLps.top1_share_pct_bps,
      status: topLps.status,
      lp_count: topLps.lp_count,
    },
    data_quality: aggQuality,
    matview_age_ms: mv.ageMs,
    generated_at_ms: now,
  };
}

// Test-only exports.
export { worstQuality, matviewQuality, classifyExposureStatus, exposureExceedsBalance };

export const _RISK_METRICS_CONSTANTS = {
  FALLBACK_SNAPSHOT_MAX_AGE_MS,
  RESERVATION_LEDGER_PAIRS_EXACTLY,
};
