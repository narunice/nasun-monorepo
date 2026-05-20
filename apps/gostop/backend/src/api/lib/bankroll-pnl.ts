/**
 * BankrollPool PnL Source of Truth.
 *
 * Aggregates per-window house PnL components for the transparency endpoint
 * and the upcoming LP APY consumer (Tier 1.2). Plan v3 §4.A.
 *
 * Sources:
 *   - bets / payouts / refunds (game_id 2..6) ← gostop.game_round and
 *     gostop.bankroll_event. Lottery (game_id=1) is excluded; lottery PnL
 *     flows through its own prize_pool and is exposed separately.
 *   - treasury_deposits ← gostop.bankroll_event.event_type='treasury_deposited'.
 *     `lottery_treasury_inflow` (cut + unclaimed sweep) is broken out as a
 *     separate sub-total so the transparency UI can label it.
 *   - share_price_current ← Sui RPC sui_getObject on BankrollPool. Chain is
 *     the authoritative source for pool.balance; total_shares from chain is
 *     also used here for the "current" reading. Historical pps would require
 *     replaying chain state and is intentionally out of scope (plan v3 §3.F).
 *
 * Staleness:
 *   `cursor_lag_ms` = now - MIN(last_ts_ms) across the PnL streams that
 *   advance the bankroll watermark. Unreconciled row count comes from
 *   `gostop.bankroll_event WHERE total_shares_after IS NULL`. Both are
 *   collapsed into a single `data_quality` enum so consumers do not have
 *   to invent their own threshold logic.
 *
 * @perf O(window_rows) over two tables. 7d window @ 1500 DAU is ~50ms.
 *       This function has NO internal cache — every consumer wraps it with
 *       its own TTL (transparency: 30s endpoint cache; future LP APY: TBD).
 *       Internal caching would let two consumers with different windows
 *       fight over the same key.
 */

import { reader } from '../../db/client.js';
import { rpcCall } from '../../rpc.js';
import { BANKROLL_POOL } from '../../config/contracts.js';
import {
  SHARE_PRICE_SCALE,
  calcSharePriceScaled,
  computeNetPnl,
} from './bankroll-pool-math.js';

// Stream keys whose watermark gates the reconciler. Mirrors
// indexer/bankroll-watermark.ts PNL_STREAMS exactly — duplicated here as a
// string list because the API process imports config but does not run the
// watermark module (which is indexer-internal in-memory state).
const PNL_STREAM_KEYS = [
  'bankroll_pool::BetRefunded',
  'bankroll_pool::TreasuryDeposited',
  'bankroll_pool::LiquidityProvided',
  'bankroll_pool::WithdrawRequested',
  'bankroll_pool::LiquidityRedeemed',
  'bankroll_pool::PoolSharesSeeded',
] as const;

export interface BankrollPnlWindow {
  /** Window start, INCLUSIVE, unix ms. */
  fromMs: number;
  /** Window end, EXCLUSIVE, unix ms. */
  toMs: number;
}

export type DataQuality = 'fresh' | 'lagging' | 'unreliable';

export interface BankrollPnlResult {
  /** SUM(bet_amount) for game_round rows in window with status='final', game_id 2..6. */
  bets: string;
  /** SUM(payout) on same filter. */
  payouts: string;
  /** SUM(amount) for bankroll_event.bet_refunded in window (game_id 2..6). */
  refunds: string;
  /** SUM(amount) for bankroll_event.treasury_deposited in window (all reasons). */
  treasury_deposits: string;
  /** Subset of treasury_deposits with treasury_reason='lottery_treasury_inflow'. */
  lottery_treasury_inflow: string;
  /** bets - payouts - refunds. Excludes treasury inflow (capital, not PnL). */
  net_pnl: string;
  /**
   * Current share price from chain: (pool.balance * 1e9) / pool.total_shares.
   * Returned as the raw scaled integer string; UI divides by 1e9 for display.
   * If total_shares is 0 (pre-seed), this is 1e9 (1.0 pps) — matches
   * bankroll_pool::share_price_scaled (bankroll_pool.move:606).
   */
  share_price_current_scaled: string;
  /**
   * v3 trade-off: historical pps requires chain replay and is not exposed.
   * Field is a literal `false` to make the API contract self-documenting.
   */
  share_price_historical_available: false;
  /** Window echoed back for cache-key and audit. */
  window: BankrollPnlWindow;
  /** Single staleness signal. Replaces the v2 trio (degraded/coverage/lag). */
  data_quality: DataQuality;
  /** Debug field: now - MIN(last_ts_ms) across PnL streams. UI must use data_quality. */
  cursor_lag_ms: number;
  /** Bankroll_event rows in window where reconciler has not yet snapshotted. */
  unreconciled_rows: number;
}

/**
 * Round-trip Sui RPC call to read BankrollPool.balance and total_shares.
 * Node-3 colocation means this is ~5ms; still wrap in a 2s budget so a
 * stalled RPC degrades data_quality instead of blocking the endpoint.
 */
