/**
 * Enforces the daily category cap for the five writers that need it: one
 * base_points row per (identity, category, UTC day).
 *
 * Those five credit base points concurrently: processBatch, scanFaucetClaims
 * and scanChatParticipation inside scanLoop, plus reconcileTodayForIdentity
 * (dashboard refresh button, wallet-registered webhook) and reconcileFromRpc
 * (nightly safety net) at arbitrary times.
 *
 * scanWalletTransfersViaIndexer is a sixth base_points writer and does not go
 * through here: its tx_digest is `wt:{identity}:{date}`, so one row per
 * identity per day is already all the UNIQUE constraint will accept. The same
 * is true of the chat rows (`chat:{wallet}:{date}`) and of the wallet-transfer
 * rows reconcileTodayForIdentity writes, which is why the cap bites hardest on
 * the digest-keyed event and faucet rows.
 *
 * Every earlier attempt enforced the cap in process memory, where each writer
 * decided from a snapshot of activity_points taken seconds to hours before its
 * own INSERT. c572b413d, 41c285946, 806d1f286 and 350a90723 each closed one
 * way for that snapshot to disagree with the table, and ~8 duplicate credits a
 * day survived all four: a refresh-button insert at 13:45:51 was followed 21
 * seconds later by the scanner crediting the same category from a different
 * transaction. The digests differ, so ON CONFLICT (tx_digest, activity_type,
 * event_seq) is no backstop.
 *
 * Sharing one in-memory Set between the writers was tried and abandoned (see
 * the fix/daily-cap-race-wip branch): it needs optimistic marking, and
 * rolling a mark back by deleting a key cannot tell its own mark from the one
 * another writer just set, which risks either permanent point loss or
 * uncorrectable over-crediting. Ecosystem points are monotonic, so an extra
 * row cannot be removed afterwards.
 *
 * So the check belongs in the write itself, against the table, in the same
 * statement. A unique index would be stronger still, but the historical
 * duplicate rows cannot be deleted, so the constraint cannot be created.
 */

import { pointsDb } from '../db.js';
import type { PointsInsert } from './referral-bonus.js';

/** A capped row always belongs to an identity: the cap is per identity. */
export type CappedPointsInsert = PointsInsert & { identity_id: string };

// Serializes the check-and-insert across all five writers. The NOT EXISTS
// below reads the statement's snapshot, so without this two statements that
// overlap by milliseconds can both find the day empty and both insert. Held
// as an xact lock inside begin(), so it is released on commit or rollback and
// cannot leak the way a session lock does when postgres.js hands the release
// to a different pooled connection. Waiting happens inside a statement, so
// the 30s statement_timeout bounds it.
// Distinct from ADVISORY_LOCK_KEY in scripts/backfill-snapshot-day.ts, the
// only other advisory lock taken on this database.
const CAP_LOCK_KEY = 4824671924n;

// One statement per chunk, to keep a large nightly reconcile inside the 30s
// statement_timeout. Chunking means a throw part-way through leaves the
// earlier chunks committed, which is the right side to fail on: the rows are
// forward-only and idempotent, so a partial run is closer to complete than a
// rolled-back one, and the cap stops the next run re-crediting what landed.
// Only reconcileFromRpc can exceed one chunk (BATCH_SIZE is 1000 and the
// faucet query is LIMIT 500). Each row costs one index probe on
// idx_ap_identity_timestamp (~0.03ms measured on box at 18M rows), so this is
// well inside the budget; unnest passes each column as a single parameter, so
// the 65535 bound-parameter cap is not in play.
const CHUNK_SIZE = 5000;

function utcDayStartMs(ts: Date): number {
  return Math.floor(ts.getTime() / 86_400_000) * 86_400_000;
}

/**
 * Insert rows that the daily cap still allows, and return how many landed.
 *
 * A row is dropped when activity_points already holds an unflagged,
 * point-carrying row for the same identity and category inside the UTC day of
 * that row's own tx_timestamp. The day comes from the row, not from the clock,
 * so a re-scan of historical events caps each day separately instead of
 * collapsing a category's whole history into one row.
 */
