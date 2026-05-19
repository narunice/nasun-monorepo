/**
 * BankrollPool total_shares snapshot reconciler.
 *
 * Walks `gostop.bankroll_event` rows where `total_shares_after IS NULL`,
 * applies the per-event shares delta, and persists the running total back
 * to the row. Allows bankrollPnl() to look up `total_shares_after` for any
 * historical timestamp without re-deriving from scratch.
 *
 * Invariants:
 *   1. Watermark gating — rows are reconciled only when their `timestamp_ms`
 *      is at or below `getBankrollWatermarkMs()`, the in-memory MIN across
 *      every PnL stream. This guarantees no future arrival can land at an
 *      earlier timestamp than rows we've already snapshotted.
 *   2. Tie-break ordering — within the same `timestamp_ms`, events are
 *      processed in a fixed event_type priority (treasury_deposited <
 *      bet_refunded < lp flow < shares_seeded < ...). This eliminates the
 *      "seed before treasury" hazard where total_shares_after could briefly
 *      reflect seed shares against zero balance.
 *   3. Idempotent — the partial index `idx_bre_unsnapshotted` covers only
 *      rows with NULL snapshot. Re-running on a fully-reconciled table is
 *      a no-op.
 *   4. Bounded transaction — 50 rows per batch, 20 batches per tick max.
 *      Each batch is its own transaction so `statement_timeout = 30s`
 *      (db/client.ts:21) cannot trip even under backlog pressure.
 *
 * Plan: ~/.claude/plans/tier1-chunk2-bankroll-pnl-sot.md v3 §3.F.
 */

import { writer } from '../db/client.js';
import { getBankrollWatermarkMs } from './bankroll-watermark.js';

const BATCH_SIZE = 50;
const MAX_BATCHES_PER_TICK = 20;

interface RowToReconcile {
  id: string;          // BIGSERIAL → ::text
  event_type: string;
  amount: string;      // NUMERIC(30,0) → ::text
  shares: string | null;
}

/**
 * Pure-function delta. Exported for vitest. Applies one event's shares
 * mutation to the running total and returns the new value. Unknown
 * event_types carry shares forward (no-op). Negative results are returned
 * unchanged so the caller can log + persist them (reconciler does the
 * warn+continue; tests assert the math).
 */
export function applySharesDelta(
  currentShares: bigint,
  eventType: string,
  eventShares: bigint | null,
): bigint {
  const sh = eventShares ?? 0n;
  switch (eventType) {
    case 'liquidity_provided':  return currentShares + sh;
    case 'liquidity_redeemed':  return currentShares - sh;
    case 'shares_seeded':       return currentShares + sh;
    // Carry-forward types: snapshot consistency requires writing the row,
    // but shares are unchanged.
    case 'bet_refunded':
    case 'treasury_deposited':
    case 'withdraw_requested':
    case 'cap_updated':
      return currentShares;
    default:
      return currentShares;
  }
}

/**
 * Pure-function event ordering priority (lower = earlier within same
 * timestamp_ms). Mirrors the SQL CASE in the reconciler query so unit
 * tests can verify priority without spinning up Postgres.
 *
 * Rationale: treasury_deposited must process before shares_seeded so the
 * bootstrap intermediate state never persists `shares > 0` against
 * `balance == 0`. See plan v3 §3.F.
 */
export function eventTypePriority(eventType: string): number {
  switch (eventType) {
    case 'treasury_deposited': return 0;
    case 'bet_refunded':       return 1;
    case 'liquidity_provided': return 2;
    case 'liquidity_redeemed': return 3;
    case 'shares_seeded':      return 4;
    case 'withdraw_requested': return 5;
    case 'cap_updated':        return 6;
    default:                   return 99;
  }
}

function isKnownEventType(t: string): boolean {
  return eventTypePriority(t) < 99;
}

/**
 * Walk unsnapshotted rows up to the current watermark and fill their
 * `total_shares_after`. Returns total rows persisted across all batches in
 * this invocation.
 */
export async function reconcileBankrollSnapshots(): Promise<number> {
  const watermarkTs = getBankrollWatermarkMs();
  if (watermarkTs === 0n) {
    // Not every PnL stream has reported yet (cold start). Wait.
    return 0;
  }

  const sql = writer();
  let totalReconciled = 0;

  for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch++) {
    const processed = await sql.begin(async (txRaw) => {
      // TransactionSql<{}> drops call-signature typing via Omit<Sql>; cast
      // back for tagged-template + helper invocation. Pattern from
      // network-explorer/api-server/src/routes/nasun-metrics.ts:163.
      const tx = txRaw as unknown as typeof sql;
      // Previous reconciled snapshot becomes the starting state.
      const prev = await tx<{ shares: string; id: string }[]>`
        SELECT total_shares_after::text AS shares, id::text
        FROM gostop.bankroll_event
        WHERE total_shares_after IS NOT NULL
        ORDER BY timestamp_ms DESC, id DESC
        LIMIT 1
      `;
      let shares = prev[0] ? BigInt(prev[0].shares) : 0n;
      const fromId = prev[0] ? BigInt(prev[0].id) : 0n;

      // Within the same timestamp_ms, event_type priority resolves the
      // ordering hazard documented in the file header. SQL CASE keeps the
      // priority list close to the SELECT for review readability.
      const rows = await tx<RowToReconcile[]>`
        SELECT id::text, event_type,
               amount::text AS amount,
               shares::text AS shares
        FROM gostop.bankroll_event
        WHERE total_shares_after IS NULL
          AND timestamp_ms <= ${watermarkTs.toString()}::bigint
          AND id > ${fromId.toString()}::bigint
        ORDER BY timestamp_ms ASC,
                 CASE event_type
                   WHEN 'treasury_deposited' THEN 0
                   WHEN 'bet_refunded'       THEN 1
                   WHEN 'liquidity_provided' THEN 2
                   WHEN 'liquidity_redeemed' THEN 3
                   WHEN 'shares_seeded'      THEN 4
                   WHEN 'withdraw_requested' THEN 5
                   WHEN 'cap_updated'        THEN 6
                   ELSE 99
                 END ASC,
                 id ASC
        LIMIT ${BATCH_SIZE}
      `;
      if (rows.length === 0) return 0;

      for (const r of rows) {
        const sh = r.shares !== null ? BigInt(r.shares) : 0n;
        const known = isKnownEventType(r.event_type);
        if (!known) {
          // Defensive: single-writer guarantee in streams/bankroll-pool.ts
          // already filters this. A log here flags a regression.
          console.warn(`[bankroll-reconciler] unknown event_type=${r.event_type} id=${r.id}`);
        }
        shares = applySharesDelta(shares, r.event_type, sh);
        if (shares < 0n) {
          // Impossible under correct chain semantics. Surface for triage but
          // do not crash — N6 (plan v3 §3.F): single-writer + idempotent
          // INSERT make this an indicator of a bootstrap edge case, not a
          // production accounting bug. Manual drift check (plan §3.G) verifies.
          console.warn(
            `[bankroll-reconciler] negative shares at id=${r.id} type=${r.event_type} ` +
            `delta_shares=${sh.toString()} new_shares=${shares.toString()}`,
          );
        }
        await tx`
          UPDATE gostop.bankroll_event
          SET total_shares_after = ${shares.toString()}::numeric
          WHERE id = ${r.id}::bigint
        `;
      }
      return rows.length;
    });

    totalReconciled += processed;
    // Caught up — either fewer rows than batch size or zero rows.
    if (processed < BATCH_SIZE) break;
  }

  return totalReconciled;
}