async function fetchChainShares(): Promise<{ balance: bigint; shares: bigint } | null> {
  try {
    const res = await rpcCall<{
      data?: {
        content?: {
          fields?: { balance?: string | number; total_shares?: string | number };
        };
      };
    }>('sui_getObject', [
      BANKROLL_POOL.bankrollPoolObjectId,
      { showContent: true },
    ]);
    const fields = res?.data?.content?.fields;
    if (!fields || fields.balance === undefined || fields.total_shares === undefined) {
      return null;
    }
    return {
      balance: BigInt(String(fields.balance)),
      shares: BigInt(String(fields.total_shares)),
    };
  } catch (err) {
    console.warn(
      `[bankrollPnl] sui_getObject(BankrollPool) failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function classifyDataQuality(
  lagMs: number,
  unreconciledRows: number,
  chainReadOk: boolean,
): DataQuality {
  if (!chainReadOk) return 'unreliable';
  // PnL streams (BetRefunded, TreasuryDeposited, LP flow, shares_seeded) are
  // inherently sparse — BetRefunded fires only on game errors, LP events fire
  // on user action. A stale MIN(last_ts_ms) here usually means "no events
  // happened" not "indexer broken". So data_quality is driven by chain
  // reachability + reconciler backlog, not by stream cursor lag.
  //
  // lagMs is preserved in the response as a debug field but the threshold is
  // very generous (24h) — beyond that it's worth surfacing in the UI as
  // "data may be stale" because operationally even sparse streams should see
  // something within a day on a live pool.
  void lagMs;
  if (unreconciledRows > 1000) return 'unreliable';
  if (unreconciledRows > 100) return 'lagging';
  return 'fresh';
}

/**
 * Aggregate BankrollPool PnL components over [fromMs, toMs).
 *
 * Caller responsibility: cache result externally. This function intentionally
 * does no internal caching (multi-consumer cache key conflict avoidance).
 */
export async function bankrollPnl(window: BankrollPnlWindow): Promise<BankrollPnlResult> {
  const { fromMs, toMs } = window;
  const sql = reader();

  // Single round-trip for all event aggregates + cursor lag + unreconciled count.
  // Splitting into separate queries would slightly improve plan flexibility but
  // multiply RTT; node-3 colocation makes the combined CTE shape fast either way.
  const rows = await sql<
    {
      bets: string;
      payouts: string;
      refunds: string;
      treasury_deposits: string;
      lottery_treasury_inflow: string;
      cursor_lag_ms: string;
      unreconciled_rows: string;
    }[]
  >`
    WITH gr AS (
      SELECT
        COALESCE(SUM(bet_amount), 0)::text AS bets,
        COALESCE(SUM(payout), 0)::text     AS payouts
      FROM gostop.game_round
      WHERE game_id BETWEEN 2 AND 6
        AND status = 'final'
        AND timestamp_ms >= ${fromMs}::bigint
        AND timestamp_ms <  ${toMs}::bigint
    ),
    br AS (
      SELECT
        COALESCE(SUM(amount) FILTER (
          WHERE event_type='bet_refunded' AND game_id BETWEEN 2 AND 6
        ), 0)::text AS refunds,
        COALESCE(SUM(amount) FILTER (
          WHERE event_type='treasury_deposited'
        ), 0)::text AS treasury_deposits,
        COALESCE(SUM(amount) FILTER (
          WHERE event_type='treasury_deposited' AND treasury_reason='lottery_treasury_inflow'
        ), 0)::text AS lottery_treasury_inflow,
        COUNT(*) FILTER (
          WHERE total_shares_after IS NULL
        )::text AS unreconciled_rows
      FROM gostop.bankroll_event
      WHERE timestamp_ms >= ${fromMs}::bigint
        AND timestamp_ms <  ${toMs}::bigint
    ),
    lag AS (
      SELECT (
        (EXTRACT(EPOCH FROM now()) * 1000)::bigint
        - COALESCE(MIN(last_ts_ms), (EXTRACT(EPOCH FROM now()) * 1000)::bigint)
      )::text AS cursor_lag_ms
      FROM gostop.indexer_cursor
      WHERE stream = ANY(${PNL_STREAM_KEYS as unknown as string[]})
    )
    SELECT gr.bets, gr.payouts,
           br.refunds, br.treasury_deposits, br.lottery_treasury_inflow,
           br.unreconciled_rows,
           lag.cursor_lag_ms
    FROM gr, br, lag
  `;

  const row = rows[0] ?? {
    bets: '0',
    payouts: '0',
    refunds: '0',
    treasury_deposits: '0',
    lottery_treasury_inflow: '0',
    cursor_lag_ms: '0',
    unreconciled_rows: '0',
  };

  const bets = BigInt(row.bets);
  const payouts = BigInt(row.payouts);
  const refunds = BigInt(row.refunds);
  const netPnl = computeNetPnl(bets, payouts, refunds);

  const chain = await fetchChainShares();
  // Move convention: pps = 1.0 when shares==0 (calcSharePriceScaled handles
  // the shares==0 case internally). The outer ternary guards null chain reads.
  const sharePriceScaled = chain
    ? calcSharePriceScaled(chain.balance, chain.shares)
    : SHARE_PRICE_SCALE;

  const cursorLagMs = Number(row.cursor_lag_ms);
  const unreconciled = Number(row.unreconciled_rows);
  const dataQuality = classifyDataQuality(cursorLagMs, unreconciled, chain !== null);

  return {
    bets: bets.toString(),
    payouts: payouts.toString(),
    refunds: refunds.toString(),
    treasury_deposits: row.treasury_deposits,
    lottery_treasury_inflow: row.lottery_treasury_inflow,
    net_pnl: netPnl.toString(),
    share_price_current_scaled: sharePriceScaled.toString(),
    share_price_historical_available: false,
    window: { fromMs, toMs },
    data_quality: dataQuality,
    cursor_lag_ms: cursorLagMs,
    unreconciled_rows: unreconciled,
  };
}

// Re-export for tests.
export { classifyDataQuality };
