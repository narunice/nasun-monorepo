/**
 * In-memory watermark tracking for the bankroll_event reconciler.
 *
 * Why in-memory (not DB cursor MIN()):
 *   - Indexer is single-process; no cross-process coordination needed.
 *   - Sparse PnL streams (e.g. LiquidityProvided pre-LP-UI) have no
 *     gostop.indexer_cursor row, so a SQL `MIN(last_ts_ms)` silently
 *     omits them and the watermark drifts ahead of unobserved streams.
 *     In-memory state is updated by _runner.ts heartbeat on EVERY tick
 *     including empty pages, so sparse streams contribute Date.now() and
 *     do not freeze the watermark.
 *   - Crash recovery is automatic: on indexer boot, the map is empty
 *     (watermark = 0n → reconciler waits), and after the first tick of
 *     each PnL stream the watermark is rebuilt from chain head.
 *
 * Plan reference: ~/.claude/plans/tier1-chunk2-bankroll-pnl-sot.md v3 §3.E.
 */

import type { StreamKey } from '../config/contracts.js';

/**
 * PnL-affecting bankroll_pool streams. Reconciler waits until every stream
 * in this list has reported a watermark (in-memory or via heartbeat) before
 * advancing snapshots past a given timestamp.
 *
 * NOTE: BetCollected / WinnerPaid are NOT in this list — bet/payout PnL is
 * derived from gostop.game_round (game_id IN 2..6) per plan v3 §3.A.
 * UtilizationCapUpdated is admin-visibility only, not PnL-affecting.
 */
export const PNL_STREAMS: readonly StreamKey[] = [
  'bankroll_pool::BetRefunded',
  'bankroll_pool::TreasuryDeposited',
  'bankroll_pool::LiquidityProvided',
  'bankroll_pool::WithdrawRequested',
  'bankroll_pool::LiquidityRedeemed',
  'bankroll_pool::PoolSharesSeeded',
];

const lastSeenMs: Map<StreamKey, bigint> = new Map();

/**
 * Record a stream's latest observed timestamp. Called by the stream's
 * runStream invocation:
 *   - For non-empty pages: tsMs = last envelope's chain timestamp.
 *   - For empty pages: tsMs = Date.now() (heartbeat — confirms the stream
 *     is caught up to chain head, even if it has no events yet).
 *
 * Monotonic: smaller updates are ignored to prevent regression from a
 * later page reporting an older timestamp.
 */
export function updateStreamWatermark(stream: StreamKey, tsMs: bigint): void {
  const prev = lastSeenMs.get(stream) ?? 0n;
  if (tsMs > prev) lastSeenMs.set(stream, tsMs);
}

/**
 * Returns the bankroll watermark = min(lastSeenMs across PNL_STREAMS).
 *
 * Returns 0n until EVERY stream in PNL_STREAMS has reported at least once.
 * Reconciler treats 0n as "not ready" and returns without doing work, so
 * cold-start does not produce partial snapshots.
 */
export function getBankrollWatermarkMs(): bigint {
  let min: bigint | null = null;
  for (const s of PNL_STREAMS) {
    const v = lastSeenMs.get(s);
    if (v === undefined || v === 0n) return 0n;
    if (min === null || v < min) min = v;
  }
  return min ?? 0n;
}

/**
 * Debug snapshot of all stream watermarks. Used by transparency endpoint
 * for the cursor_lag_ms field and by ops diagnostics.
 */
export function getBankrollWatermarkSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of PNL_STREAMS) {
    out[s] = (lastSeenMs.get(s) ?? 0n).toString();
  }
  return out;
}

/**
 * Test-only reset. Vitest uses this in beforeEach to isolate fixtures.
 * Production code must never call this.
 */
export function _resetBankrollWatermarkForTests(): void {
  lastSeenMs.clear();
}
