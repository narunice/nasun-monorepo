/**
 * BankrollPool PnL Source of Truth (SoT) — HG5 stub.
 *
 * Single aggregator that both /api/gostop/lp/apy (Tier 1.2) and
 * routes/transparency.ts Risk Dashboard (Tier 1.3) MUST call. Two parallel
 * implementations would diverge at the first edge case (refund attribution,
 * inclusive/exclusive window bounds, share-price interpolation). Lock the
 * interface here before any consumer is written; back it with a unit test
 * that asserts a fixed window returns identical numbers when called by APY
 * and Risk Dashboard code paths.
 *
 * Materialization is deferred to Tier 1.0 spike (lp-gap-analysis.md):
 *   - refunds source — gostop.game_round.status='refunded' covers crash only;
 *     bankroll_pool::BetRefunded events do not currently write a game_round
 *     row. Spike must decide: (a) backfill refunds into game_round with
 *     status='refunded' and payout=0, or (b) maintain a separate
 *     gostop.bankroll_refund ledger.
 *   - treasury_deposits source — bankroll_pool deposit/seed/LP events are
 *     not yet indexed. Spike adds the indexer stream + a new table
 *     (likely gostop.bankroll_event or migration 004 lp_history).
 *   - share-price snapshots — pps = treasury / total_shares at a given ms.
 *     Spike decides whether to snapshot per round (cheap, frequent) or per
 *     bankroll_event (sparse, exact). Interpolation rule for arbitrary
 *     fromMs / toMs must be documented.
 *   - status filter — bets count only when status IN ('final',
 *     'unclaimed_expired'); pending rows must NOT be aggregated (they
 *     mutate retroactively).
 *
 * Window semantics (locked):
 *   - fromMs INCLUSIVE, toMs EXCLUSIVE  (timestamp_ms >= fromMs AND < toMs)
 *   - rationale: chaining adjacent windows must not double-count round on
 *     the boundary. Same convention as ecosystem-points snapshot windows.
 *
 * Numeric representation:
 *   - All monetary amounts are NUSDC base units (6 decimals) as bigint-
 *     compatible strings. Callers MUST NOT coerce to Number for math — APY
 *     denominators exceed 2^53 easily once TVL grows.
 *   - share_price is decimal-string. Convention matches
 *     bankroll_pool::share_price_scaled (bankroll_pool.move:487): the u128
 *     value `(pool.balance × 1e9) / total_shares`, where 1_000_000_000 = 1.0.
 *     Backend serializes as the raw scaled integer string; UI divides by 1e9
 *     for display.
 */

export interface BankrollPnlWindow {
  /** Window start, INCLUSIVE, unix ms. */
  fromMs: number;
  /** Window end, EXCLUSIVE, unix ms. */
  toMs: number;
}

export interface BankrollPnlResult {
  /** SUM(bet_amount) for game_round rows in window with terminal status. */
  bets: string;
  /** SUM(payout) for game_round rows in window with terminal status. */
  payouts: string;
  /** SUM(refunded amount) — see spike note on refunds source. */
  refunds: string;
  /** Treasury deposits (admin seed + LP deposit) crediting bankroll in window. */
  treasury_deposits: string;
  /** bets - payouts - refunds, BEFORE LP cash flow. House gross PnL only. */
  net_pnl: string;
  /** pps at fromMs (or nearest snapshot ≤ fromMs). Decimal-string. */
  share_price_start: string;
  /** pps at toMs (or nearest snapshot ≤ toMs). Decimal-string. */
  share_price_end: string;
  /** Window echoed back for cache-key and audit. */
  window: BankrollPnlWindow;
  /** Indexer cursor lag at compute time, ms. Callers can warn if stale. */
  cursor_lag_ms: number;
}

/**
 * Aggregate BankrollPool PnL over [fromMs, toMs).
 *
 * Stub — Tier 1.0 spike implements. Callers that land before spike must
 * surface a clear "LP metrics not yet available" state, not silent zeroes.
 */
export async function bankrollPnl(_window: BankrollPnlWindow): Promise<BankrollPnlResult> {
  throw new Error(
    'bankrollPnl not yet implemented — blocked on Tier 1.0 spike (HG5). ' +
    'See apps/gostop/docs/lp-gap-analysis.md.'
  );
}
