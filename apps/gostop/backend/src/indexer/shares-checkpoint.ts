/**
 * Incremental chain-vs-DB share divergence, anchored on a checkpoint.
 *
 * The question the divergence alert wants answered is "did the indexer miss a
 * share-affecting event". The previous answer replayed every event since
 * genesis into `bankroll_event.total_shares_after` and compared the tail to
 * chain. That cannot work, for two reasons that are really one:
 *
 *   A cumulative sum needs a total order, but six independent streams insert
 *   out of order behind a watermark that is the MIN across them. The
 *   reconciler kept the sum monotonic by only scanning `id > fromId`, so any
 *   row the watermark held back was stepped over and never revisited. Thirteen
 *   rows from 2026-06-07..06-20 sat stuck that way.
 *
 *   And a sum from genesis carries every past discrepancy forever. The v8
 *   fresh genesis on 2026-06-19 created a new pool object, but `shares_seeded`
 *   is additive, so its 100e9 seed landed on top of the retired chain's
 *   ~11.3e12 instead of starting over. That is the entire 2.67x gap measured on
 *   2026-09-27: DB 17,895,434,554,337 against chain 6,700,394,818,316.
 *
 * A sum of deltas is order independent, which is the whole fix. Given the chain
 * count and newest event id at the last agreement, the chain's movement since
 * then must equal the summed deltas of the events indexed since then. No
 * historically correct series is required, a missed event shows up within one
 * tick, and a chain reset is a non-event: a fresh genesis is a new pool object,
 * so it gets its own checkpoint row and its own series.
 *
 * Indexer lag looks like divergence here, because the chain can move before the
 * events land. The caller must therefore require the same (chain, expected)
 * pair on two consecutive ticks; a lagging indexer produces a different pair
 * each time as the deltas catch up. See drift-keeper's confirmDivergence.
 */

import { reader, writer } from '../db/client.js';

/** The only event types whose `shares` moves the pool's total. */
const SHARE_AFFECTING_EVENT_TYPES = [
  'liquidity_provided',
  'liquidity_redeemed',
  'shares_seeded',
] as const;

export interface SharesComparison {
  /** What the checkpoint plus the deltas indexed since it says chain should hold. */
  expectedShares: bigint;
  /** Summed share deltas over events newer than the checkpoint. */
  deltaSinceCheckpoint: bigint;
  /** Newest bankroll_event id this comparison covered. */
  latestEventId: bigint;
  /** Chain count recorded at the checkpoint this compared against. */
  checkpointShares: bigint;
  /** Event id recorded at that checkpoint. */
  checkpointEventId: bigint;
}

/**
 * Compare the chain count against the checkpoint plus indexed deltas.
 *
 * Returns null when there was no checkpoint for this pool and one was anchored
 * instead. Anchoring trusts the chain by definition, so the first tick after a
 * fresh genesis (or after this shipped) establishes a baseline rather than
 * reporting the whole history as a gap.
 */
export async function compareShares(
  poolObjectId: string,
  chainShares: bigint,
): Promise<SharesComparison | null> {
  const sql = reader();

  const [cp] = await sql<{ chain_shares: string; last_event_id: string }[]>`
    SELECT chain_shares::text, last_event_id::text
    FROM gostop.bankroll_shares_checkpoint
    WHERE pool_object_id = ${poolObjectId}
  `;

  // One statement so the delta sum and the id it covers come from the same
  // snapshot. Reading them separately would let an event land in between and be
  // skipped by the next advance.
  //
  // Two CTEs rather than one aggregate with a FILTER, so each side can use an
  // index: `d` rides migration 008's partial index on (id) over the three
  // share-affecting types, `m` rides the primary key. A single filtered
  // aggregate has no statement-level WHERE and scans all ~4.5M rows every tick.
  const [agg] = await sql<{ delta: string; latest_id: string }[]>`
    WITH d AS (
      SELECT COALESCE(SUM(
        CASE event_type
          WHEN 'liquidity_provided' THEN shares
          WHEN 'shares_seeded'      THEN shares
          WHEN 'liquidity_redeemed' THEN -shares
          ELSE 0
        END
      ), 0) AS delta
      FROM gostop.bankroll_event
      WHERE event_type = ANY(${SHARE_AFFECTING_EVENT_TYPES as unknown as string[]})
        AND id > ${cp ? cp.last_event_id : '0'}::bigint
    ),
    m AS (
      SELECT COALESCE(MAX(id), 0) AS latest_id FROM gostop.bankroll_event
    )
    SELECT d.delta::text AS delta, m.latest_id::text AS latest_id
    FROM d CROSS JOIN m
  `;

  const latestEventId = BigInt(agg?.latest_id ?? '0');

  if (!cp) {
    await advanceCheckpoint(poolObjectId, chainShares, latestEventId);
    console.log(
      `[shares-checkpoint] anchored pool=${poolObjectId} shares=${chainShares} event_id=${latestEventId}`,
    );
    return null;
  }

  const checkpointShares = BigInt(cp.chain_shares);
  const deltaSinceCheckpoint = BigInt(agg?.delta ?? '0');
  return {
    expectedShares: checkpointShares + deltaSinceCheckpoint,
    deltaSinceCheckpoint,
    latestEventId,
    checkpointShares,
    checkpointEventId: BigInt(cp.last_event_id),
  };
}

/**
 * Record an agreement. Only called when chain and expected match, so the
 * checkpoint never advances over a gap and a real miss keeps being reported
 * until someone resolves it.
 */
export async function advanceCheckpoint(
  poolObjectId: string,
  chainShares: bigint,
  latestEventId: bigint,
): Promise<void> {
  const sql = writer();
  await sql`
    INSERT INTO gostop.bankroll_shares_checkpoint
      (pool_object_id, chain_shares, last_event_id, observed_at)
    VALUES (
      ${poolObjectId},
      ${chainShares.toString()}::numeric,
      ${latestEventId.toString()}::bigint,
      now()
    )
    ON CONFLICT (pool_object_id) DO UPDATE
      SET chain_shares  = EXCLUDED.chain_shares,
          last_event_id = EXCLUDED.last_event_id,
          observed_at   = EXCLUDED.observed_at
  `;
}

/** Test-only. The share-affecting set, mirrored in the SQL above. */
export const _SHARE_AFFECTING_EVENT_TYPES = SHARE_AFFECTING_EVENT_TYPES;