export async function insertDailyCappedPoints(
  rows: readonly CappedPointsInsert[],
): Promise<number> {
  if (!pointsDb || rows.length === 0) return 0;

  // A statement cannot see its own inserts, so two rows for the same
  // (identity, category, day) would both pass the NOT EXISTS. Keep the first,
  // which is the earliest event for the forward scanners and the one each
  // reconcile path already picked for itself.
  const deduped: CappedPointsInsert[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const dayStartMs = utcDayStartMs(row.tx_timestamp);
    const key = `${row.identity_id}::${row.category}::${dayStartMs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  let inserted = 0;
  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);
    const dayStarts = chunk.map((r) => utcDayStartMs(r.tx_timestamp));

    // ISO strings rather than Date objects: postgres.js 3.x serializes a
    // Date[] in a way PG rejects for timestamptz[] ("cannot cast type
    // timestamp with time zone to timestamp with time zone[]").
    // READ COMMITTED is stated rather than inherited. The cap needs the
    // INSERT's snapshot to be taken after the lock is granted, which is what
    // READ COMMITTED does per statement. Under REPEATABLE READ the snapshot
    // would instead be fixed by the lock statement itself, so a queued writer
    // would read the table as it was before the writer ahead of it committed
    // and re-open the duplicate credit, with no error to show for it.
    inserted += await pointsDb.begin('ISOLATION LEVEL READ COMMITTED', async (txRaw) => {
      // postgres.js TransactionSql drops call-signature typing via Omit<Sql>;
      // cast back to recover the tagged-template signature (same pattern as
      // routes/nasun-metrics.ts).
      const tx = txRaw as unknown as NonNullable<typeof pointsDb>;
      await tx`SELECT pg_advisory_xact_lock(${String(CAP_LOCK_KEY)}::bigint)`;
      const res = await tx`
        INSERT INTO activity_points
          (wallet_address, identity_id, tx_digest, tx_sequence_number,
           category, activity_type, base_points, volume_tier,
           genesis_multiplier, final_points, tx_timestamp, event_seq)
        SELECT v.wallet_address, v.identity_id, v.tx_digest, v.tx_sequence_number,
               v.category, v.activity_type, v.base_points, v.volume_tier,
               v.genesis_multiplier, v.final_points, v.tx_timestamp, v.event_seq
        FROM unnest(
          ${chunk.map((r) => r.wallet_address)}::text[],
          ${chunk.map((r) => r.identity_id)}::text[],
          ${chunk.map((r) => r.tx_digest)}::text[],
          ${chunk.map((r) => r.tx_sequence_number)}::bigint[],
          ${chunk.map((r) => r.category)}::text[],
          ${chunk.map((r) => r.activity_type)}::text[],
          ${chunk.map((r) => r.base_points)}::numeric[],
          ${chunk.map((r) => r.volume_tier)}::numeric[],
          ${chunk.map((r) => r.genesis_multiplier)}::numeric[],
          ${chunk.map((r) => Number(r.final_points))}::numeric[],
          ${chunk.map((r) => r.tx_timestamp.toISOString())}::timestamptz[],
          ${chunk.map((r) => r.event_seq)}::int[],
          ${dayStarts.map((ms) => new Date(ms).toISOString())}::timestamptz[],
          ${dayStarts.map((ms) => new Date(ms + 86_400_000).toISOString())}::timestamptz[]
        ) AS v(wallet_address, identity_id, tx_digest, tx_sequence_number,
               category, activity_type, base_points, volume_tier,
               genesis_multiplier, final_points, tx_timestamp, event_seq,
               day_start, day_end)
        WHERE NOT EXISTS (
          SELECT 1 FROM activity_points a
          WHERE a.identity_id = v.identity_id
            AND a.category = v.category
            AND a.tx_timestamp >= v.day_start
            AND a.tx_timestamp < v.day_end
            AND a.base_points > 0
            AND NOT a.flagged
        )
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      return res.count;
    });
  }

  return inserted;
}
